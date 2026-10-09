import * as React from 'react'
import { IconAlertTriangle, IconCheck, IconSeeding } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { Dialog } from '@renderer/components/ui/dialog'
import { unwrap } from '@renderer/lib/ipc'
import { AiKeyRequired, isMissingAiKeyError } from '@renderer/components/common/ai-key-required'
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
    <Dialog
      title="Seed data"
      open={open}
      // Closing mid-seed reset the dialog while the inserts carried on, and
      // reopening it could start a second seed on top of the first.
      setOpen={(o) => {
        if (!o && !isWorking) onClose()
      }}
      className="w-[min(480px,calc(100vw-2rem))]"
      content={
        <div className="flex flex-col">
          <div className="flex flex-col gap-0.5 px-5 pt-5 pb-3">
            <h2 className="text-[15px] font-semibold text-text">Seed data</h2>
            <p className="text-xs text-text-muted">
              AI creates realistic test data that fits this table&apos;s columns and constraints,
              then inserts it for you.
            </p>
          </div>

          {status === 'done' ? (
            <>
              <div className="flex flex-col items-center gap-3 px-5 py-6 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success">
                  <IconCheck size={20} />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-text">
                    Added <span className="tabular-nums">{inserted}</span>{' '}
                    {inserted === 1 ? 'row' : 'rows'}
                  </p>
                  <p className="text-xs text-text-muted">
                    Inserted into{' '}
                    <span className="font-mono text-text">
                      {schema}.{table}
                    </span>
                  </p>
                  {skipped > 0 && (
                    <p className="text-[12px] text-text-subtle">
                      {skipped} {skipped === 1 ? 'row was' : 'rows were'} skipped (duplicates or
                      constraints)
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
                <Button size="sm" variant="outline" onClick={() => setStatus('idle')}>
                  <IconSeeding size={14} className="text-text-subtle" />
                  Seed more
                </Button>
                <Button size="sm" onClick={onClose}>
                  Done
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-4 px-5 pt-1 pb-5">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-text-muted">Rows</span>
                  <div className="flex w-fit items-center gap-0.5 rounded-lg bg-surface-elevated p-0.5">
                    {ROW_PRESETS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={isWorking}
                        onClick={() => setRowCount(n)}
                        aria-pressed={rowCount === n}
                        className={cn(
                          'h-7 min-w-11 cursor-pointer rounded-md px-2.5 text-xs font-medium tabular-nums transition-colors disabled:opacity-50',
                          rowCount === n
                            ? 'bg-surface text-text shadow-control'
                            : 'text-text-muted hover:text-text'
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <span className="text-[12px] text-text-subtle">
                    Generate sample rows for{' '}
                    <span className="font-mono">
                      {schema}.{table}
                    </span>
                  </span>
                </div>

                {isMissingAiKeyError(error) ? (
                  <AiKeyRequired onNavigate={onClose} className="py-4" />
                ) : (
                  error && (
                    <div className="flex items-start gap-2 rounded-lg border border-danger/15 bg-danger/5 px-3 py-2.5 text-xs text-danger">
                      <IconAlertTriangle size={16} className="shrink-0" />
                      <span className="min-w-0 wrap-break-word">{error}</span>
                    </div>
                  )
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
                <Button size="sm" variant="outline" onClick={onClose} disabled={isWorking}>
                  Cancel
                </Button>
                <Button size="sm" onClick={seed} disabled={isWorking}>
                  {isWorking ? (
                    <>
                      <Spinner size={12} className="text-current" />
                      Generating & inserting…
                    </>
                  ) : (
                    `Generate & insert ${rowCount}`
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      }
    />
  )
}
