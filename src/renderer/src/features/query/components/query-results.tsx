import {
  IconAlertTriangle,
  IconCheck,
  IconDownload,
  IconLoader,
  IconTable
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { formatCellValue, formatNumber } from '@renderer/lib/format'
import { buildExportFilename, downloadJson } from '@renderer/lib/export'
import type { QueryResult } from '@renderer/types'

interface QueryResultsProps {
  result: QueryResult | null
  isRunning: boolean
}

export function QueryResults({ result, isRunning }: QueryResultsProps) {
  if (isRunning) {
    return (
      <div className="flex h-full items-center justify-center text-text-subtle">
        <IconLoader stroke={2} size={20} className="animate-spin" />
      </div>
    )
  }
  if (!result) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-text-subtle">
        <IconTable size={22} className="text-text-subtle/60" />
        <p className="text-[12px]">Run a query to see results</p>
      </div>
    )
  }
  if (!result.success) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface/40 px-4 py-2 text-[11.5px]">
          <span className="flex items-center gap-1 rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-red-400">
            <IconAlertTriangle size={11} />
            Error
          </span>
          <span className="font-mono text-text-subtle">{result.durationMs} ms</span>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <pre className="whitespace-pre-wrap break-words rounded-md border border-red-500/20 bg-red-500/5 p-3 font-mono text-[12px] text-red-300/90">
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
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface/40 px-4 py-2 text-[11.5px]">
        <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-400">
          <IconCheck size={11} />
          OK
        </span>
        {result.command && (
          <span className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wide text-text-muted">
            {result.command}
          </span>
        )}
        {result.rowCount != null && (
          <span className="text-text-subtle">
            <span className="font-mono text-text">{formatNumber(result.rowCount)}</span> row
            {result.rowCount === 1 ? '' : 's'}
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

      <div className="min-h-0 flex-1 overflow-auto">
        {fields.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[12px] text-text-subtle">
            Query executed successfully. No rows returned.
          </div>
        ) : (
          <table className="min-w-full border-separate border-spacing-0 text-[12.5px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="w-10 border-b border-border bg-surface px-3 py-2 text-left text-[10.5px] font-medium text-text-subtle">
                  #
                </th>
                {fields.map((f) => (
                  <th
                    key={f.name}
                    className="border-b border-border bg-surface px-3 py-2 text-left text-[11.5px] font-medium text-text-muted"
                  >
                    {f.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, idx) => (
                <tr key={idx} className="group cursor-default transition-colors hover:bg-surface-elevated/40">
                  <td className="border-b border-border/60 px-3 py-1.5 text-[10.5px] text-text-subtle">
                    {idx + 1}
                  </td>
                  {fields.map((f) => {
                    const value = row[f.name]
                    return (
                      <td
                        key={f.name}
                        className="max-w-xs truncate border-b border-border/60 px-3 py-1.5 font-mono text-[11.5px] text-text"
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
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
