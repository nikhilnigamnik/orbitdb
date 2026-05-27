import * as React from 'react'
import { unwrap } from '@renderer/lib/ipc'
import type { SavedConnection } from '@renderer/types'

export type ConnectionHealth = 'unknown' | 'checking' | 'ok' | 'fail'

interface UseConnectionHealthReturn {
  health: Record<string, ConnectionHealth>
  errors: Record<string, string | undefined>
  refresh: (connection: SavedConnection) => Promise<void>
  refreshAll: () => Promise<void>
}

export function useConnectionHealth(connections: SavedConnection[]): UseConnectionHealthReturn {
  const [health, setHealth] = React.useState<Record<string, ConnectionHealth>>({})
  const [errors, setErrors] = React.useState<Record<string, string | undefined>>({})
  const inFlight = React.useRef<Set<string>>(new Set())

  const refresh = React.useCallback(async (connection: SavedConnection) => {
    if (inFlight.current.has(connection.id)) return
    inFlight.current.add(connection.id)
    setHealth((prev) => ({ ...prev, [connection.id]: 'checking' }))
    setErrors((prev) => ({ ...prev, [connection.id]: undefined }))
    try {
      const result = await unwrap(window.api.connections.test(connection))
      setHealth((prev) => ({ ...prev, [connection.id]: result.success ? 'ok' : 'fail' }))
      setErrors((prev) => ({ ...prev, [connection.id]: result.error }))
    } catch (err) {
      setHealth((prev) => ({ ...prev, [connection.id]: 'fail' }))
      setErrors((prev) => ({
        ...prev,
        [connection.id]: err instanceof Error ? err.message : String(err)
      }))
    } finally {
      inFlight.current.delete(connection.id)
    }
  }, [])

  const refreshAll = React.useCallback(async () => {
    await Promise.all(connections.map(refresh))
  }, [connections, refresh])

  // Track which connection IDs we've already auto-pinged so we don't re-ping
  // every time the list reference changes (e.g., after edits).
  const pingedIds = React.useRef<Set<string>>(new Set())
  React.useEffect(() => {
    const newConnections = connections.filter((c) => !pingedIds.current.has(c.id))
    if (newConnections.length === 0) return
    for (const c of newConnections) pingedIds.current.add(c.id)
    void Promise.all(newConnections.map(refresh))
  }, [connections, refresh])

  return { health, errors, refresh, refreshAll }
}
