import * as React from 'react'
import { unwrap } from '@renderer/lib/ipc'
import type { SavedConnection } from '@renderer/types'

export type ConnectionHealth = 'unknown' | 'checking' | 'ok' | 'fail'

/**
 * How long an automatic check stands before the page re-tests. Each test opens
 * a fresh TCP and TLS session, so re-testing every connection on every visit to
 * the page was a burst of handshakes per navigation. A click always re-tests.
 */
export const HEALTH_CACHE_TTL_MS = 60_000

interface CachedHealth {
  health: 'ok' | 'fail'
  error?: string
  checkedAt: number
}

// Module scope, so it outlives the page: that is the whole point.
const healthCache = new Map<string, CachedHealth>()

/** Keyed on `updatedAt` too, so an edited connection is checked afresh. */
function cacheKey(connection: SavedConnection): string {
  return `${connection.id}:${connection.updatedAt}`
}

function freshEntry(connection: SavedConnection, now: number): CachedHealth | undefined {
  const entry = healthCache.get(cacheKey(connection))
  if (!entry || now - entry.checkedAt >= HEALTH_CACHE_TTL_MS) return undefined
  return entry
}

/** Test seam. */
export function resetConnectionHealthCache(): void {
  healthCache.clear()
}

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

  const record = React.useCallback((id: string, next: ConnectionHealth, error?: string) => {
    setHealth((prev) => ({ ...prev, [id]: next }))
    setErrors((prev) => ({ ...prev, [id]: error }))
  }, [])

  const refresh = React.useCallback(
    async (connection: SavedConnection) => {
      if (inFlight.current.has(connection.id)) return
      inFlight.current.add(connection.id)
      record(connection.id, 'checking')
      let entry: CachedHealth
      try {
        // The id lets main fill in the password, which this side never holds.
        const result = await unwrap(window.api.connections.test(connection, connection.id))
        entry = {
          health: result.success ? 'ok' : 'fail',
          error: result.error,
          checkedAt: Date.now()
        }
      } catch (err) {
        entry = {
          health: 'fail',
          error: err instanceof Error ? err.message : String(err),
          checkedAt: Date.now()
        }
      } finally {
        inFlight.current.delete(connection.id)
      }
      healthCache.set(cacheKey(connection), entry)
      record(connection.id, entry.health, entry.error)
    },
    [record]
  )

  const refreshAll = React.useCallback(async () => {
    await Promise.all(connections.map(refresh))
  }, [connections, refresh])

  // Per mount, keyed like the cache: a list re-render does not re-check, an
  // edit does.
  const checkedKeys = React.useRef<Set<string>>(new Set())
  React.useEffect(() => {
    const now = Date.now()
    const stale: SavedConnection[] = []
    for (const connection of connections) {
      const key = cacheKey(connection)
      if (checkedKeys.current.has(key)) continue
      checkedKeys.current.add(key)
      const cached = freshEntry(connection, now)
      if (cached) record(connection.id, cached.health, cached.error)
      else stale.push(connection)
    }
    if (stale.length > 0) void Promise.all(stale.map(refresh))
  }, [connections, refresh, record])

  return { health, errors, refresh, refreshAll }
}
