/**
 * The IPC envelope and other app-level shapes.
 */

export interface OperationResult<T = void> {
  success: boolean
  error?: string
  data?: T
}

/**
 * Whether this build can apply an update itself. Windows (NSIS) and a Linux
 * AppImage can; a `.deb` cannot, and macOS only once the bundle is signed, since
 * Squirrel.Mac refuses to swap in an unsigned one.
 */
export type UpdateInstallSupport = 'in-app' | 'manual'

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string | null
  hasUpdate: boolean
  releaseUrl: string | null
  publishedAt: string | null
  installSupport: UpdateInstallSupport
}

export type UpdateDownloadPhase = 'idle' | 'downloading' | 'downloaded' | 'error'

/** Pushed from main on the `UPDATE_STATE_CHANNEL` as a download moves. */
export interface UpdateDownloadState {
  phase: UpdateDownloadPhase
  version: string | null
  percent: number
  transferredBytes: number
  totalBytes: number
  error: string | null
}

export const UPDATE_STATE_CHANNEL = 'app:update-state'

export const IDLE_UPDATE_DOWNLOAD: UpdateDownloadState = {
  phase: 'idle',
  version: null,
  percent: 0,
  transferredBytes: 0,
  totalBytes: 0,
  error: null
}

/** Light, dark, or whatever the OS is set to - Attio's three appearance options. */
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const

export type ThemePreference = (typeof THEME_PREFERENCES)[number]

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system'

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
}
