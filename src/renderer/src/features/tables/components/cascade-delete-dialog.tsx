import * as React from 'react'
import { IconAlertTriangle, IconCornerDownRight, IconEraser, IconTrash } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { Dialog } from '@renderer/components/ui/dialog'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Spinner } from '@renderer/components/ui/spinner'
import { unwrap } from '@renderer/lib/ipc'
import { errorMessage } from '@renderer/lib/errors'
import { formatNumber } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import type { CascadeDeletePlan, CascadeDeleteResult } from '@renderer/types'
import { planNeedsWarning, planTableCount, planTotalRows, stepLabel } from '../lib/delete-error'

/**
 * One literal class per hop. Tailwind resolves class names statically, so a
 * computed `pl-[${n}px]` compiles to nothing - and an inline style object is the
 * thing this project does not use. Six entries is the whole range: the walk
 * stops at CASCADE_DELETE_MAX_DEPTH.
 */
const DEPTH_INDENT = [
  'pl-[12px]',
  'pl-[26px]',
  'pl-[40px]',
  'pl-[54px]',
  'pl-[68px]',
  'pl-[82px]'
] as const

/** Ragged widths so the placeholder rows read as a list, not a block. */
const SKELETON_WIDTHS = ['w-7/12', 'w-1/2', 'w-8/12'] as const

interface CascadeDeleteDialogProps {
  isOpen: boolean
  onClose: () => void
  connectionId: string
  schema: string
  table: string
  /** Primary key of every row being deleted. */
  pks: Record<string, unknown>[]
  onDeleted: (result: CascadeDeleteResult) => void
}

/**
 * Deleting a row together with everything that points at it.
 *
 * The plan is always shown before anything runs, and the counts in it are real
 * (each one is a `count(*)`, not an estimate) - a cascade deletes rows the user
 * never selected, so agreeing to a number is the whole point of the dialog.
 */
export function CascadeDeleteDialog({
  isOpen,
  onClose,
  connectionId,
  schema,
  table,
  pks,
  onDeleted
}: CascadeDeleteDialogProps) {
  const [plan, setPlan] = React.useState<CascadeDeletePlan | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isPlanning, setIsPlanning] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)

  React.useEffect(() => {
    if (!isOpen) return
    let isCurrent = true
    setPlan(null)
    setError(null)
    setIsPlanning(true)

    async function load() {
      try {
        const found = await unwrap(window.api.db.cascadePlan({ connectionId, schema, table, pks }))
        if (isCurrent) setPlan(found)
      } catch (err) {
        if (isCurrent) setError(errorMessage(err))
      } finally {
        if (isCurrent) setIsPlanning(false)
      }
    }

    void load()
    return () => {
      isCurrent = false
    }
  }, [isOpen, connectionId, schema, table, pks])

  async function confirm() {
    setIsDeleting(true)
    setError(null)
    try {
      const result = await unwrap(window.api.db.cascadeDelete({ connectionId, schema, table, pks }))
      onDeleted(result)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setIsDeleting(false)
    }
  }

  const isBusy = isPlanning || isDeleting
  const targetLabel = `${schema}.${table}`

  return (
    <Dialog
      open={isOpen}
      setOpen={(next) => {
        if (!next && !isDeleting) onClose()
      }}
      content={
        <div className="flex max-h-[70vh] flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
            <IconTrash size={14} className="shrink-0 text-danger" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-xs font-medium text-text">Delete with dependents</span>
              <span className="truncate font-mono text-[11px] text-text-subtle">
                {formatNumber(pks.length)} row{pks.length === 1 ? '' : 's'} in {targetLabel}
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {isPlanning && (
              <>
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-muted">
                  <Spinner size={12} />
                  Following foreign keys and counting what goes with it
                </div>
                <ul className="divide-y divide-border/60" aria-hidden>
                  {SKELETON_WIDTHS.map((width, i) => (
                    <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <Skeleton className={cn('h-3', width)} />
                      <Skeleton className="ml-auto h-3 w-8 shrink-0" />
                    </li>
                  ))}
                </ul>
              </>
            )}

            {!isPlanning && error && (
              <div className="flex items-start gap-2 px-3 py-4 text-xs text-danger">
                <IconAlertTriangle size={13} className="mt-px shrink-0" />
                {error}
              </div>
            )}

            {/* Detached children count as something depending on the row: they are
                listed just below, and claiming nothing does would contradict it. */}
            {!isPlanning && plan && plan.steps.length === 0 && plan.detached.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-text-muted">
                Nothing depends on {plan.targetRows === 1 ? 'this row' : 'these rows'}. Deleting is
                just the delete.
              </p>
            )}

            {!isPlanning && plan && plan.steps.length > 0 && (
              <ul className="divide-y divide-border/60">
                {plan.steps.map((step) => (
                  <li
                    key={`${step.schema}.${step.table}.${step.constraintName}.${step.depth}`}
                    // Indented by hop, so a grandchild reads as one - the delete
                    // order is bottom-up and the nesting is what explains why.
                    className={cn(
                      'flex items-center gap-2 py-2 pr-3',
                      DEPTH_INDENT[Math.min(step.depth, DEPTH_INDENT.length) - 1]
                    )}
                  >
                    {step.depth > 1 && (
                      <IconCornerDownRight size={11} className="shrink-0 text-text-subtle/60" />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-xs text-text">
                          {stepLabel(step, schema)}
                        </span>
                        {/* Already the schema's own rule - these were going anyway. */}
                        {step.onDelete.toUpperCase() === 'CASCADE' && (
                          <Chip tone="neutral">cascade</Chip>
                        )}
                      </div>
                      <span className="truncate font-mono text-[10px] text-text-subtle">
                        {step.columns.join(', ')} → {step.parentTable}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-danger">
                      {formatNumber(step.rowCount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {!isPlanning && plan && plan.detached.length > 0 && (
              <div className="border-t border-border">
                <div className="flex items-center gap-1.5 px-3 py-1.5">
                  <IconEraser size={11} className="text-text-subtle" />
                  <span className="text-[10px] font-semibold tracking-wide text-text-muted uppercase">
                    Kept, reference cleared
                  </span>
                </div>
                <ul className="divide-y divide-border/60">
                  {plan.detached.map((step) => (
                    <li
                      key={`${step.schema}.${step.table}.${step.constraintName}`}
                      className="flex items-center gap-2 px-3 py-2"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-mono text-xs text-text">
                          {stepLabel(step, schema)}
                        </span>
                        <span className="truncate font-mono text-[10px] text-text-subtle">
                          {step.columns.join(', ')} · {step.onDelete.toLowerCase()}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
                        {formatNumber(step.rowCount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!isPlanning && plan && planNeedsWarning(plan) && (
              <div className="flex items-start gap-2 border-t border-border bg-warning/8 px-3 py-2 text-[11px] text-warning">
                <IconAlertTriangle size={12} className="mt-px shrink-0" />
                <span>
                  {plan.isTruncated &&
                    'The chain goes deeper than this walk follows, so the counts are a lower bound and the delete may still be refused. '}
                  {plan.failures.length > 0 &&
                    `Could not read dependents of ${plan.failures.map((f) => f.table).join(', ')}.`}
                </span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
            <span className="flex-1 text-[11px] text-text-subtle">
              {plan
                ? `${formatNumber(planTotalRows(plan))} row${planTotalRows(plan) === 1 ? '' : 's'} across ${planTableCount(plan)} table${planTableCount(plan) === 1 ? '' : 's'}`
                : 'Reading the foreign key graph'}
            </span>
            <Button size="sm" variant="ghost" onClick={onClose} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => void confirm()}
              disabled={isBusy || !plan}
              className={cn(isDeleting && 'pointer-events-none')}
            >
              {isDeleting
                ? 'Deleting…'
                : plan
                  ? `Delete ${formatNumber(planTotalRows(plan))}`
                  : 'Delete'}
            </Button>
          </div>
        </div>
      }
    />
  )
}
