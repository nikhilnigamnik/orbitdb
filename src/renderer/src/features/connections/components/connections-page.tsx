import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconPlus,
  IconPlug,
  IconRefresh,
  IconArrowsSort,
  IconWorld,
  IconBrandX,
  IconBrandGithub,
  IconBrandDiscord
} from '@tabler/icons-react'
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
import { APP_NAME, APP_TAGLINE, APP_VERSION } from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'
import orbitdbLogo from '@renderer/assets/orbitdb-white.png'
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
  const sortRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!sortOpen) return
    const onClick = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [sortOpen])

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
    <div className="flex min-h-full flex-col items-center px-6 pt-16 pb-8">
      <div className="flex w-full max-w-2xl flex-1 flex-col">
        <h1 className="text-[44px] font-bold leading-none tracking-tight text-text">Dashboard</h1>

        <div className="mt-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-accent/40 to-accent/10">
              <img src={orbitdbLogo} alt={APP_NAME} className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-[18px] font-semibold text-text">{APP_NAME}</span>
                <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  Local
                </span>
              </div>
              <p className="truncate text-[12px] text-text-subtle">{APP_TAGLINE}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full border border-border bg-surface px-3 text-text-muted hover:bg-surface-elevated hover:text-text"
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
          <h2 className="text-[28px] font-bold leading-none tracking-tight text-text">
            Connections
          </h2>
          <Button
            size="sm"
            className="rounded-full bg-accent px-3.5 text-white hover:bg-accent/90"
            onClick={openCreate}
          >
            <IconPlus size={14} />
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

          <div ref={sortRef} className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] text-text-muted hover:text-text"
            >
              <IconArrowsSort size={13} />
              {SORT_LABEL[sort]}
            </button>
            {sortOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-surface shadow-xl shadow-black/40 animate-in fade-in-0 zoom-in-95 duration-150">
                {(Object.keys(SORT_LABEL) as SortMode[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSort(key)
                      setSortOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center px-3 py-2 text-left text-[13px] hover:bg-surface-elevated',
                      sort === key ? 'text-text' : 'text-text-muted'
                    )}
                  >
                    {SORT_LABEL[key]}
                  </button>
                ))}
              </div>
            )}
          </div>
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

        <div className="mt-12 flex items-center justify-between border-t border-border pt-4 text-text-subtle">
          <div className="flex items-center gap-3">
            <a
              href="https://orbitdb.local"
              onClick={(e) => e.preventDefault()}
              className="rounded p-1 hover:text-text"
              title="Website"
            >
              <IconWorld size={14} />
            </a>
            <a
              href="https://x.com"
              onClick={(e) => e.preventDefault()}
              className="rounded p-1 hover:text-text"
              title="X"
            >
              <IconBrandX size={14} />
            </a>
            <a
              href="https://discord.com"
              onClick={(e) => e.preventDefault()}
              className="rounded p-1 hover:text-text"
              title="Discord"
            >
              <IconBrandDiscord size={14} />
            </a>
            <a
              href="https://github.com"
              onClick={(e) => e.preventDefault()}
              className="rounded p-1 hover:text-text"
              title="GitHub"
            >
              <IconBrandGithub size={14} />
            </a>
          </div>
          <span className="text-[11.5px]">Current version v{APP_VERSION}</span>
        </div>
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
