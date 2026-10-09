import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconArrowRight,
  IconChartBar,
  IconDatabase,
  IconEye,
  IconHash,
  IconStack2,
  IconTable,
  IconTerminal2,
  IconUnlink
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { PageHeader } from '@renderer/components/layout/page-header'
import { ErrorState } from '@renderer/components/common/error-state'
import { LoadingState } from '@renderer/components/common/loading-state'
import { useAsync } from '@renderer/hooks/use-async'
import { unwrap } from '@renderer/lib/ipc'
import { formatBytes, formatNumber, shortServerVersion } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { ROUTES, tableRoute } from '@renderer/config/routes'
import { useConnection } from '@renderer/features/connections/store/connection-store'
import { collapseSql } from '@renderer/features/query/lib/query-library'
import type { ConnectionOverview as Overview, SavedQuery, TableSize } from '@renderer/types'

import { BrokenRefsDialog } from './broken-refs-dialog'
import { defaultSchema } from './default-schema'

interface ConnectionOverviewProps {
  connectionId: string
  /**
   * From the URL, which is empty on the overview itself - so the check falls
   * back to the schema the sidebar would open rather than staying disabled.
   */
  schema: string
}

/**
 * What you land on after connecting.
 *
 * The alternative was an empty pane telling you to pick a table, which asks a
 * question the app is better placed to answer: this is a database you may not
 * have opened before, and its shape - how many tables, how big, which ones
 * carry the weight - is the first thing worth knowing.
 */
export function ConnectionOverview({
  connectionId,
  schema: schemaFromUrl
}: ConnectionOverviewProps) {
  const { current, active } = useConnection()
  const currentDatabase = active?.currentDatabase
  const [isCheckingRefs, setIsCheckingRefs] = React.useState(false)
  const [resolvedSchema, setResolvedSchema] = React.useState('')
  const schema = schemaFromUrl || resolvedSchema

  React.useEffect(() => {
    if (schemaFromUrl) return
    let isCurrent = true
    void unwrap(window.api.db.listSchemas(connectionId))
      .then((schemas) => {
        if (isCurrent)
          setResolvedSchema(
            defaultSchema(
              schemas.map((s) => s.name),
              currentDatabase
            )
          )
      })
      .catch(() => {
        // Leaves the check disabled; the overview itself is still worth showing.
      })
    return () => {
      isCurrent = false
    }
  }, [connectionId, schemaFromUrl, currentDatabase])
  const { data, error, isLoading, refresh } = useAsync<Overview>(
    async () => unwrap(window.api.db.overview(connectionId)),
    [connectionId]
  )

  const [queries, setQueries] = React.useState<SavedQuery[]>([])
  React.useEffect(() => {
    let isCurrent = true
    void unwrap(window.api.queries.list(connectionId))
      .then((list) => {
        if (isCurrent) setQueries(list.slice(0, 5))
      })
      .catch(() => {
        // The overview is still worth showing without them.
      })
    return () => {
      isCurrent = false
    }
  }, [connectionId])

  const header = (
    <PageHeader
      breadcrumbs={[
        { label: current?.name ?? 'Browser', icon: <IconDatabase /> },
        // D1 names the database after the connection, so the crumb would just
        // repeat itself - "Octo > Octo".
        {
          label:
            data?.databaseName && data.databaseName !== current?.name
              ? data.databaseName
              : 'Overview'
        }
      ]}
      titleAdornment={
        data?.serverVersion ? (
          <span title={data.serverVersion}>
            <Chip>{shortServerVersion(data.serverVersion)}</Chip>
          </span>
        ) : undefined
      }
    />
  )

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <LoadingState />
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="p-4">
          <ErrorState message={error} onRetry={refresh} />
        </div>
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex w-full flex-col gap-4 px-4 py-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              icon={<IconTable size={14} />}
              label="Tables"
              value={formatNumber(data.tableCount)}
            />
            <Stat icon={<IconEye size={14} />} label="Views" value={formatNumber(data.viewCount)} />
            <Stat
              icon={<IconStack2 size={14} />}
              label="Schemas"
              value={formatNumber(data.schemaCount)}
            />
            <Stat
              icon={<IconDatabase size={14} />}
              label="Size"
              // D1 reports no size at all rather than a zero.
              value={data.totalBytes == null ? 'n/a' : formatBytes(data.totalBytes)}
            />
          </div>

          {/* A database-wide check belongs on the database-wide page, and this is
              the one screen that is about the connection rather than a table. */}
          <section className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="text-sm font-semibold text-text">Check references</h2>
              <p className="text-xs text-text-muted">
                Find rows pointing at parents that no longer exist, including columns with no
                foreign key.
              </p>
            </div>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => setIsCheckingRefs(true)}
              disabled={!schema}
            >
              <IconUnlink size={14} />
              Check
            </Button>
          </section>

          <BrokenRefsDialog
            isOpen={isCheckingRefs}
            onClose={() => setIsCheckingRefs(false)}
            connectionId={connectionId}
            schema={schema}
          />

          {data.largestTables.length > 0 && (
            <LargestTables tables={data.largestTables} hasSizes={data.totalBytes != null} />
          )}

          {queries.length > 0 && <RecentQueries queries={queries} />}
        </div>
      </div>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface px-4 py-3">
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-muted">
        <span className="text-text-subtle">{icon}</span>
        {label}
      </span>
      <span className="text-xl font-semibold text-text tabular-nums">{value}</span>
    </div>
  )
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="flex h-11 items-center border-b border-border px-4 text-sm font-semibold text-text">
      {title}
    </h2>
  )
}

/** Attio's column header: a 14px type icon in front of a muted label. */
function HeaderCell({
  icon,
  label,
  className
}: {
  icon: React.ReactNode
  label: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex h-9 min-w-0 items-center gap-1.5 border-r border-border px-3 text-xs font-medium text-text-muted last:border-r-0',
        className
      )}
    >
      <span className="shrink-0 text-text-subtle">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  )
}

function LargestTables({ tables, hasSizes }: { tables: TableSize[]; hasSizes: boolean }) {
  const navigate = useNavigate()
  // The bar is relative to the biggest table here, not to the database: this is
  // a ranking, and against a total the small ones would all render as nothing.
  const largest = Math.max(...tables.map((t) => t.bytes ?? t.estimatedRows ?? 0), 1)
  const columns = hasSizes
    ? 'grid-cols-[minmax(0,1fr)_8rem_7rem_10rem]'
    : 'grid-cols-[minmax(0,1fr)_8rem_10rem]'
  const cell = 'flex h-9 min-w-0 items-center border-r border-border px-3 last:border-r-0'

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <SectionHeading title={hasSizes ? 'Largest tables' : 'Tables by row count'} />
      <div className={cn('grid border-b border-border', columns)}>
        <HeaderCell icon={<IconTable size={14} />} label="Table" />
        <HeaderCell icon={<IconHash size={14} />} label="Rows" className="justify-end" />
        {hasSizes && (
          <HeaderCell icon={<IconDatabase size={14} />} label="Size" className="justify-end" />
        )}
        <HeaderCell icon={<IconChartBar size={14} />} label="Share" />
      </div>
      <div className="divide-y divide-border">
        {tables.map((table) => {
          const weight = table.bytes ?? table.estimatedRows ?? 0
          return (
            <button
              key={`${table.schema}.${table.name}`}
              type="button"
              onClick={() => navigate(tableRoute(table.schema, table.name))}
              className={cn(
                'group grid w-full cursor-pointer text-left text-sm transition-colors hover:bg-surface-elevated/60',
                columns
              )}
            >
              <span className={cn(cell, 'gap-2')}>
                <IconTable size={16} className="shrink-0 text-text-subtle" />
                <span className="truncate font-medium text-text">{table.name}</span>
                <IconArrowRight
                  size={14}
                  className="ml-auto shrink-0 text-text-subtle opacity-0 transition-opacity group-hover:opacity-100"
                />
              </span>
              <span className={cn(cell, 'justify-end text-text tabular-nums')}>
                {table.estimatedRows == null ? '' : `~${formatNumber(table.estimatedRows)}`}
              </span>
              {hasSizes && (
                <span className={cn(cell, 'justify-end text-text-muted tabular-nums')}>
                  {table.bytes == null ? '' : formatBytes(table.bytes)}
                </span>
              )}
              <span className={cell}>
                <span className="h-1 w-full overflow-hidden rounded-full bg-surface-active">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${Math.max(2, (weight / largest) * 100)}%` }}
                  />
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function RecentQueries({ queries }: { queries: SavedQuery[] }) {
  const navigate = useNavigate()
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <SectionHeading title="Recent queries" />
      <div className="divide-y divide-border">
        {queries.map((query) => (
          <button
            key={query.id}
            type="button"
            onClick={() => navigate(ROUTES.query)}
            className="flex h-9 w-full cursor-pointer items-center gap-3 px-4 text-left transition-colors hover:bg-surface-elevated/60"
            title={collapseSql(query.sql)}
          >
            <IconTerminal2 size={16} className="shrink-0 text-text-subtle" />
            <span
              className={cn(
                'min-w-0 flex-1 truncate font-mono text-xs',
                query.success ? 'text-text' : 'text-danger'
              )}
            >
              {query.name?.trim() || collapseSql(query.sql)}
            </span>
            <span className="shrink-0 text-[12px] text-text-subtle tabular-nums">
              {query.durationMs} ms
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
