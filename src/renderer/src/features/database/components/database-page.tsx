import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { IconDatabase, IconPlug } from '@tabler/icons-react'
import { EmptyState } from '@renderer/components/common/empty-state'
import { ErrorState } from '@renderer/components/common/error-state'
import { Spinner } from '@renderer/components/ui/spinner'
import { Button } from '@renderer/components/ui/button'
import { useAsync } from '@renderer/hooks/use-async'
import { unwrap } from '@renderer/lib/ipc'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { TableDataView } from '@renderer/features/tables/components/table-data-view'
import { ROUTES, tableRoute } from '@renderer/config/routes'
import { pushRecent } from '@renderer/features/database/lib/table-prefs'
import type { TableDetails } from '@renderer/types'
import { SchemaTree } from './schema-tree'
import { TableHeader } from './table-header'
import { TableStructure } from './table-structure'

export function DatabasePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { active } = useConnection()
  const schema = searchParams.get('schema') ?? ''
  const table = searchParams.get('table') ?? ''
  const [activeTab, setActiveTab] = React.useState<'data' | 'structure'>('data')

  React.useEffect(() => {
    setActiveTab('data')
  }, [schema, table])

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
      <main className="flex flex-1 items-center justify-center rounded-xl border border-border bg-surface p-6 shadow-lg shadow-black/20">
        <EmptyState
          icon={<IconPlug size={24} />}
          title="No active connection"
          description="Pick a connection to start browsing schemas and tables."
          action={
            <Button
              size="sm"
              className="bg-accent text-white hover:bg-accent/90"
              onClick={() => navigate(ROUTES.connections)}
            >
              Go to connections
            </Button>
          }
        />
      </main>
    )
  }

  return (
    <>
      <aside className="flex h-full w-56 shrink-0 flex-col overflow-hidden rounded-xl  bg-surface shadow-lg shadow-black/20">
        <SchemaTreeContainer connectionId={active.connectionId} />
      </aside>
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl  bg-surface shadow-lg shadow-black/20">
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
  const { data, error, isLoading, refresh } = useAsync<TableDetails>(
    async () => unwrap(window.api.db.tableDetails(connectionId, schema, table)),
    [connectionId, schema, table]
  )

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size={20} />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="p-4">
        <ErrorState message={error ?? 'No table details'} onRetry={refresh} />
      </div>
    )
  }

  return (
    <>
      <TableHeader details={data} activeTab={activeTab} onChangeTab={onChangeTab} />
      {activeTab === 'data' ? (
        <TableDataView connectionId={connectionId} details={data} />
      ) : (
        <TableStructure details={data} />
      )}
    </>
  )
}
