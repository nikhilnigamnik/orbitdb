import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconDatabase,
  IconTable,
  IconEye,
  IconStack2,
  IconArrowRight,
  IconUnlink
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { ErrorState } from '@renderer/components/common/error-state'
import { LoadingState } from '@renderer/components/common/loading-state'
import { useAsync } from '@renderer/hooks/use-async'
import { unwrap } from '@renderer/lib/ipc'
import { formatBytes, formatNumber } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { ROUTES, tableRoute } from '@renderer/config/routes'
import { BrokenRefsDialog } from './broken-refs-dialog'
import { collapseSql } from '@renderer/features/query/lib/query-library'
import type { ConnectionOverview as Overview, SavedQuery, TableSize } from '@renderer/types'

interface ConnectionOverviewProps {
  connectionId: string
  /** Which schema a database-wide check runs against. Empty until one is known. */
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
export function ConnectionOverview({ connectionId, schema }: ConnectionOverviewProps) {
  const [isCheckingRefs, setIsCheckingRefs] = React.useState(false)
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

  if (isLoading) return <LoadingState />
  if (error) {
    return (
      <div className="p-6">
        <ErrorState message={error} onRetry={refresh} />
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-text">
            <IconDatabase size={15} className="text-text-subtle" />
            {data.databaseName || 'Database'}
          </h1>
          {data.serverVersion && (
            <p className="truncate text-xs text-text-subtle" title={data.serverVersion}>
              {data.serverVersion}
            </p>
          )}
        </header>

        {/* A database-wide check belongs on the database-wide page, and this is
            the one screen that is about the connection rather than a table. */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-elevated/20 px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-medium text-text">Check references</span>
            <span className="text-[11px] text-text-subtle">
              Find rows pointing at parents that no longer exist, including columns with no foreign
              key.
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-text-muted hover:bg-surface-elevated hover:text-text"
            onClick={() => setIsCheckingRefs(true)}
            disabled={!schema}
          >
            <IconUnlink size={12} />
            Check
          </Button>
        </div>

        <BrokenRefsDialog
          isOpen={isCheckingRefs}
          onClose={() => setIsCheckingRefs(false)}
          connectionId={connectionId}
          schema={schema}
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            icon={<IconTable size={13} />}
            label="Tables"
            value={formatNumber(data.tableCount)}
          />
          <Stat icon={<IconEye size={13} />} label="Views" value={formatNumber(data.viewCount)} />
          <Stat
            icon={<IconStack2 size={13} />}
            label="Schemas"
            value={formatNumber(data.schemaCount)}
          />
          <Stat
            icon={<IconDatabase size={13} />}
            label="Size"
            // D1 reports no size at all rather than a zero.
            value={data.totalBytes == null ? 'n/a' : formatBytes(data.totalBytes)}
          />
        </div>

        {data.largestTables.length > 0 && (
          <LargestTables tables={data.largestTables} hasSizes={data.totalBytes != null} />
        )}

        {queries.length > 0 && <RecentQueries queries={queries} />}
      </div>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface-elevated/20 p-3">
      <span className="flex items-center gap-1.5 text-[10px] tracking-wide text-text-subtle uppercase">
        {icon}
        {label}
      </span>
      <span className="font-mono text-sm text-text tabular-nums">{value}</span>
    </div>
  )
}

function LargestTables({ tables, hasSizes }: { tables: TableSize[]; hasSizes: boolean }) {
  const navigate = useNavigate()
  // The bar is relative to the biggest table here, not to the database: this is
  // a ranking, and against a total the small ones would all render as nothing.
  const largest = Math.max(...tables.map((t) => t.bytes ?? t.estimatedRows ?? 0), 1)

  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <h2 className="border-b border-border bg-surface-elevated/20 px-3 py-2 text-[10px] font-semibold tracking-wide text-text-subtle uppercase">
        {hasSizes ? 'Largest tables' : 'Tables by row count'}
      </h2>
      <div className="divide-y divide-border/60">
        {tables.map((table) => {
          const weight = table.bytes ?? table.estimatedRows ?? 0
          return (
            <button
              key={`${table.schema}.${table.name}`}
              type="button"
              onClick={() => navigate(tableRoute(table.schema, table.name))}
              className="group flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-elevated/50"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-text">
                {table.name}
              </span>
              <span className="hidden shrink-0 font-mono text-[10px] text-text-subtle sm:inline">
                {table.estimatedRows == null ? '' : `~${formatNumber(table.estimatedRows)} rows`}
              </span>
              {table.bytes != null && (
                <span className="w-16 shrink-0 text-right font-mono text-xs text-text-muted tabular-nums">
                  {formatBytes(table.bytes)}
                </span>
              )}
              <span className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-surface-elevated">
                <span
                  className="block h-full rounded-full bg-accent-text/50"
                  style={{ width: `${Math.max(2, (weight / largest) * 100)}%` }}
                />
              </span>
              <IconArrowRight
                size={12}
                className="shrink-0 text-text-subtle opacity-0 transition-opacity group-hover:opacity-100"
              />
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
    <section className="overflow-hidden rounded-lg border border-border">
      <h2 className="border-b border-border bg-surface-elevated/20 px-3 py-2 text-[10px] font-semibold tracking-wide text-text-subtle uppercase">
        Recent queries
      </h2>
      <div className="divide-y divide-border/60">
        {queries.map((query) => (
          <button
            key={query.id}
            type="button"
            onClick={() => navigate(ROUTES.query)}
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-elevated/50"
            title={collapseSql(query.sql)}
          >
            <span
              className={cn(
                'min-w-0 flex-1 truncate font-mono text-xs',
                query.success ? 'text-text-muted' : 'text-danger'
              )}
            >
              {query.name?.trim() || collapseSql(query.sql)}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-text-subtle">
              {query.durationMs} ms
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
