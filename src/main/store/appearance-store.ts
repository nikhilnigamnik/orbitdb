import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import {
  DEFAULT_THEME_PREFERENCE,
  isThemePreference,
  type ThemePreference
} from '../../shared/types'
import { readJsonFile, writeJsonFileAtomic } from './json-file'

const FILE_NAME = 'appearance.json'

interface StoreShape {
  version: 1
  theme: ThemePreference
}

// Its own file rather than a field in settings.json: the theme is read before
// the window exists, and settings.json costs a keychain round-trip to unseal.
let cache: StoreShape | null = null

function storePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, FILE_NAME)
}

function read(): StoreShape {
  if (cache) return cache
  let parsed: Partial<StoreShape> | null | undefined
  try {
    parsed = readJsonFile(storePath()) as Partial<StoreShape> | null | undefined
  } catch (err) {
    // Read before the window opens, so throwing here would mean no window.
    console.error('[appearance] could not read the theme; following the OS', err)
  }
  // An unrecognised theme is one setting, not worth quarantining a file over -
  // it falls back to following the OS, which is what a fresh install does.
  const theme = isThemePreference(parsed?.theme) ? parsed.theme : DEFAULT_THEME_PREFERENCE
  cache = { version: 1, theme }
  return cache
}

export function getThemePreference(): ThemePreference {
  return read().theme
}

export function setThemePreference(theme: ThemePreference): ThemePreference {
  if (!isThemePreference(theme)) throw new Error(`Unknown theme: ${String(theme)}`)
  const next: StoreShape = { version: 1, theme }
  writeJsonFileAtomic(storePath(), next, 2)
  cache = next
  return theme
}
