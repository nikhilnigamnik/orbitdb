import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { IconPlus, IconPlug, IconRefresh, IconArrowsSort } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Popover } from '@renderer/components/ui/popover'
import { EmptyState } from '@renderer/components/common/empty-state'
import { ErrorState } from '@renderer/components/common/error-state'
import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
import { Spinner } from '@renderer/components/ui/spinner'
import { useDisclosure } from '@renderer/hooks/use-disclosure'
import { unwrap } from '@renderer/lib/ipc'
import { useConnection } from '../store/connection-store'
import { ConnectionCard } from './connection-card'
import { ConnectionFormSheet } from './connection-form-sheet'
import { ROUTES } from '@renderer/config/routes'
import { APP_NAME } from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'
import orbitdbLogo from '@renderer/assets/orbitdb-cream.png'
import type { SavedConnection } from '@renderer/types'

type SortMode = 'name-asc' | 'name-desc' | 'recent'

const SORT_LABEL: Record<SortMode, string> = {
  'name-asc': 'Name (A–Z)',
  'name-desc': 'Name (Z–A)',
  recent: 'Recently added'
}

const TABS = ['All'] as const
type TabKey = (typeof TABS)[number]

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
  const [activeTab, setActiveTab] = React.useState<TabKey>('All')
  const [sort, setSort] = React.useState<SortMode>('name-asc')
  const [sortOpen, setSortOpen] = React.useState(false)

  const sorted = React.useMemo(() => {
    const list = [...connections]
    if (sort === 'name-asc') list.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'name-desc') list.sort((a, b) => b.name.localeCompare(a.name))
    else list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return list
  }, [connections, sort])

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
    <div className="flex min-h-full flex-col items-center p-1 bg-bg">
      <div className="rounded-lg bg-surface flex-1 flex-col w-full">
        <div className="mx-auto w-full max-w-2xl flex-col px-6 py-10">
          <div className="mt-8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <img src={orbitdbLogo} alt={APP_NAME} className="h-7 w-7" />
                <span className="truncate text-[18px] font-semibold text-text">{APP_NAME}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="rounded-md border border-border bg-surface px-3 text-text-muted hover:bg-surface-elevated hover:text-text"
                onClick={refresh}
                disabled={isLoading}
                title="Refresh"
              >
                <IconRefresh size={14} className={isLoading ? 'animate-spin' : ''} />
                Refresh
              </Button>
            </div>
          </div>

          <div className="mt-12 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-bold leading-none tracking-tight text-text">
              Connections
            </h2>
            <Button
              size="sm"
              className="rounded-lg bg-accent px-3.5 text-white hover:bg-accent/90"
              onClick={openCreate}
            >
              Add new
            </Button>
          </div>

          <div className="mt-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-1 rounded-full border border-border bg-surface p-0.5">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors',
                    activeTab === tab
                      ? 'bg-surface-elevated text-text'
                      : 'text-text-muted hover:text-text'
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            <Popover
              openPopover={sortOpen}
              setOpenPopover={setSortOpen}
              align="end"
              popoverContentClassName="w-48 overflow-hidden shadow-xl shadow-black/40"
              content={
                <div className="flex flex-col p-1">
                  {(Object.keys(SORT_LABEL) as SortMode[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSort(key)
                        setSortOpen(false)
                      }}
                      className={cn(
                        'flex w-full cursor-pointer rounded-md items-center px-1.5 py-1.5 text-left text-xs hover:bg-surface-elevated',
                        sort === key ? 'text-text' : 'text-text-muted'
                      )}
                    >
                      {SORT_LABEL[key]}
                    </button>
                  ))}
                </div>
              }
            >
              <button
                type="button"
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px] text-text-muted hover:text-text"
              >
                <IconArrowsSort size={13} />
                {SORT_LABEL[sort]}
              </button>
            </Popover>
          </div>

          <div className="mt-4 flex flex-1 flex-col gap-3">
            {connectError && <ErrorState title="Failed to connect" message={connectError} />}
            {error && (
              <ErrorState title="Failed to load connections" message={error} onRetry={refresh} />
            )}

            {isLoading ? (
              <div className="flex flex-1 items-center justify-center py-16">
                <Spinner size={20} />
              </div>
            ) : sorted.length === 0 ? (
              <EmptyState
                icon={<IconPlug size={20} />}
                title="No connections yet"
                description="Add a Postgres, MySQL, or D1 connection to start exploring."
                action={
                  <Button
                    size="sm"
                    className="rounded-full bg-accent px-3.5 text-white hover:bg-accent/90"
                    onClick={openCreate}
                  >
                    <IconPlus size={14} />
                    Add new
                  </Button>
                }
              />
            ) : (
              sorted.map((connection) => (
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
              ))
            )}
          </div>
        </div>
      </div>

      <ConnectionFormSheet
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
