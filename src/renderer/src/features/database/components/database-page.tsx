import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { IconDatabase } from '@tabler/icons-react'
import { EmptyState } from '@renderer/components/common/empty-state'
import { ErrorState } from '@renderer/components/common/error-state'
import { LoadingState } from '@renderer/components/common/loading-state'
import { useAsync } from '@renderer/hooks/use-async'
import { useDisclosure } from '@renderer/hooks/use-disclosure'
import { unwrap } from '@renderer/lib/ipc'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { TableDataView } from '@renderer/features/tables/components/table-data-view'
import { tableRoute } from '@renderer/config/routes'
import { pushRecent } from '@renderer/features/database/lib/table-prefs'
import type { DdlOperation, DdlOperationKind, TableDetails } from '@renderer/types'
import { SchemaTree } from './schema-tree'
import { TableHeader } from './table-header'
import { TableStructure } from './table-structure'
import { StructureAi } from './structure-ai'
import { DdlDialog } from './ddl-dialog'
import { ConnectionPicker } from './connection-picker'

export function DatabasePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { active } = useConnection()
  const schema = searchParams.get('schema') ?? ''
  const table = searchParams.get('table') ?? ''
  const view = searchParams.get('view')
  const [activeTab, setActiveTab] = React.useState<'data' | 'structure'>(
    view === 'structure' ? 'structure' : 'data'
  )

  React.useEffect(() => {
    setActiveTab(view === 'structure' ? 'structure' : 'data')
  }, [schema, table, view])

  const lastConnectionId = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!active) {
      lastConnectionId.current = null
      return
    }
    if (lastConnectionId.current === active.connectionId) return
    lastConnectionId.current = active.connectionId
    if (schema && table) return
    try {
      const raw = localStorage.getItem(`orbitdb:last-table:${active.connectionId}`)
      if (!raw) return
      const saved = JSON.parse(raw) as { schema?: string; table?: string }
      if (saved.schema && saved.table) {
        navigate(tableRoute(saved.schema, saved.table), { replace: true })
      }
    } catch {
      // ignore unreadable/quota-exceeded localStorage
    }
    // schema/table intentionally not in deps — only restore on connection change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, navigate])

  React.useEffect(() => {
    if (!active || !schema || !table) return
    try {
      localStorage.setItem(
        `orbitdb:last-table:${active.connectionId}`,
        JSON.stringify({ schema, table })
      )
    } catch {
      // ignore quota/private-mode errors
    }
    pushRecent(active.connectionId, { schema, table })
  }, [active, schema, table])

  if (!active) {
    return (
      <main className="flex flex-1 overflow-hidden rounded-xl border border-border bg-surface shadow-lg shadow-black/20">
        <ConnectionPicker />
      </main>
    )
  }

  return (
    <>
      <aside className="flex h-full w-56 shrink-0 flex-col overflow-hidden rounded-xl bg-surface shadow-lg shadow-black/20">
        <SchemaTreeContainer connectionId={active.connectionId} />
      </aside>
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface shadow-lg shadow-black/20">
        {schema && table ? (
          <TableViewContainer
            key={`${schema}.${table}`}
            connectionId={active.connectionId}
            schema={schema}
            table={table}
            activeTab={activeTab}
            onChangeTab={setActiveTab}
          />
        ) : (
          <EmptyState
            icon={<IconDatabase size={20} />}
            title="Select a table"
            description="Pick a table from the sidebar to view its data and structure."
          />
        )}
      </main>
    </>
  )
}

function SchemaTreeContainer({ connectionId }: { connectionId: string }) {
  const { data, error, isLoading, refresh } = useAsync(
    async () => unwrap(window.api.db.listSchemas(connectionId)),
    [connectionId]
  )
  const schemas = (data ?? []).map((s) => s.name)
  if (error) {
    return (
      <div className="p-3">
        <ErrorState message={error} onRetry={refresh} />
      </div>
    )
  }
  return (
    <SchemaTree
      connectionId={connectionId}
      schemas={schemas}
      onRefresh={refresh}
      isLoading={isLoading}
    />
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
  const { data, error, isLoading, refresh } = useAsync<TableDetails>(
    async () => unwrap(window.api.db.tableDetails(connectionId, schema, table)),
    [connectionId, schema, table]
  )

  const ddlDialog = useDisclosure(false)
  const [ddlState, setDdlState] = React.useState<{
    kind: DdlOperationKind
    target?: string
  } | null>(null)
  // Hold the header until the first page of rows lands so the whole view reveals
  // at once (one loader). Sticky once shown — and the structure tab, which has no
  // async load, reveals it immediately. Resets per table via the container key.
  const [headerShown, setHeaderShown] = React.useState(activeTab !== 'data')
  React.useEffect(() => {
    if (activeTab !== 'data') setHeaderShown(true)
  }, [activeTab])

  function openDdl(kind: DdlOperationKind, target?: string) {
    setDdlState({ kind, target })
    ddlDialog.open()
  }

  function handleDdlSuccess(operation: DdlOperation) {
    if (operation.kind === 'rename-table' && data) {
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
        <TableHeader details={data} activeTab={activeTab} onChangeTab={onChangeTab} />
      )}
      {activeTab === 'data' ? (
        <TableDataView
          connectionId={connectionId}
          details={data}
          onRenameTable={canEdit ? () => openDdl('rename-table') : undefined}
          onReady={() => setHeaderShown(true)}
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
