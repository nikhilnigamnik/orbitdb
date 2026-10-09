import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  IconAlertTriangle,
  IconBraces,
  IconCalendar,
  IconCheck,
  IconDownload,
  IconHash,
  IconId,
  IconLetterCase,
  IconSparkles,
  IconTable,
  IconToggleLeft
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { Spinner } from '@renderer/components/ui/spinner'
import { LoadingState } from '@renderer/components/common/loading-state'
import { formatCellValue, formatNumber } from '@renderer/lib/format'
import { ExportMenu } from '@renderer/features/tables/components/export-menu'
import { pgTypeToUdt } from '@renderer/lib/pg-types'
import { cn } from '@renderer/lib/utils'
import type { QueryResult } from '@renderer/types'
import { AiKeyRequired, isMissingAiKeyError } from '@renderer/components/common/ai-key-required'

interface QueryResultsProps {
  result: QueryResult | null
  isRunning: boolean
  /** Offered on an error the database returned, never on an AI failure shown here. */
  onFixWithAi?: () => void
  isFixing?: boolean
}

/** What a screen reader hears when a run finishes, since the strip itself is not focusable. */
function announcement(result: QueryResult | null, isRunning: boolean): string {
  if (isRunning) return 'Running query'
  if (!result) return ''
  if (!result.success) {
    // The message itself is in the pane below; repeating a long driver error
    // here would read it out twice.
    return isMissingAiKeyError(result.error) ? 'AI is not set up yet' : 'Query failed'
  }
  const rows =
    result.rowCount == null
      ? 'Query succeeded'
      : `Query returned ${formatNumber(result.rowCount)} row${result.rowCount === 1 ? '' : 's'}`
  const truncated = result.truncated
    ? `. Showing only the first ${formatNumber(result.rows.length)}`
    : ''
  return `${rows} in ${result.durationMs} ms${truncated}`
}

/**
 * The live region sits outside the body so it survives the switch between the
 * loading, error and result layouts - a region mounted already holding its text
 * is not reliably announced.
 */
export function QueryResults(props: QueryResultsProps) {
  const { result, isRunning } = props
  return (
    <div className="flex h-full flex-col">
      <p role="status" className="sr-only">
        {announcement(result, isRunning)}
      </p>
      <div className="min-h-0 flex-1">
        <QueryResultsBody {...props} />
      </div>
    </div>
  )
}

function QueryResultsBody({ result, isRunning, onFixWithAi, isFixing }: QueryResultsProps) {
  if (isRunning) {
    return <LoadingState />
  }
  if (!result) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface text-center">
        <div className="flex size-10 items-center justify-center rounded-xl bg-surface-elevated">
          <IconTable size={20} className="text-text-subtle" />
        </div>
        <p className="text-sm font-medium text-text">Run a query to see results</p>
      </div>
    )
  }
  // A missing API key reached this pane only because the AI prompt failed - it is
  // not a query error, and dressing it in red says the database rejected it.
  if (!result.success && isMissingAiKeyError(result.error)) {
    return (
      <div className="flex h-full items-center justify-center">
        <AiKeyRequired />
      </div>
    )
  }
  if (!result.success) {
    return (
      <div className="flex h-full flex-col bg-surface">
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <pre className="rounded-lg border border-danger/20 bg-danger/5 p-3 font-mono text-xs break-words whitespace-pre-wrap text-danger">
            {result.error}
          </pre>
          {/* Beside the error it acts on, where the eye already is. */}
          {onFixWithAi && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={onFixWithAi}
              disabled={isFixing}
            >
              {isFixing ? (
                <Spinner size={14} className="text-current" />
              ) : (
                <IconSparkles size={14} className="text-accent-text" />
              )}
              {isFixing ? 'Fixing…' : 'Fix with AI'}
            </Button>
          )}
        </div>
        <ResultsFooter>
          <Chip tone="rose">
            <IconAlertTriangle size={12} />
            Error
          </Chip>
          <span className="ml-auto">
            <span className="text-text tabular-nums">{result.durationMs}</span> ms
          </span>
        </ResultsFooter>
      </div>
    )
  }

  const fields = result.fields
  const canExport = result.rows.length > 0

  return (
    <div className="flex h-full flex-col bg-surface">
      {fields.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-text-muted">
          Query executed successfully. No rows returned.
        </div>
      ) : (
        <ResultTable rows={result.rows} fields={fields} />
      )}

      <ResultsFooter>
        <Chip tone="emerald">
          <IconCheck size={12} />
          Success
        </Chip>
        {result.command && <Chip className="font-mono">{result.command}</Chip>}
        {result.rowCount != null && (
          <span>
            <span className="text-text tabular-nums">{formatNumber(result.rowCount)}</span> row
            {result.rowCount === 1 ? '' : 's'}
          </span>
        )}
        {result.truncated && (
          <>
            <Chip tone="amber">
              <IconAlertTriangle size={12} />
              Truncated to {formatNumber(result.rows.length)}
            </Chip>
            {/* Visible rather than in a tooltip: it is the reason the count is
                short, and export only has these rows too. */}
            <span className="min-w-0 truncate text-text-subtle">
              Narrow the query to see the rest
            </span>
          </>
        )}
        <span className="ml-auto">
          <span className="text-text tabular-nums">{result.durationMs}</span> ms
        </span>
        {canExport && (
          // The same three formats the data grid offers - this used to hand you
          // JSON with no indication the others existed.
          <ExportMenu
            rows={result.rows}
            columns={fields.map((f) => f.name)}
            filenameParts={['query-result']}
            side="top"
            align="end"
          >
            <Button size="xs" variant="subtle">
              <IconDownload size={14} />
              Export
            </Button>
          </ExportMenu>
        )}
      </ResultsFooter>
    </div>
  )
}

function ResultsFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2.5 border-t border-border bg-surface px-4 text-xs text-text-muted">
      {children}
    </div>
  )
}

type ColumnKind = 'number' | 'bool' | 'date' | 'json' | 'uuid' | 'text'

const KIND_ICON: Record<ColumnKind, typeof IconHash> = {
  number: IconHash,
  bool: IconToggleLeft,
  date: IconCalendar,
  json: IconBraces,
  uuid: IconId,
  text: IconLetterCase
}

/**
 * A result set carries no declared types beyond Postgres's OIDs, so the header
 * icon falls back to the first non-null value in the column. It only picks an
 * icon and an alignment - nothing about the value itself depends on the guess.
 */
function columnKind(
  field: QueryResult['fields'][number],
  rows: Record<string, unknown>[]
): ColumnKind {
  const udt = pgTypeToUdt(field.dataTypeID)
  if (udt === 'bool') return 'bool'
  if (udt === 'json' || udt === 'jsonb') return 'json'
  if (udt === 'uuid') return 'uuid'
  if (udt) return 'date'
  const sample = rows.find((row) => row[field.name] != null)?.[field.name]
  if (typeof sample === 'number' || typeof sample === 'bigint') return 'number'
  if (typeof sample === 'boolean') return 'bool'
  if (sample instanceof Date) return 'date'
  if (sample !== undefined && typeof sample === 'object') return 'json'
  return 'text'
}

interface ResultTableProps {
  rows: Record<string, unknown>[]
  fields: QueryResult['fields']
}

function ResultTable({ rows, fields }: ResultTableProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 10
  })

  const kinds = React.useMemo(() => fields.map((f) => columnKind(f, rows)), [fields, rows])
  const virtualItems = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0
  const colSpan = fields.length + 1

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
      <table className="min-w-full border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="h-9 w-10 border-r border-b border-border bg-surface px-3 text-right text-xs font-medium text-text-subtle">
              #
            </th>
            {fields.map((f, i) => {
              const KindIcon = KIND_ICON[kinds[i]]
              return (
                <th
                  key={f.name}
                  className="h-9 border-r border-b border-border bg-surface px-3 text-left text-xs font-medium whitespace-nowrap text-text-muted"
                >
                  <span
                    className={cn(
                      'flex items-center gap-1.5',
                      kinds[i] === 'number' && 'justify-end'
                    )}
                  >
                    <KindIcon size={14} className="shrink-0 text-text-subtle" />
                    {f.name}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden="true">
              <td colSpan={colSpan} style={{ height: paddingTop, padding: 0, border: 0 }} />
            </tr>
          )}
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index]
            return (
              <tr
                key={virtualRow.index}
                className="group cursor-default transition-colors hover:bg-surface-elevated/60"
              >
                <td className="h-9 border-r border-b border-border px-3 text-right text-xs text-text-subtle tabular-nums">
                  {virtualRow.index + 1}
                </td>
                {fields.map((f, i) => {
                  const value = row[f.name]
                  // Postgres reports its type OID here, which is enough to render
                  // a timestamptz with its offset like the data grid does.
                  const display = formatCellValue(value, pgTypeToUdt(f.dataTypeID))
                  return (
                    <td
                      key={f.name}
                      className={cn(
                        'h-9 max-w-xs truncate border-r border-b border-border px-3 text-sm text-text tabular-nums',
                        i === 0 && 'font-medium',
                        kinds[i] === 'number' && 'text-right'
                      )}
                      title={display}
                    >
                      {value === null ? (
                        <span className="font-normal text-text-subtle">NULL</span>
                      ) : (
                        display
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden="true">
              <td colSpan={colSpan} style={{ height: paddingBottom, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
