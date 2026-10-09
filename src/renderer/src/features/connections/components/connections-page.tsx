import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconArrowsSort,
  IconCheck,
  IconChevronRight,
  IconPlug,
  IconPlugConnected,
  IconPlus,
  IconRefresh,
  IconSettings
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Popover } from '@renderer/components/ui/popover'
import { SlidingTabs } from '@renderer/components/ui/sliding-tabs'
import { PageHeader, PageToolbar } from '@renderer/components/layout/page-header'
import { EmptyState } from '@renderer/components/common/empty-state'
import { ErrorState } from '@renderer/components/common/error-state'
import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
import { LoadingState } from '@renderer/components/common/loading-state'
import { Spinner } from '@renderer/components/ui/spinner'
import { useDisclosure } from '@renderer/hooks/use-disclosure'
import { unwrap } from '@renderer/lib/ipc'
import { useConnection } from '../store/connection-store'
import { useConnectionHealth } from '../lib/use-connection-health'
import {
  folderNames,
  groupByFolder,
  loadCollapsedFolders,
  saveCollapsedFolders
} from '../lib/folders'
import { ConnectionCard } from './connection-card'
import { ConnectionFormSheet } from './connection-form-sheet'
import { ROUTES } from '@renderer/config/routes'
import {
  DEFAULT_ENVIRONMENT,
  ENVIRONMENT_LABEL,
  UNGROUPED_FOLDER_LABEL
} from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'
import type { ConnectionEnvironment, SavedConnection } from '@renderer/types'

type SortMode = 'name-asc' | 'name-desc' | 'recent'

const DEFAULT_SORT: SortMode = 'name-asc'

const SORT_LABEL: Record<SortMode, string> = {
  'name-asc': 'Name (A-Z)',
  'name-desc': 'Name (Z-A)',
  recent: 'Recently added'
}

/** React key for the ungrouped bucket. A NUL cannot collide with a real folder name. */
const UNGROUPED_KEY = '\u0000ungrouped'

type TabKey = 'all' | ConnectionEnvironment

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'dev', label: ENVIRONMENT_LABEL.dev },
  { key: 'stage', label: ENVIRONMENT_LABEL.stage },
  { key: 'prod', label: ENVIRONMENT_LABEL.prod }
]

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
    connectError,
    disconnectError
  } = useConnection()

  const { health, errors: healthErrors, refresh: refreshHealth } = useConnectionHealth(connections)

  const formModal = useDisclosure(false)
  const confirmModal = useDisclosure(false)
  const [editing, setEditing] = React.useState<SavedConnection | null>(null)
  const [pendingConnectId, setPendingConnectId] = React.useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<SavedConnection | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<TabKey>('all')
  const [sort, setSort] = React.useState<SortMode>(DEFAULT_SORT)
  const [sortOpen, setSortOpen] = React.useState(false)
  const [collapsedFolders, setCollapsedFolders] = React.useState<string[]>(loadCollapsedFolders)

  const counts = React.useMemo(() => {
    const acc: Record<TabKey, number> = { all: connections.length, dev: 0, stage: 0, prod: 0 }
    for (const c of connections) acc[c.environment ?? DEFAULT_ENVIRONMENT] += 1
    return acc
  }, [connections])

  const sorted = React.useMemo(() => {
    const filtered =
      activeTab === 'all'
        ? connections
        : connections.filter((c) => (c.environment ?? DEFAULT_ENVIRONMENT) === activeTab)
    const list = [...filtered]
    if (sort === 'name-asc') list.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'name-desc') list.sort((a, b) => b.name.localeCompare(a.name))
    else list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return list
  }, [connections, sort, activeTab])

  // Grouping happens after the sort, so the cards inside a folder stay in the
  // order the user asked for; the folders themselves are always name-ordered.
  const groups = React.useMemo(() => groupByFolder(sorted), [sorted])
  const hasFolders = groups.some((group) => group.folder)
  // Every folder in use, not just the ones on this tab - the form is filing a
  // connection anywhere, and a tab is a filter over the list rather than a scope.
  const folders = React.useMemo(() => folderNames(connections), [connections])

  function toggleFolder(folder: string) {
    const next = collapsedFolders.includes(folder)
      ? collapsedFolders.filter((f) => f !== folder)
      : [...collapsedFolders, folder]
    setCollapsedFolders(next)
    saveCollapsedFolders(next)
  }

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
      const wasActive = active?.connectionId === pendingDelete.id
      await unwrap(window.api.connections.delete(pendingDelete.id))
      // The main process closes the pool, but the renderer would keep pointing
      // at a connection that no longer exists and fail on the next call.
      if (wasActive) await disconnect()
      await refresh()
      confirmModal.close()
      setPendingDelete(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsDeleting(false)
    }
  }

  function renderCard(connection: SavedConnection) {
    return (
      <ConnectionCard
        key={connection.id}
        connection={connection}
        isActive={active?.connectionId === connection.id}
        isConnecting={isConnecting && pendingConnectId === connection.id}
        health={health[connection.id] ?? 'unknown'}
        healthError={healthErrors[connection.id]}
        onConnect={() => handleConnect(connection)}
        onDisconnect={() => void disconnect()}
        onEdit={() => openEdit(connection)}
        onDelete={() => confirmDelete(connection)}
        onRefreshHealth={() => void refreshHealth(connection)}
      />
    )
  }

  const isSorted = sort !== DEFAULT_SORT

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <PageHeader
        breadcrumbs={[{ label: 'Connections', icon: <IconPlugConnected /> }]}
        actions={
          <>
            {/* Settings is in the sidebar too, but this is where a first run
                lands with nothing to connect to yet - and the AI key lives in
                Settings - so it stays one click away from here. */}
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => navigate(ROUTES.settings)}
              aria-label="Settings"
              title="Settings"
            >
              <IconSettings size={16} />
            </Button>
            <Button variant="outline" onClick={refresh} disabled={isLoading} title="Refresh">
              {isLoading ? <Spinner size={14} /> : <IconRefresh size={14} />}
              Refresh
            </Button>
            <Button onClick={openCreate}>
              <IconPlus size={14} data-icon="inline-start" />
              Add new
            </Button>
          </>
        }
      />

      <PageToolbar>
        <SlidingTabs
          tabs={TABS.map((tab) => ({
            id: tab.key,
            label: tab.label,
            count: counts[tab.key]
          }))}
          value={activeTab}
          onChange={setActiveTab}
        />
        <div className="flex-1" />
        <Popover
          openPopover={sortOpen}
          setOpenPopover={setSortOpen}
          align="end"
          popoverContentClassName="w-48 overflow-hidden"
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
                  // Every option in ink, as in Attio's menus - the check alone marks
                  // the current one.
                  className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm text-text hover:bg-surface-elevated"
                >
                  <span className="flex-1 truncate">{SORT_LABEL[key]}</span>
                  {sort === key && <IconCheck size={16} className="shrink-0 text-accent" />}
                </button>
              ))}
            </div>
          }
        >
          {/* Attio's Sort trigger: a dashed chip while the list is in its default
              order, a solid white one once the user has chosen another. */}
          <button
            type="button"
            className={cn(
              'flex h-7 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors',
              isSorted
                ? 'bg-surface text-text shadow-control hover:bg-surface-elevated'
                : 'border border-dashed border-border-strong text-text-muted hover:bg-surface-elevated hover:text-text'
            )}
          >
            <IconArrowsSort size={14} className="shrink-0" />
            {SORT_LABEL[sort]}
          </button>
        </Popover>
      </PageToolbar>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {(connectError || disconnectError || error) && (
          <div className="flex flex-col gap-3 px-4 pt-4">
            {connectError && <ErrorState title="Failed to connect" message={connectError} />}
            {disconnectError && (
              <ErrorState title="Failed to disconnect" message={disconnectError} />
            )}
            {error && (
              <ErrorState title="Failed to load connections" message={error} onRetry={refresh} />
            )}
          </div>
        )}

        {isLoading ? (
          <LoadingState className="py-16" />
        ) : sorted.length === 0 ? (
          <div className="flex flex-1 p-4">
            <EmptyState
              className="border-0 bg-transparent"
              icon={<IconPlug size={20} />}
              title={
                activeTab === 'all'
                  ? 'No connections yet'
                  : `No ${ENVIRONMENT_LABEL[activeTab]} connections`
              }
              description={
                activeTab === 'all'
                  ? 'Add a Postgres, MySQL, or D1 connection to start exploring.'
                  : `Tag a connection as ${ENVIRONMENT_LABEL[activeTab]} to see it here.`
              }
              action={
                <Button variant="outline" onClick={openCreate}>
                  <IconPlus size={14} data-icon="inline-start" />
                  Add new
                </Button>
              }
            />
          </div>
        ) : hasFolders ? (
          // Headings only once something has actually been filed. A lone
          // "Ungrouped" header over every row names a distinction the user
          // has not made yet.
          groups.map((group) => {
            const isCollapsed = collapsedFolders.includes(group.folder)
            return (
              <section key={group.folder || UNGROUPED_KEY} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => toggleFolder(group.folder)}
                  aria-expanded={!isCollapsed}
                  className="group/folder sticky top-0 z-10 flex h-9 w-full shrink-0 cursor-pointer items-center gap-1.5 border-b border-border bg-bg px-4 text-left"
                >
                  <IconChevronRight
                    size={14}
                    className={cn(
                      'shrink-0 text-text-subtle transition-transform',
                      !isCollapsed && 'rotate-90'
                    )}
                  />
                  <span className="truncate text-[12px] font-medium text-text-muted transition-colors group-hover/folder:text-text">
                    {group.folder || UNGROUPED_FOLDER_LABEL}
                  </span>
                  <span className="text-[12px] text-text-subtle tabular-nums">
                    {group.connections.length}
                  </span>
                </button>
                {!isCollapsed && group.connections.map(renderCard)}
              </section>
            )
          })
        ) : (
          sorted.map(renderCard)
        )}
      </div>

      <ConnectionFormSheet
        isOpen={formModal.isOpen}
        onClose={formModal.close}
        folders={folders}
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
        <div className="fixed right-4 bottom-4 z-50 max-w-md rounded-lg bg-surface shadow-pop">
          <ErrorState title="Delete failed" message={deleteError} />
        </div>
      )}
    </div>
  )
}
