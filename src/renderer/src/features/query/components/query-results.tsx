import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { IconAlertTriangle, IconCheck, IconDownload, IconTable } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { LoadingState } from '@renderer/components/common/loading-state'
import { formatCellValue, formatNumber } from '@renderer/lib/format'
import { buildExportFilename, downloadJson } from '@renderer/lib/export'
import type { QueryResult } from '@renderer/types'

interface QueryResultsProps {
  result: QueryResult | null
  isRunning: boolean
}

export function QueryResults({ result, isRunning }: QueryResultsProps) {
  if (isRunning) {
    return <LoadingState />
  }
  if (!result) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-text-subtle">
        <IconTable size={22} className="text-text-subtle/60" />
        <p className="text-xs">Run a query to see results</p>
      </div>
    )
  }
  if (!result.success) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface/40 px-4 py-2 text-xs">
          <span className="flex items-center gap-1 rounded-md bg-red-500/10 px-1.5 py-0.5 text-xs font-medium text-red-400">
            <IconAlertTriangle size={11} />
            Error
          </span>
          <span className="font-mono text-text-subtle">{result.durationMs} ms</span>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <pre className="whitespace-pre-wrap break-words rounded-md border border-red-500/20 bg-red-500/5 p-3 font-mono text-xs text-red-300/90">
            {result.error}
          </pre>
        </div>
      </div>
    )
  }

  const fields = result.fields
  const rowsForExport = result.rows
  const canExport = rowsForExport.length > 0

  function handleExport() {
    if (!canExport) return
    downloadJson(buildExportFilename(['query-result'], 'json'), rowsForExport)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface/40 px-4 py-2 text-xs">
        <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-xs font-medium text-emerald-400">
          <IconCheck size={11} />
          OK
        </span>
        {result.command && (
          <span className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-xs uppercase tracking-wide text-text-muted">
            {result.command}
          </span>
        )}
        {result.rowCount != null && (
          <span className="text-text-subtle">
            <span className="font-mono text-text">{formatNumber(result.rowCount)}</span> row
            {result.rowCount === 1 ? '' : 's'}
          </span>
        )}
        {result.truncated && (
          <span
            className="flex items-center gap-1 rounded-md bg-yellow-500/10 px-1.5 py-0.5 text-xs font-medium text-yellow-400"
            title={`Result was truncated to the first ${formatNumber(result.rows.length)} rows. Export to get the full set if your driver supports it.`}
          >
            <IconAlertTriangle size={11} />
            Truncated to {formatNumber(result.rows.length)}
          </span>
        )}
        <span className="ml-auto font-mono text-text-subtle">{result.durationMs} ms</span>
        {canExport && (
          <Button
            size="sm"
            variant="ghost"
            className="-my-1 h-6 px-2 text-text-muted hover:bg-surface-elevated hover:text-text"
            onClick={handleExport}
          >
            <IconDownload size={11} />
            Export
          </Button>
        )}
      </div>

      {fields.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-text-subtle">
          Query executed successfully. No rows returned.
        </div>
      ) : (
        <ResultTable rows={result.rows} fields={fields} />
      )}
    </div>
  )
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
    estimateSize: () => 28,
    overscan: 10
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0
  const colSpan = fields.length + 1

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
      <table className="min-w-full border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="w-10 border-b border-border bg-surface px-3 py-2 text-left text-xs font-medium text-text-subtle">
              #
            </th>
            {fields.map((f) => (
              <th
                key={f.name}
                className="border-b border-border bg-surface px-3 py-2 text-left text-xs font-medium text-text-muted"
              >
                {f.name}
              </th>
            ))}
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
                className="group cursor-default transition-colors hover:bg-surface-elevated/40"
              >
                <td className="border-b border-border/60 px-3 py-1.5 text-xs text-text-subtle">
                  {virtualRow.index + 1}
                </td>
                {fields.map((f) => {
                  const value = row[f.name]
                  return (
                    <td
                      key={f.name}
                      className="max-w-xs truncate border-b border-border/60 px-3 py-1.5 font-mono text-xs text-text"
                      title={formatCellValue(value)}
                    >
                      {value === null ? (
                        <span className="italic text-text-subtle">NULL</span>
                      ) : (
                        formatCellValue(value)
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
