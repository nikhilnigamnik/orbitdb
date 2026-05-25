import { Badge } from '@renderer/components/ui/badge'
import { formatCellValue, formatNumber } from '@renderer/lib/format'
import type { QueryResult } from '@renderer/types'

interface QueryResultsProps {
  result: QueryResult | null
  isRunning: boolean
}

export function QueryResults({ result, isRunning }: QueryResultsProps) {
  if (isRunning) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Running…
      </div>
    )
  }
  if (!result) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Run a query to see results.
      </div>
    )
  }
  if (!result.success) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <div className="flex items-center gap-2">
            <Badge variant="danger">Error</Badge>
            <span className="text-xs text-neutral-400">{result.durationMs} ms</span>
          </div>
          <p className="mt-2 break-all font-mono text-xs text-red-300/80">{result.error}</p>
        </div>
      </div>
    )
  }

  const fields = result.fields

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-neutral-800 px-3 py-2 text-xs">
        <Badge variant="success">OK</Badge>
        {result.command && <span className="font-mono text-neutral-400">{result.command}</span>}
        {result.rowCount != null && (
          <span className="text-neutral-400">
            {formatNumber(result.rowCount)} row{result.rowCount === 1 ? '' : 's'}
          </span>
        )}
        <span className="text-neutral-500">{result.durationMs} ms</span>
      </div>

      <div className="flex-1 overflow-auto">
        {fields.length === 0 ? (
          <div className="p-4 text-sm text-neutral-500">
            Query executed successfully. No rows returned.
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-neutral-900/95 backdrop-blur">
              <tr>
                <th className="w-10 border-b border-neutral-800 px-2 py-2 text-left text-xs font-medium text-neutral-500">
                  #
                </th>
                {fields.map((f) => (
                  <th
                    key={f.name}
                    className="border-b border-neutral-800 px-3 py-2 text-left text-xs font-semibold text-neutral-300"
                  >
                    {f.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, idx) => (
                <tr key={idx} className="border-b border-neutral-800/60">
                  <td className="px-2 py-1.5 text-xs text-neutral-600">{idx + 1}</td>
                  {fields.map((f) => {
                    const value = row[f.name]
                    return (
                      <td
                        key={f.name}
                        className="max-w-xs truncate px-3 py-1.5 font-mono text-xs text-neutral-200"
                        title={formatCellValue(value)}
                      >
                        {value === null ? (
                          <span className="text-neutral-600 italic">NULL</span>
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
