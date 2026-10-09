import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconPlug,
  IconSchema
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { PageHeader } from '@renderer/components/layout/page-header'
import { EmptyState } from '@renderer/components/common/empty-state'
import { ErrorState } from '@renderer/components/common/error-state'
import { LoadingState } from '@renderer/components/common/loading-state'
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
      <DiagramFrame>
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            icon={<IconPlug size={20} />}
            title="No active connection"
            description="Pick a connection to see the schema diagram."
            action={
              <Button size="sm" variant="outline" onClick={() => navigate(ROUTES.connections)}>
                Go to connections
              </Button>
            }
          />
        </div>
      </DiagramFrame>
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
    // onPickSchema intentionally excluded - stable through render lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemasState.data, schema])

  if (schemasState.error) {
    return (
      <DiagramFrame>
        <div className="p-4">
          <ErrorState
            title="Failed to load schemas"
            message={schemasState.error}
            onRetry={schemasState.refresh}
          />
        </div>
      </DiagramFrame>
    )
  }

  if (!schemasState.data || !schema) {
    return (
      <DiagramFrame>
        <LoadingState />
      </DiagramFrame>
    )
  }

  return (
    <DiagramView
      connectionId={connectionId}
      schemas={schemasState.data.map((s) => s.name)}
      schema={schema}
      onPickSchema={onPickSchema}
    />
  )
}

const DIAGRAM_CRUMB = { label: 'Diagram', icon: <IconSchema /> }

/**
 * The page header plus the canvas area under it. Every state renders inside
 * one, so a loader or an error sits in the same spot the diagram will.
 */
function DiagramFrame({
  adornment,
  children
}: {
  adornment?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <PageHeader breadcrumbs={[DIAGRAM_CRUMB]} titleAdornment={adornment} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}

interface SchemaPickerProps {
  schemas: string[]
  activeSchema: string
  onPickSchema: (name: string) => void
}

/** The schema reads as the breadcrumb's last step, and opens a menu to switch it. */
function SchemaPicker({ schemas, activeSchema, onPickSchema }: SchemaPickerProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover
      openPopover={open}
      setOpenPopover={setOpen}
      align="start"
      popoverContentClassName="w-56 overflow-hidden"
      content={
        <div className="flex max-h-64 flex-col overflow-auto p-1">
          <p className="flex h-7 items-center px-2 text-[12px] font-medium text-text-subtle">
            Schemas
          </p>
          {schemas.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                onPickSchema(name)
                setOpen(false)
              }}
              className={cn(
                'flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-surface-elevated',
                activeSchema === name ? 'font-medium text-text' : 'text-text-muted'
              )}
            >
              <IconSchema size={16} className="shrink-0 text-text-subtle" />
              <span className="min-w-0 flex-1 truncate">{name}</span>
              {activeSchema === name && <IconCheck size={14} className="shrink-0 text-accent" />}
            </button>
          ))}
        </div>
      }
    >
      <Button size="sm" variant="subtle" className="-ml-1 gap-1 px-1.5 text-sm text-text">
        {activeSchema}
        <IconChevronDown size={14} className="text-text-subtle" />
      </Button>
    </Popover>
  )
}

interface DiagramViewProps {
  connectionId: string
  schemas: string[]
  schema: string
  onPickSchema: (name: string) => void
}

function DiagramView({ connectionId, schemas, schema, onPickSchema }: DiagramViewProps) {
  const { data, error, isLoading, refresh } = useAsync<SchemaGraph>(
    async () => unwrap(window.api.db.schemaGraph(connectionId, schema)),
    [connectionId, schema]
  )

  const [hasLoadedOnce, setHasLoadedOnce] = React.useState(false)
  React.useEffect(() => {
    if (data) setHasLoadedOnce(true)
  }, [data])

  const picker = (
    <span className="flex items-center gap-1">
      <IconChevronRight size={14} className="shrink-0 text-text-subtle/70" />
      <SchemaPicker schemas={schemas} activeSchema={schema} onPickSchema={onPickSchema} />
    </span>
  )

  // Until the graph loads the first time, hold the schema picker back so the
  // header does not change twice on the way in; the loader sits where the
  // schema-list loader did, so arriving is one continuous spinner.
  if (!hasLoadedOnce) {
    if (isLoading) {
      return (
        <DiagramFrame>
          <LoadingState />
        </DiagramFrame>
      )
    }
    if (error) {
      return (
        <DiagramFrame>
          <div className="p-4">
            <ErrorState title="Failed to load schema graph" message={error} onRetry={refresh} />
          </div>
        </DiagramFrame>
      )
    }
  }

  return (
    <DiagramFrame adornment={picker}>
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <div className="p-4">
          <ErrorState title="Failed to load schema graph" message={error} onRetry={refresh} />
        </div>
      ) : !data || data.tables.length === 0 ? (
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            icon={<IconSchema size={20} />}
            title="No tables in this schema"
            description="Pick a different schema from the toolbar."
          />
        </div>
      ) : (
        <SchemaGraphCanvas graph={data} schema={schema} connectionId={connectionId} />
      )}
    </DiagramFrame>
  )
}
