import * as React from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ErrorState } from '@renderer/components/common/error-state'
import { LoadingState } from '@renderer/components/common/loading-state'
import { useAsync } from '@renderer/hooks/use-async'
import { useDisclosure } from '@renderer/hooks/use-disclosure'
import { unwrap } from '@renderer/lib/ipc'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { TableDataView } from '@renderer/features/tables/components/table-data-view'
import { ROUTES, tableRoute } from '@renderer/config/routes'
import {
  loadLastTable,
  pushRecent,
  renameTableRef,
  saveLastTable
} from '@renderer/features/database/lib/table-prefs'
import { moveViewPrefs } from '@renderer/features/tables/lib/view-prefs'
import { emitSchemaTablesChanged } from '@renderer/features/database/lib/schema-events'
import type { DdlOperation, DdlFormKind, TableDetails } from '@renderer/types'
import { TableHeader } from './table-header'
import { TableStructure } from './table-structure'
import { StructureAi } from './structure-ai'
import { DdlDialog } from './ddl-dialog'
import { ConnectionPicker } from './connection-picker'
import { ConnectionOverview } from './connection-overview'

function lastTableRoute(connectionId: string): string {
  const last = loadLastTable(connectionId)
  return last ? tableRoute(last.schema, last.table) : ROUTES.database
}

export function DatabasePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { active } = useConnection()
  const connectionId = active?.connectionId ?? null
  const schema = searchParams.get('schema') ?? ''
  const table = searchParams.get('table') ?? ''
  const view = searchParams.get('view')
  const [activeTab, setActiveTab] = React.useState<'data' | 'structure'>(
    view === 'structure' ? 'structure' : 'data'
  )

  React.useEffect(() => {
    setActiveTab(view === 'structure' ? 'structure' : 'data')
  }, [schema, table, view])

  // Which connection the schema/table in the URL was chosen under: the one active
  // when the navigation landed. The router commits a navigation as a transition,
  // after the connection change it follows, so a switch first renders the new
  // connection beside the old URL. Opening that table failed with "Table X not
  // found", and saving it made it the new connection's last table, which every
  // later switch reopened. A URL the page mounts on with no connection - after a
  // reload - belongs to none, so the picker cannot carry it over either.
  const [selection, setSelection] = React.useState({ key: location.key, owner: connectionId })
  const isNewLocation = selection.key !== location.key
  if (isNewLocation) setSelection({ key: location.key, owner: connectionId })
  const isForeignSelection = !isNewLocation && selection.owner !== connectionId

  // Reopens the connection's last table when the page lands on it with no table
  // selected, or with another connection's. Survives a disconnect, so
  // reconnecting to the same database keeps the table on screen.
  const restoredFor = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!active) return
    if (restoredFor.current === active.connectionId && !isForeignSelection) return
    restoredFor.current = active.connectionId
    if (schema && table && !isForeignSelection) return
    navigate(lastTableRoute(active.connectionId), { replace: true })
    // schema/table intentionally not in deps - only restore on connection change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isForeignSelection, navigate])

  React.useEffect(() => {
    if (!active || !schema || !table || isForeignSelection) return
    saveLastTable(active.connectionId, { schema, table })
    pushRecent(active.connectionId, { schema, table })
  }, [active, schema, table, isForeignSelection])

  if (!active) {
    return (
      <main className="flex min-w-0 flex-1 overflow-hidden bg-surface">
        <ConnectionPicker />
      </main>
    )
  }

  if (isForeignSelection) {
    // Held for the one commit before the restore above replaces the URL.
    return (
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-surface">
        <LoadingState />
      </main>
    )
  }

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-surface">
      {schema && table ? (
        <TableViewContainer
          // The connection belongs in the key: two connections can both
          // have public.users, and without it switching between them keeps the
          // same mounted view - saved views, filters and prefs included.
          key={`${active.connectionId}:${schema}.${table}`}
          connectionId={active.connectionId}
          schema={schema}
          table={table}
          activeTab={activeTab}
          onChangeTab={setActiveTab}
        />
      ) : (
        <ConnectionOverview connectionId={active.connectionId} schema={schema} />
      )}
    </main>
  )
}

interface TableViewContainerProps {
  connectionId: string
  schema: string
  table: string
  activeTab: 'data' | 'structure'
  onChangeTab: (tab: 'data' | 'structure') => void
}

function TableViewContainer({
  connectionId,
  schema,
  table,
  activeTab,
  onChangeTab
}: TableViewContainerProps) {
  const navigate = useNavigate()
  const { current } = useConnection()
  const engine = current?.engine ?? 'postgres'
  const { data, error, isLoading, refresh } = useAsync<TableDetails>(
    async () => unwrap(window.api.db.tableDetails(connectionId, schema, table)),
    [connectionId, schema, table]
  )

  // The header reports the table's own size, unfiltered - the pagination bar
  // answers the different question of how many rows the current filters match.
  // Null while it loads, and for tables too large to count, where the header
  // falls back to the estimate. The data view borrows it while no filter is set
  // rather than running the same count a second time.
  const [totalRows, setTotalRows] = React.useState<number | null>(null)
  React.useEffect(() => {
    let cancelled = false
    setTotalRows(null)
    void unwrap(window.api.db.countRows({ connectionId, schema, table }))
      .then((total) => {
        if (!cancelled) setTotalRows(total)
      })
      .catch(() => {
        // A count is an enhancement; the estimate covers the failure.
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, schema, table])

  const ddlDialog = useDisclosure(false)
  const [ddlState, setDdlState] = React.useState<{
    kind: DdlFormKind
    target?: string
  } | null>(null)
  // Hold the header until the first page of rows lands so the whole view reveals
  // at once (one loader). Sticky once shown - and the structure tab, which has no
  // async load, reveals it immediately. Resets per table via the container key.
  const [headerShown, setHeaderShown] = React.useState(activeTab !== 'data')
  React.useEffect(() => {
    if (activeTab !== 'data') setHeaderShown(true)
  }, [activeTab])

  function openDdl(kind: DdlFormKind, target?: string) {
    setDdlState({ kind, target })
    ddlDialog.open()
  }

  function handleDdlSuccess(operation: DdlOperation) {
    if (operation.kind === 'rename-table' && data) {
      renameTableRef(
        connectionId,
        { schema: data.schema, table: data.name },
        { schema: data.schema, table: operation.to }
      )
      moveViewPrefs(connectionId, data.schema, data.name, operation.to)
      // The sidebar lists tables by name, and only re-reads them when told.
      emitSchemaTablesChanged(connectionId, data.schema)
      navigate(tableRoute(data.schema, operation.to), { replace: true })
      return
    }
    refresh()
  }

  if (isLoading) {
    return <LoadingState />
  }
  if (error || !data) {
    return (
      <div className="p-4">
        <ErrorState message={error ?? 'No table details'} onRetry={refresh} />
      </div>
    )
  }

  const canEdit = data.type === 'table'

  return (
    <>
      {headerShown && (
        <TableHeader
          details={data}
          activeTab={activeTab}
          onChangeTab={onChangeTab}
          totalRows={totalRows}
          onOpenSchema={() => navigate(ROUTES.database)}
        />
      )}
      {activeTab === 'data' ? (
        <TableDataView
          connectionId={connectionId}
          details={data}
          engine={engine}
          onRenameTable={canEdit ? () => openDdl('rename-table') : undefined}
          onReady={() => setHeaderShown(true)}
          unfilteredTotal={totalRows}
        />
      ) : (
        <TableStructure
          details={data}
          onEdit={canEdit ? openDdl : undefined}
          header={
            <StructureAi
              connectionId={connectionId}
              schema={data.schema}
              table={data.name}
              canEdit={canEdit}
              onApplied={refresh}
            />
          }
        />
      )}

      {ddlState && (
        <DdlDialog
          isOpen={ddlDialog.isOpen}
          onClose={ddlDialog.close}
          connectionId={connectionId}
          schema={data.schema}
          table={data.name}
          columns={data.columns}
          kind={ddlState.kind}
          target={ddlState.target}
          onSuccess={handleDdlSuccess}
        />
      )}
    </>
  )
}
