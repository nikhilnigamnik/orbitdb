import * as React from 'react'
import { IconSeeding, IconAlertTriangle } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { Sheet } from '@renderer/components/ui/sheet'
import { unwrap } from '@renderer/lib/ipc'
import { cn } from '@renderer/lib/utils'

interface SeedDataDialogProps {
  open: boolean
  onClose: () => void
  connectionId: string
  schema: string
  table: string
  /** Refresh table data after seed rows are inserted. */
  onApplied: () => void
}

const ROW_PRESETS = [5, 10, 25, 50, 100]

type Status = 'idle' | 'working' | 'done' | 'error'

export function SeedDataDialog({
  open,
  onClose,
  connectionId,
  schema,
  table,
  onApplied
}: SeedDataDialogProps) {
  const [rowCount, setRowCount] = React.useState(10)
  const [status, setStatus] = React.useState<Status>('idle')
  const [inserted, setInserted] = React.useState(0)
  const [skipped, setSkipped] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) return
    setStatus('idle')
    setInserted(0)
    setSkipped(0)
    setError(null)
  }, [open])

  async function seed() {
    setStatus('working')
    setError(null)
    try {
      const result = await unwrap(
        window.api.ai.generateSeed({ connectionId, schema, table, rowCount })
      )
      // Every row failed → surface the reason instead of a hollow "0 added".
      if (result.inserted === 0 && result.failed > 0) {
        throw new Error(result.firstError ?? 'No rows could be inserted')
      }
      setInserted(result.inserted)
      setSkipped(result.attempted - result.inserted)
      setStatus('done')
      onApplied()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  const isWorking = status === 'working'

  return (
    <Sheet
      openSheet={open}
      setOpenSheet={(o) => !o && onClose()}
      side="right"
      sheetContentClassName="bg-surface"
      content={
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3 pr-12">
            <IconSeeding size={15} className="shrink-0 " />
            <h2 className="truncate text-xs font-semibold text-text">Seed data</h2>
          </div>

          {status === 'done' ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-text">
                  Added {inserted} {inserted === 1 ? 'row' : 'rows'}
                </p>
                <p className="text-xs text-text-subtle">
                  Inserted into{' '}
                  <span className="font-mono text-text-muted">
                    {schema}.{table}
                  </span>
                </p>
                {skipped > 0 && (
                  <p className="text-xs text-text-subtle/70">
                    {skipped} {skipped === 1 ? 'row was' : 'rows were'} skipped (duplicates or
                    constraints)
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-text-muted hover:bg-surface-elevated hover:text-text"
                  onClick={() => setStatus('idle')}
                >
                  <IconSeeding size={12} />
                  Seed more
                </Button>
                <Button
                  size="sm"
                      onClick={onClose}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-text">Generate sample rows</p>
                <p className="mx-auto max-w-60 text-xs leading-relaxed text-text-subtle">
                  AI creates realistic test data that fits this table&apos;s columns and
                  constraints, then inserts it for you.
                </p>
              </div>

              <div className="w-full space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-subtle">
                  Rows
                </p>
                <div className="flex justify-center gap-1.5">
                  {ROW_PRESETS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={isWorking}
                      onClick={() => setRowCount(n)}
                      className={cn(
                        'h-8 w-12 cursor-pointer rounded-md border text-xs font-medium tabular-nums transition-colors disabled:opacity-50',
                        rowCount === n
                          ? 'border-accent/40 bg-accent/15 text-text'
                          : 'border-border bg-surface-elevated/40 text-text-subtle hover:border-border-strong hover:text-text'
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                size="sm"
                  onClick={seed}
                disabled={isWorking}
              >
                {isWorking ? (
                  <>
                    <Spinner size={12} className="text-current" />
                    Generating & inserting…
                  </>
                ) : (
                  `Generate & insert ${rowCount}`
                )}
              </Button>

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-left text-xs text-danger">
                  <IconAlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span className="wrap-break-word">{error}</span>
                </div>
              )}
            </div>
          )}
        </div>
      }
    />
  )
}
