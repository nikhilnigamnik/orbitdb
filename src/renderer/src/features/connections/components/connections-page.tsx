import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { IconPlus, IconPlug, IconRefresh } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '@renderer/components/common/empty-state'
import { ErrorState } from '@renderer/components/common/error-state'
import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
import { Spinner } from '@renderer/components/ui/spinner'
import { useDisclosure } from '@renderer/hooks/use-disclosure'
import { unwrap } from '@renderer/lib/ipc'
import { useConnection } from '../store/connection-store'
import { ConnectionCard } from './connection-card'
import { ConnectionFormModal } from './connection-form-modal'
import { ROUTES } from '@renderer/config/routes'
import type { SavedConnection } from '@renderer/types'

export function ConnectionsPage() {
  const navigate = useNavigate()
  const {
    connections,
    isLoading,
    error,
    refresh,
    active,
    connect,
    disconnect,
    isConnecting,
    connectError
  } = useConnection()

  const formModal = useDisclosure(false)
  const confirmModal = useDisclosure(false)
  const [editing, setEditing] = React.useState<SavedConnection | null>(null)
  const [pendingConnectId, setPendingConnectId] = React.useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<SavedConnection | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  function openCreate() {
    setEditing(null)
    formModal.open()
  }

  function openEdit(connection: SavedConnection) {
    setEditing(connection)
    formModal.open()
  }

  function confirmDelete(connection: SavedConnection) {
    setPendingDelete(connection)
    setDeleteError(null)
    confirmModal.open()
  }

  async function handleConnect(connection: SavedConnection) {
    setPendingConnectId(connection.id)
    try {
      await connect(connection.id)
      navigate(ROUTES.database)
    } catch {
      // surfaced via connectError
    } finally {
      setPendingConnectId(null)
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await unwrap(window.api.connections.delete(pendingDelete.id))
      await refresh()
      confirmModal.close()
      setPendingDelete(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="flex items-end justify-between gap-2 px-8 pt-12 pb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--color-text)]">
            Connections
          </h1>
          <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">
            Manage saved Postgres connections.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text)]"
            onClick={refresh}
            disabled={isLoading}
          >
            <IconRefresh size={13} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </Button>
          <Button
            size="sm"
            className="bg-[var(--color-text)] text-[var(--color-bg)] hover:bg-[var(--color-text)]/90"
            onClick={openCreate}
          >
            <IconPlus size={13} />
            New connection
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-8 pb-8">
        {connectError && <ErrorState title="Failed to connect" message={connectError} />}
        {error && (
          <ErrorState title="Failed to load connections" message={error} onRetry={refresh} />
        )}

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size={20} />
          </div>
        ) : connections.length === 0 ? (
          <EmptyState
            icon={<IconPlug size={20} />}
            title="No connections yet"
            description="Add a Postgres connection to start exploring schemas and tables."
            action={
              <Button
                size="sm"
                className="bg-[var(--color-text)] text-[var(--color-bg)] hover:bg-[var(--color-text)]/90"
                onClick={openCreate}
              >
                <IconPlus size={13} />
                New connection
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {connections.map((connection) => (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                isActive={active?.connectionId === connection.id}
                isConnecting={isConnecting && pendingConnectId === connection.id}
                onConnect={() => handleConnect(connection)}
                onDisconnect={() => void disconnect()}
                onEdit={() => openEdit(connection)}
                onDelete={() => confirmDelete(connection)}
              />
            ))}
          </div>
        )}
      </div>

      <ConnectionFormModal
        isOpen={formModal.isOpen}
        onClose={formModal.close}
        onSaved={() => {
          void refresh()
        }}
        initial={editing}
      />

      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        onClose={() => {
          confirmModal.close()
          setPendingDelete(null)
        }}
        onConfirm={handleDelete}
        title={`Delete ${pendingDelete?.name ?? 'connection'}?`}
        description="This removes the saved profile and closes the pool. It does not modify the database."
        confirmLabel={isDeleting ? 'Deleting…' : 'Delete'}
        variant="danger"
        isLoading={isDeleting}
      />
      {deleteError && (
        <div className="fixed bottom-4 right-4">
          <ErrorState title="Delete failed" message={deleteError} />
        </div>
      )}
    </div>
  )
}
