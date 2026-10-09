import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const stub = vi.hoisted(() => ({ userDataDir: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`unexpected getPath(${name})`)
      return stub.userDataDir
    }
  }
}))

type Store = typeof import('../../../src/main/store/appearance-store')

/** Re-import so the module's cache starts empty, as on app launch. */
async function freshStore(): Promise<Store> {
  vi.resetModules()
  return import('../../../src/main/store/appearance-store')
}

function filePath(): string {
  return join(stub.userDataDir, 'appearance.json')
}

let store: Store

beforeEach(async () => {
  stub.userDataDir = mkdtempSync(join(tmpdir(), 'orbitdb-appearance-'))
  store = await freshStore()
})

afterEach(() => {
  rmSync(stub.userDataDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('theme preference', () => {
  it('follows the OS on a fresh install', () => {
    expect(store.getThemePreference()).toBe('system')
  })

  it('persists a choice across launches', async () => {
    store.setThemePreference('dark')
    expect(JSON.parse(readFileSync(filePath(), 'utf8'))).toEqual({ version: 1, theme: 'dark' })

    store = await freshStore()
    expect(store.getThemePreference()).toBe('dark')
  })

  it('refuses a theme it does not know, and keeps the stored one', () => {
    store.setThemePreference('light')
    expect(() => store.setThemePreference('sepia' as never)).toThrow(/Unknown theme/)
    expect(store.getThemePreference()).toBe('light')
  })

  it('reads an unrecognised value on disk as following the OS', async () => {
    writeFileSync(filePath(), JSON.stringify({ version: 1, theme: 'neon' }))
    store = await freshStore()
    expect(store.getThemePreference()).toBe('system')
  })

  it('does not throw on a file it cannot read, since no theme means no window', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // A directory where the file should be: reading it fails with EISDIR.
    mkdirSync(filePath())
    store = await freshStore()
    expect(store.getThemePreference()).toBe('system')
  })
})
