import * as React from 'react'
import type { ActiveConnectionMeta, SavedConnection } from '@renderer/types'
import { unwrap } from '@renderer/lib/ipc'

interface ConnectionContextValue {
  connections: SavedConnection[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  active: ActiveConnectionMeta | null
  current: SavedConnection | null
  connect: (id: string) => Promise<void>
  disconnect: () => Promise<void>
  isConnecting: boolean
  connectError: string | null
}

const ConnectionContext = React.createContext<ConnectionContextValue | null>(null)

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = React.useState<SavedConnection[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [active, setActive] = React.useState<ActiveConnectionMeta | null>(null)
  const [isConnecting, setIsConnecting] = React.useState(false)
  const [connectError, setConnectError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setConnectError(null)
    try {
      const data = await unwrap(window.api.connections.list())
      setConnections(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const connect = React.useCallback(async (id: string) => {
    setIsConnecting(true)
    setConnectError(null)
    try {
      const meta = await unwrap(window.api.db.connect(id))
      setActive(meta)
    } catch (err) {
      setActive(null)
      setConnectError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const disconnect = React.useCallback(async () => {
    if (!active) return
    try {
      await unwrap(window.api.db.disconnect(active.connectionId))
    } finally {
      setActive(null)
    }
  }, [active])

  const current = React.useMemo(
    () => (active ? (connections.find((c) => c.id === active.connectionId) ?? null) : null),
    [active, connections]
  )

  const value = React.useMemo<ConnectionContextValue>(
    () => ({
      connections,
      isLoading,
      error,
      refresh,
      active,
      current,
      connect,
      disconnect,
      isConnecting,
      connectError
    }),
    [
      connections,
      isLoading,
      error,
      refresh,
      active,
      current,
      connect,
      disconnect,
      isConnecting,
      connectError
    ]
  )

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
}

export function useConnection(): ConnectionContextValue {
  const ctx = React.useContext(ConnectionContext)
  if (!ctx) throw new Error('useConnection must be used inside ConnectionProvider')
  return ctx
}
