import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
  IconTable,
  IconUnlink
} from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { Dialog, DialogDescription, DialogTitle } from '@renderer/components/ui/dialog'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Spinner } from '@renderer/components/ui/spinner'
import { unwrap } from '@renderer/lib/ipc'
import { errorMessage } from '@renderer/lib/errors'
import { formatNumber } from '@renderer/lib/format'
import { tableRoute } from '@renderer/config/routes'
import type { CheckReferencesResult } from '@renderer/types'

interface BrokenRefsDialogProps {
  isOpen: boolean
  onClose: () => void
  connectionId: string
  schema: string
}

/**
 * Rows pointing at parents that are not there.
 *
 * Two kinds are reported and the difference matters: an undeclared reference
 * with orphans is ordinary data drift, while a *declared* constraint with
 * orphans means the database was never enforcing it - which is why declared
 * ones sort first regardless of count.
 */
export function BrokenRefsDialog({ isOpen, onClose, connectionId, schema }: BrokenRefsDialogProps) {
  const navigate = useNavigate()
  const [result, setResult] = React.useState<CheckReferencesResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isRunning, setIsRunning] = React.useState(false)
  const sweepId = React.useRef<string | null>(null)

  async function run() {
    if (!schema || isRunning) return
    const id = `refs-${Date.now()}`
    sweepId.current = id
    setIsRunning(true)
    setError(null)
    try {
      const found = await unwrap(
        window.api.db.checkReferences({ connectionId, schema, sweepId: id })
      )
      if (sweepId.current === id) setResult(found)
    } catch (err) {
      if (sweepId.current === id) setError(errorMessage(err))
    } finally {
      if (sweepId.current === id) {
        sweepId.current = null
        setIsRunning(false)
      }
    }
  }

  function cancel() {
    if (!isRunning || !sweepId.current) return
    void window.api.db.cancelSearch(sweepId.current)
  }

  function close() {
    cancel()
    onClose()
  }

  return (
    <Dialog
      open={isOpen}
      setOpen={(next) => {
        if (!next) close()
      }}
      title="Broken references"
      content={
        <div className="flex max-h-[70vh] flex-col">
          <div className="flex shrink-0 flex-col gap-1 px-5 pt-5 pb-3">
            <div className="flex min-w-0 items-center gap-2">
              <DialogTitle asChild>
                <h2 className="text-[15px] font-semibold text-text">Broken references</h2>
              </DialogTitle>
              {schema && <Chip className="font-mono">{schema}</Chip>}
            </div>
            <DialogDescription asChild>
              <p className="text-xs text-text-muted">
                Finds rows whose reference points at a parent that no longer exists.
              </p>
            </DialogDescription>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-5">
            {!isRunning && !result && !error && (
              <p className="pb-1 text-xs text-text-subtle">
                Covers declared foreign keys and columns like{' '}
                <code className="rounded bg-surface-sunken px-1 font-mono text-[12px] text-text-muted">
                  user_id
                </code>{' '}
                that never had one. Each pair is a join across two whole tables, so this can be
                slow.
              </p>
            )}

            {isRunning && (
              <div className="overflow-hidden rounded-xl border border-border">
                <div className="flex h-9 items-center gap-2 border-b border-border px-3 text-xs text-text-muted">
                  <Spinner size={12} />
                  Joining each reference against its parent
                </div>
                <ul className="divide-y divide-border" aria-hidden>
                  {[0.76, 0.58, 0.68, 0.46].map((width, i) => (
                    <li key={i} className="flex h-12 items-center gap-3 px-3">
                      <Skeleton className="h-3" style={{ width: `${width * 100}%` }} />
                      <Skeleton className="ml-auto h-3 w-8 shrink-0" />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!isRunning && error && (
              <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2.5 text-xs text-danger">
                <IconAlertTriangle size={14} className="mt-px shrink-0" />
                {error}
              </div>
            )}

            {!isRunning && result && result.broken.length === 0 && result.pairsChecked > 0 && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <span className="flex size-10 items-center justify-center rounded-xl bg-surface-elevated text-success">
                  <IconCheck size={20} />
                </span>
                <p className="text-sm font-medium text-text">Every reference resolves.</p>
              </div>
            )}

            {!isRunning && result && result.pairsChecked === 0 && result.pairsFound === 0 && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <span className="flex size-10 items-center justify-center rounded-xl bg-surface-elevated text-text-subtle">
                  <IconUnlink size={20} />
                </span>
                <p className="max-w-sm text-xs text-text-muted">
                  No references to check - nothing here names a column after another table.
                </p>
              </div>
            )}

            {!isRunning && result && result.broken.length > 0 && (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {result.broken.map((ref) => (
                  <li key={`${ref.table}.${ref.column}`}>
                    <button
                      type="button"
                      onClick={() => {
                        navigate(tableRoute(ref.schema, ref.table))
                        onClose()
                      }}
                      className="group flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-elevated/60"
                    >
                      <IconTable
                        size={16}
                        className="shrink-0 self-start text-text-subtle mt-0.5"
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm">
                            <span className="font-medium text-text">{ref.table}</span>
                            <span className="text-text-subtle">.{ref.column}</span>
                          </span>
                          {/* A declared constraint with orphans behind it means
                              the database is not enforcing what it claims to. */}
                          {ref.isDeclared && <Chip tone="rose">Not enforced</Chip>}
                        </span>
                        <span className="truncate text-[12px] text-text-subtle">
                          → {ref.referencedTable}.{ref.referencedColumn}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-medium text-danger tabular-nums">
                        {formatNumber(ref.count)}
                      </span>
                      <IconArrowRight
                        size={14}
                        className="shrink-0 text-text-subtle opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3 px-5 py-4">
            <p className="min-w-0 flex-1 text-[12px] text-text-subtle">
              {result && (
                <>
                  {formatNumber(result.pairsChecked)} of {formatNumber(result.pairsFound)}{' '}
                  references checked
                  {result.wasCancelled && ' · stopped early, so this is partial'}
                  {result.pairsSkipped > 0 &&
                    ` · ${formatNumber(result.pairsSkipped)} past the cap`}
                  {result.failures.length > 0 &&
                    ` · ${result.failures.length} could not be read (${result.failures[0].table})`}
                </>
              )}
            </p>
            <Button variant="outline" onClick={close}>
              Close
            </Button>
            {isRunning ? (
              <Button variant="outline" onClick={cancel}>
                Stop
              </Button>
            ) : (
              <Button onClick={() => void run()} disabled={!schema}>
                {result ? 'Check again' : 'Check'}
              </Button>
            )}
          </div>
        </div>
      }
    />
  )
}
