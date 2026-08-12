import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { IconAlertTriangle, IconArrowRight, IconCheck, IconUnlink } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { Dialog } from '@renderer/components/ui/dialog'
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

  return (
    <Dialog
      open={isOpen}
      setOpen={(next) => {
        if (!next) {
          cancel()
          onClose()
        }
      }}
      content={
        <div className="flex max-h-[70vh] flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
            <IconUnlink size={14} className="shrink-0 text-text-subtle" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-xs font-medium text-text">Broken references</span>
              <span className="truncate font-mono text-[11px] text-text-subtle">{schema}</span>
            </div>
            {isRunning ? (
              <Button size="sm" variant="ghost" onClick={cancel}>
                Stop
              </Button>
            ) : (
              <Button size="sm" onClick={() => void run()} disabled={!schema}>
                {result ? 'Check again' : 'Check'}
              </Button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {!isRunning && !result && !error && (
              <div className="flex flex-col gap-1.5 px-3 py-6 text-center">
                <p className="text-xs text-text-muted">
                  Finds rows whose reference points at a parent that no longer exists.
                </p>
                <p className="text-[11px] text-text-subtle">
                  Covers declared foreign keys and columns like <code>user_id</code> that never had
                  one. Each pair is a join across two whole tables, so this can be slow.
                </p>
              </div>
            )}

            {isRunning && (
              <>
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-muted">
                  <Spinner size={12} />
                  Joining each reference against its parent
                </div>
                <ul className="divide-y divide-border/60" aria-hidden>
                  {[0.76, 0.58, 0.68, 0.46].map((width, i) => (
                    <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <Skeleton className="h-3" style={{ width: `${width * 100}%` }} />
                      <Skeleton className="ml-auto h-3 w-8 shrink-0" />
                    </li>
                  ))}
                </ul>
              </>
            )}

            {!isRunning && error && (
              <div className="flex items-start gap-2 px-3 py-4 text-xs text-danger">
                <IconAlertTriangle size={13} className="mt-px shrink-0" />
                {error}
              </div>
            )}

            {!isRunning && result && result.broken.length === 0 && result.pairsChecked > 0 && (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-text-muted">
                <IconCheck size={13} className="text-success" />
                Every reference resolves.
              </div>
            )}

            {!isRunning && result && result.pairsChecked === 0 && result.pairsFound === 0 && (
              <p className="px-3 py-6 text-center text-xs text-text-subtle">
                No references to check - nothing here names a column after another table.
              </p>
            )}

            {!isRunning && result && result.broken.length > 0 && (
              <ul className="divide-y divide-border/60">
                {result.broken.map((ref) => (
                  <li key={`${ref.table}.${ref.column}`}>
                    <button
                      type="button"
                      onClick={() => {
                        navigate(tableRoute(ref.schema, ref.table))
                        onClose()
                      }}
                      className="group flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-elevated/50"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-mono text-xs text-text">
                            {ref.table}
                            <span className="text-text-subtle">.{ref.column}</span>
                          </span>
                          {/* A declared constraint with orphans behind it means
                              the database is not enforcing what it claims to. */}
                          {ref.isDeclared && <Chip tone="rose">Not enforced</Chip>}
                        </span>
                        <span className="truncate font-mono text-[10px] text-text-subtle">
                          → {ref.referencedTable}.{ref.referencedColumn}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-danger">
                        {formatNumber(ref.count)}
                      </span>
                      <IconArrowRight
                        size={12}
                        className="shrink-0 text-accent-text opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {result && (
            <div className="shrink-0 border-t border-border px-3 py-2">
              <p className="text-[11px] text-text-subtle">
                {formatNumber(result.pairsChecked)} of {formatNumber(result.pairsFound)} references
                checked
                {result.wasCancelled && ' · stopped early, so this is partial'}
                {result.pairsSkipped > 0 && ` · ${formatNumber(result.pairsSkipped)} past the cap`}
                {result.failures.length > 0 &&
                  ` · ${result.failures.length} could not be read (${result.failures[0].table})`}
              </p>
            </div>
          )}
        </div>
      }
    />
  )
}
