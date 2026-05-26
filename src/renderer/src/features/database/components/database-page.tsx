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
import { ROUTES } from '@renderer/config/routes'
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

  if (!active) {
    return (
      <div className="flex h-full items-center justify-center p-6">
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
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <div className="w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)]/40 pt-8">
        <SchemaTreeContainer connectionId={active.connectionId} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
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
      </div>
    </div>
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
