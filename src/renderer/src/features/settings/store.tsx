import * as React from 'react'
import { unwrap } from '@renderer/lib/ipc'
import type { UpdateCheckResult } from '@renderer/types'

interface UpdateContextValue {
  version: string | null
  result: UpdateCheckResult | null
  isChecking: boolean
  error: string | null
  lastCheckedAt: Date | null
  check: () => Promise<void>
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

  const value = React.useMemo<UpdateContextValue>(
    () => ({ version, result, isChecking, error, lastCheckedAt, check }),
    [version, result, isChecking, error, lastCheckedAt, check]
  )

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
}

export function useUpdateCheck(): UpdateContextValue {
  const ctx = React.useContext(UpdateContext)
  if (!ctx) throw new Error('useUpdateCheck must be used inside UpdateCheckProvider')
  return ctx
}
