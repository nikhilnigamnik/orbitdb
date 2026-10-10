/**
 * Downloading and applying a release from inside the app.
 *
 * The check in `update-check.ts` stays on the GitHub API: it works in dev, on
 * every platform and on an unsigned build, and it is what the Settings panel
 * shows. electron-updater is only brought in for the download and the install,
 * reading the `latest*.yml` manifests the release workflow already uploads.
 */
import { app, BrowserWindow } from 'electron'
import type { AppUpdater } from 'electron-updater'
import {
  IDLE_UPDATE_DOWNLOAD,
  UPDATE_STATE_CHANNEL,
  type UpdateDownloadState,
  type UpdateInstallSupport
} from '../../shared/types'
import { describeError } from '../db/describe-error'

/**
 * Flip together with `identity` in electron-builder.yml. Squirrel.Mac refuses
 * to swap in an unsigned bundle, so an unsigned macOS build has to send the
 * user to the release page rather than offer an install that fails at the end.
 */
export const IS_MAC_BUILD_SIGNED = false

export interface InstallSupportInputs {
  platform: NodeJS.Platform
  isPackaged: boolean
  isAppImage: boolean
  isMacSigned: boolean
}

export function installSupportFor(inputs: InstallSupportInputs): UpdateInstallSupport {
  if (!inputs.isPackaged) return 'manual'
  switch (inputs.platform) {
    case 'win32':
      return 'in-app'
    case 'linux':
      return inputs.isAppImage ? 'in-app' : 'manual'
    case 'darwin':
      return inputs.isMacSigned ? 'in-app' : 'manual'
    default:
      return 'manual'
  }
}

export function updateInstallSupport(): UpdateInstallSupport {
  return installSupportFor({
    platform: process.platform,
    isPackaged: app.isPackaged,
    // Set by the AppImage runtime; a `.deb` install has no file to replace.
    isAppImage: Boolean(process.env.APPIMAGE),
    isMacSigned: IS_MAC_BUILD_SIGNED
  })
}

let state: UpdateDownloadState = IDLE_UPDATE_DOWNLOAD
let updaterPromise: Promise<AppUpdater> | null = null

export function getUpdateDownloadState(): UpdateDownloadState {
  return state
}

function publish(next: UpdateDownloadState): void {
  state = next
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(UPDATE_STATE_CHANNEL, next)
  }
}

/**
 * Loaded on first use, like the AI SDK: nothing pays for it until a download
 * is asked for. Nothing downloads or installs on its own - `autoDownload` is
 * off, and `autoInstallOnAppQuit` is off so the only install path is the one
 * the user clicks.
 */
async function updater(): Promise<AppUpdater> {
  if (!updaterPromise) {
    updaterPromise = import('electron-updater').then(({ autoUpdater }) => {
      autoUpdater.autoDownload = false
      autoUpdater.autoInstallOnAppQuit = false
      autoUpdater.logger = null
      autoUpdater.on('download-progress', (progress) => {
        publish({
          ...state,
          phase: 'downloading',
          percent: progress.percent,
          transferredBytes: progress.transferred,
          totalBytes: progress.total
        })
      })
      autoUpdater.on('update-downloaded', (info) => {
        publish({ ...state, phase: 'downloaded', version: info.version, percent: 100 })
      })
      autoUpdater.on('error', (err) => {
        publish({ ...state, phase: 'error', error: describeError(err) })
      })
      return autoUpdater
    })
  }
  return updaterPromise
}

/**
 * Checks the manifests and starts the download. Returns as soon as the download
 * is under way; progress reaches the renderer over the state channel, so the
 * IPC call is not held open for the minutes a download can take.
 */
export async function startUpdateDownload(): Promise<UpdateDownloadState> {
  if (updateInstallSupport() !== 'in-app') {
    throw new Error('This build cannot install updates itself. Open the release page instead.')
  }
  if (state.phase === 'downloading' || state.phase === 'downloaded') return state

  publish({ ...IDLE_UPDATE_DOWNLOAD, phase: 'downloading' })
  try {
    const au = await updater()
    const check = await au.checkForUpdates()
    if (!check?.isUpdateAvailable) {
      publish({
        ...IDLE_UPDATE_DOWNLOAD,
        phase: 'error',
        error: 'You are already on the latest version.'
      })
      return state
    }
    publish({ ...state, version: check.updateInfo.version })
    void au.downloadUpdate().catch((err: unknown) => {
      publish({ ...state, phase: 'error', error: describeError(err) })
    })
  } catch (err) {
    publish({ ...IDLE_UPDATE_DOWNLOAD, phase: 'error', error: describeError(err) })
  }
  return state
}

/**
 * Silent install and relaunch. electron-updater closes the windows first and
 * then quits, which still runs `before-quit` and so the pool shutdown there.
 */
export async function installDownloadedUpdate(): Promise<void> {
  if (state.phase !== 'downloaded') throw new Error('No update has been downloaded yet.')
  const au = await updater()
  au.quitAndInstall(true, true)
}
