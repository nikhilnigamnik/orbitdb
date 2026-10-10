import * as React from 'react'
import { unwrap } from '@renderer/lib/ipc'
import { errorMessage } from '@renderer/lib/errors'
import type { UpdateCheckResult, UpdateDownloadState } from '@renderer/types'
import { IDLE_UPDATE_DOWNLOAD } from '../../../../shared/types'

interface UpdateContextValue {
  version: string | null
  result: UpdateCheckResult | null
  isChecking: boolean
  error: string | null
  lastCheckedAt: Date | null
  check: () => Promise<void>
  /** The in-app download, when this build supports one. */
  download: UpdateDownloadState
  startDownload: () => Promise<void>
  install: () => Promise<void>
}

const UpdateContext = React.createContext<UpdateContextValue | null>(null)

function appApi() {
  if (typeof window === 'undefined' || !window.api?.app) {
    throw new Error('App IPC bridge unavailable - restart the dev server so preload reloads.')
  }
  return window.api.app
}

export function UpdateCheckProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<UpdateCheckResult | null>(null)
  const [isChecking, setIsChecking] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = React.useState<Date | null>(null)
  const [download, setDownload] = React.useState<UpdateDownloadState>(IDLE_UPDATE_DOWNLOAD)

  React.useEffect(() => {
    void (async () => {
      try {
        const v = await unwrap(appApi().getVersion())
        setVersion(v)
      } catch {
        // Surface to update-check error path; version stays null
      }
    })()
  }, [])

  const check = React.useCallback(async () => {
    setIsChecking(true)
    setError(null)
    try {
      const res = await unwrap(appApi().checkUpdate())
      setResult(res)
      setVersion(res.currentVersion)
      setLastCheckedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsChecking(false)
    }
  }, [])

  React.useEffect(() => {
    void check()
  }, [check])

  // Main owns the download; this mirrors its state and follows the pushes. A
  // preload from before the updater existed has none of these, and the panel
  // then only links to the release page rather than failing to mount.
  React.useEffect(() => {
    const api = appApi()
    if (typeof api.onUpdateState !== 'function') return undefined
    void (async () => {
      try {
        setDownload(await unwrap(api.getUpdateState()))
      } catch {
        // Nothing to mirror yet; the first push fills it in.
      }
    })()
    return api.onUpdateState(setDownload)
  }, [])

  const startDownload = React.useCallback(async () => {
    try {
      setDownload(await unwrap(appApi().downloadUpdate()))
    } catch (err) {
      setDownload((prev) => ({ ...prev, phase: 'error', error: errorMessage(err) }))
    }
  }, [])

  const install = React.useCallback(async () => {
    try {
      await unwrap(appApi().installUpdate())
    } catch (err) {
      setDownload((prev) => ({ ...prev, phase: 'error', error: errorMessage(err) }))
    }
  }, [])

  const value = React.useMemo<UpdateContextValue>(
    () => ({
      version,
      result,
      isChecking,
      error,
      lastCheckedAt,
      check,
      download,
      startDownload,
      install
    }),
    [version, result, isChecking, error, lastCheckedAt, check, download, startDownload, install]
  )

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
}

export function useUpdateCheck(): UpdateContextValue {
  const ctx = React.useContext(UpdateContext)
  if (!ctx) throw new Error('useUpdateCheck must be used inside UpdateCheckProvider')
  return ctx
}
