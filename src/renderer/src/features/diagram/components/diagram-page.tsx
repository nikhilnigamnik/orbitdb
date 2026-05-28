import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { IconPlug, IconSchema } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '@renderer/components/common/empty-state'
import { ErrorState } from '@renderer/components/common/error-state'
import { Spinner } from '@renderer/components/ui/spinner'
import { Popover } from '@renderer/components/ui/popover'
import { useAsync } from '@renderer/hooks/use-async'
import { unwrap } from '@renderer/lib/ipc'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { ROUTES } from '@renderer/config/routes'
import { cn } from '@renderer/lib/utils'
import type { SchemaGraph, SchemaInfo } from '@renderer/types'
import { SchemaGraphCanvas } from './schema-graph-canvas'

export function DiagramPage() {
  const navigate = useNavigate()
  const { active } = useConnection()
  const [searchParams, setSearchParams] = useSearchParams()
  const schemaParam = searchParams.get('schema')

  if (!active) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={<IconPlug size={24} />}
          title="No active connection"
          description="Pick a connection to see the schema diagram."
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
    <DiagramContent
      connectionId={active.connectionId}
      schema={schemaParam}
      onPickSchema={(name) => setSearchParams({ schema: name }, { replace: true })}
    />
  )
}

interface DiagramContentProps {
  connectionId: string
  schema: string | null
  onPickSchema: (name: string) => void
}

function DiagramContent({ connectionId, schema, onPickSchema }: DiagramContentProps) {
  const schemasState = useAsync<SchemaInfo[]>(
    async () => unwrap(window.api.db.listSchemas(connectionId)),
    [connectionId]
  )

  React.useEffect(() => {
    if (schema) return
    const first = schemasState.data?.[0]?.name
    if (first) onPickSchema(first)
    // onPickSchema intentionally excluded — stable through render lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemasState.data, schema])

  if (schemasState.error) {
    return (
      <div className="p-4">
        <ErrorState
          title="Failed to load schemas"
          message={schemasState.error}
          onRetry={schemasState.refresh}
        />
      </div>
    )
  }

  if (!schemasState.data || !schema) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size={20} />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DiagramToolbar
        schemas={schemasState.data.map((s) => s.name)}
        activeSchema={schema}
        onPickSchema={onPickSchema}
      />
      <div className="min-h-0 flex-1">
        <GraphContainer connectionId={connectionId} schema={schema} />
      </div>
    </div>
  )
}

interface DiagramToolbarProps {
  schemas: string[]
  activeSchema: string
  onPickSchema: (name: string) => void
}

function DiagramToolbar({ schemas, activeSchema, onPickSchema }: DiagramToolbarProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-2">
      <IconSchema size={14} className="text-text-subtle" />
      <span className="text-[11.5px] text-text-subtle">Schema</span>
      <Popover
        openPopover={open}
        setOpenPopover={setOpen}
        align="start"
        popoverContentClassName="w-56 overflow-hidden shadow-xl shadow-black/40"
        content={
          <div className="flex max-h-64 flex-col overflow-auto p-1">
            {schemas.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onPickSchema(name)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full cursor-pointer items-center rounded-md px-2 py-1.5 text-left font-mono text-[11.5px] hover:bg-surface-elevated',
                  activeSchema === name ? 'text-text' : 'text-text-muted'
                )}
              >
                {name}
              </button>
            ))}
          </div>
        }
      >
        <Button size="sm" variant="ghost" className="font-mono text-[12px] text-text">
          {activeSchema}
        </Button>
      </Popover>
    </div>
  )
}

interface GraphContainerProps {
  connectionId: string
  schema: string
}

function GraphContainer({ connectionId, schema }: GraphContainerProps) {
  const { data, error, isLoading, refresh } = useAsync<SchemaGraph>(
    async () => unwrap(window.api.db.schemaGraph(connectionId, schema)),
    [connectionId, schema]
  )

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={20} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <ErrorState title="Failed to load schema graph" message={error} onRetry={refresh} />
      </div>
    )
  }

  if (!data || data.tables.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={<IconSchema size={20} />}
          title="No tables in this schema"
          description="Pick a different schema from the toolbar."
        />
      </div>
    )
  }

  return <SchemaGraphCanvas graph={data} />
}
