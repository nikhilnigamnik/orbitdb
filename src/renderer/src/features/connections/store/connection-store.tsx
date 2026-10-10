import * as React from 'react'
import type { ActiveConnectionMeta, SavedConnection } from '@renderer/types'
import { unwrap } from '@renderer/lib/ipc'
import { errorMessage } from '@renderer/lib/errors'

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
  disconnectError: string | null
}

const ConnectionContext = React.createContext<ConnectionContextValue | null>(null)

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = React.useState<SavedConnection[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [active, setActive] = React.useState<ActiveConnectionMeta | null>(null)
  const [isConnecting, setIsConnecting] = React.useState(false)
  const [connectError, setConnectError] = React.useState<string | null>(null)
  const [disconnectError, setDisconnectError] = React.useState<string | null>(null)
  // Read inside connect() without making it change identity on every switch.
  const activeRef = React.useRef<ActiveConnectionMeta | null>(null)
  React.useEffect(() => {
    activeRef.current = active
  }, [active])

  const refresh = React.useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setConnectError(null)
    try {
      const data = await unwrap(window.api.connections.list())
      setConnections(data)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * Replaces the active connection only once the new one answers. A failed
   * switch used to clear it, which left the user on nothing while the old
   * pool stayed open in main with no way back to it.
   */
  const connect = React.useCallback(async (id: string) => {
    setIsConnecting(true)
    setConnectError(null)
    try {
      const meta = await unwrap(window.api.db.connect(id))
      const previous = activeRef.current?.connectionId
      setActive(meta)
      if (previous && previous !== id) {
        void unwrap(window.api.db.disconnect(previous)).catch((err) =>
          console.warn('[connections] could not close the previous connection', err)
        )
      }
    } catch (err) {
      setConnectError(errorMessage(err))
      throw err
    } finally {
      setIsConnecting(false)
    }
  }, [])

  // Never rejects: callers fire it with `void`, so a failed IPC call would
  // otherwise surface as an unhandled rejection rather than a message.
  const disconnect = React.useCallback(async () => {
    if (!active) return
    setDisconnectError(null)
    try {
      await unwrap(window.api.db.disconnect(active.connectionId))
    } catch (err) {
      setDisconnectError(errorMessage(err))
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
      connectError,
      disconnectError
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
      connectError,
      disconnectError
    ]
  )

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
}

export function useConnection(): ConnectionContextValue {
  const ctx = React.useContext(ConnectionContext)
  if (!ctx) throw new Error('useConnection must be used inside ConnectionProvider')
  return ctx
}
