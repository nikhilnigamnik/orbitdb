import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UPDATE_STATE_CHANNEL } from '../../../src/shared/types'

// Hoisted above the imports, so the emitter has to be loaded here rather than
// through a static import that is not initialised yet when this runs.
const stub = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  const sent: { channel: string; state: { phase: string; percent: number } }[] = []
  return {
    isPackaged: true,
    sent,
    windows: [
      {
        isDestroyed: () => false,
        webContents: {
          send: (channel: string, state: { phase: string; percent: number }) => {
            sent.push({ channel, state })
          }
        }
      }
    ],
    checkResult: null as null | { isUpdateAvailable: boolean; updateInfo: { version: string } },
    download: null as null | (() => Promise<string[]>),
    emitter: new EventEmitter(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn()
  }
})

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return stub.isPackaged
    }
  },
  BrowserWindow: { getAllWindows: () => stub.windows }
}))

vi.mock('electron-updater', () => ({
  autoUpdater: Object.assign(stub.emitter, {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    logger: {},
    checkForUpdates: stub.checkForUpdates,
    downloadUpdate: stub.downloadUpdate,
    quitAndInstall: stub.quitAndInstall
  })
}))

const realPlatform = process.platform

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

async function load() {
  vi.resetModules()
  return import('../../../src/main/app/updater')
}

beforeEach(() => {
  stub.isPackaged = true
  stub.sent.length = 0
  stub.checkResult = { isUpdateAvailable: true, updateInfo: { version: '0.4.0' } }
  stub.download = () => Promise.resolve([])
  stub.emitter.removeAllListeners()
  stub.checkForUpdates.mockReset().mockImplementation(async () => stub.checkResult)
  stub.downloadUpdate.mockReset().mockImplementation(() => stub.download!())
  stub.quitAndInstall.mockReset()
  delete process.env.APPIMAGE
  setPlatform('win32')
})

afterEach(() => {
  setPlatform(realPlatform)
})

describe('where an update can be installed', () => {
  it('is in-app on Windows and on a Linux AppImage, by hand everywhere else', async () => {
    const { installSupportFor } = await load()
    const base = { isPackaged: true, isAppImage: false, isMacSigned: false }
    expect(installSupportFor({ ...base, platform: 'win32' })).toBe('in-app')
    expect(installSupportFor({ ...base, platform: 'linux', isAppImage: true })).toBe('in-app')
    expect(installSupportFor({ ...base, platform: 'linux' }), 'a .deb cannot replace itself').toBe(
      'manual'
    )
    expect(installSupportFor({ ...base, platform: 'darwin' })).toBe('manual')
    expect(installSupportFor({ ...base, platform: 'darwin', isMacSigned: true })).toBe('in-app')
    expect(installSupportFor({ ...base, platform: 'win32', isPackaged: false })).toBe('manual')
  })

  it('keeps the macOS flag in step with the builder config', async () => {
    // Squirrel.Mac refuses an unsigned bundle. While electron-builder.yml says
    // the build is unsigned, the app must not offer an install on the Mac.
    const { IS_MAC_BUILD_SIGNED } = await load()
    const config = readFileSync('electron-builder.yml', 'utf8')
    const isUnsigned = /^\s*identity:\s*null\s*$/m.test(config)
    expect(IS_MAC_BUILD_SIGNED).toBe(!isUnsigned)
  })

  it('reads the AppImage marker the Linux runtime sets', async () => {
    setPlatform('linux')
    const { updateInstallSupport } = await load()
    expect(updateInstallSupport()).toBe('manual')
    process.env.APPIMAGE = '/home/me/OrbitDB.AppImage'
    expect(updateInstallSupport()).toBe('in-app')
  })
})

describe('downloading', () => {
  it('checks, starts the download, and pushes progress to every window', async () => {
    let finish: () => void = () => undefined
    stub.download = () =>
      new Promise<string[]>((resolve) => {
        finish = () => resolve(['OrbitDB-setup.exe'])
      })
    const { startUpdateDownload, getUpdateDownloadState } = await load()

    const started = await startUpdateDownload()
    expect(started.phase).toBe('downloading')
    expect(started.version).toBe('0.4.0')
    expect(stub.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(stub.downloadUpdate).toHaveBeenCalledTimes(1)

    stub.emitter.emit('download-progress', { percent: 42.5, transferred: 425, total: 1000 })
    expect(getUpdateDownloadState()).toMatchObject({
      phase: 'downloading',
      percent: 42.5,
      transferredBytes: 425,
      totalBytes: 1000
    })

    stub.emitter.emit('update-downloaded', { version: '0.4.0' })
    finish()
    expect(getUpdateDownloadState()).toMatchObject({ phase: 'downloaded', percent: 100 })

    const channels = new Set(stub.sent.map((s) => s.channel))
    expect(channels).toEqual(new Set([UPDATE_STATE_CHANNEL]))
    expect(stub.sent.map((s) => s.state.phase)).toEqual([
      'downloading',
      'downloading',
      'downloading',
      'downloaded'
    ])
  })

  it('turns the updater off by default so nothing moves without a click', async () => {
    const { startUpdateDownload } = await load()
    await startUpdateDownload()
    const au = stub.emitter as unknown as { autoDownload: boolean; autoInstallOnAppQuit: boolean }
    expect(au.autoDownload).toBe(false)
    expect(au.autoInstallOnAppQuit).toBe(false)
  })

  it('refuses on a build that cannot install, without touching the network', async () => {
    setPlatform('darwin')
    const { startUpdateDownload } = await load()
    await expect(startUpdateDownload()).rejects.toThrow(/cannot install updates itself/)
    expect(stub.checkForUpdates).not.toHaveBeenCalled()
  })

  it('reports being up to date when the manifest has nothing newer', async () => {
    stub.checkResult = { isUpdateAvailable: false, updateInfo: { version: '0.3.1' } }
    const { startUpdateDownload } = await load()
    const state = await startUpdateDownload()
    expect(state.phase).toBe('error')
    expect(state.error).toMatch(/already on the latest/)
    expect(stub.downloadUpdate).not.toHaveBeenCalled()
  })

  it('surfaces a failed download as an error state rather than a hang', async () => {
    stub.download = () => Promise.reject(new Error('ENOTFOUND github.com'))
    const { startUpdateDownload, getUpdateDownloadState } = await load()
    await startUpdateDownload()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getUpdateDownloadState()).toMatchObject({
      phase: 'error',
      error: 'ENOTFOUND github.com'
    })
  })

  it('does not start a second download while one is in flight', async () => {
    stub.download = () => new Promise<string[]>(() => undefined)
    const { startUpdateDownload } = await load()
    await startUpdateDownload()
    await startUpdateDownload()
    expect(stub.downloadUpdate).toHaveBeenCalledTimes(1)
  })
})

describe('installing', () => {
  it('refuses before anything has been downloaded', async () => {
    const { installDownloadedUpdate } = await load()
    await expect(installDownloadedUpdate()).rejects.toThrow(/No update has been downloaded/)
    expect(stub.quitAndInstall).not.toHaveBeenCalled()
  })

  it('installs silently and relaunches once the download has landed', async () => {
    const { startUpdateDownload, installDownloadedUpdate } = await load()
    await startUpdateDownload()
    stub.emitter.emit('update-downloaded', { version: '0.4.0' })
    await installDownloadedUpdate()
    expect(stub.quitAndInstall).toHaveBeenCalledWith(true, true)
  })
})
