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
  'pl-[28px]',
  'pl-[44px]',
  'pl-[60px]',
  'pl-[76px]',
  'pl-[92px]'
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
      title="Delete with dependents"
      open={isOpen}
      setOpen={(next) => {
        if (!next && !isDeleting) onClose()
      }}
      className="w-[min(560px,calc(100vw-2rem))]"
      content={
        <div className="flex max-h-[70vh] flex-col">
          <div className="flex shrink-0 flex-col gap-0.5 px-5 pt-5 pb-3">
            <h2 className="text-[15px] font-semibold text-text">Delete with dependents</h2>
            <span className="truncate text-xs text-text-muted">
              {formatNumber(pks.length)} row{pks.length === 1 ? '' : 's'} in {targetLabel}
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-5 pt-1 pb-5">
            {isPlanning && (
              <div className="shrink-0 overflow-hidden rounded-xl border border-border">
                <div className="flex h-9 items-center gap-2 border-b border-border px-3 text-xs text-text-muted">
                  <Spinner size={12} />
                  Following foreign keys and counting what goes with it
                </div>
                <ul className="divide-y divide-border" aria-hidden>
                  {SKELETON_WIDTHS.map((width, i) => (
                    <li key={i} className="flex h-11 items-center gap-3 px-3">
                      <Skeleton className={cn('h-3', width)} />
                      <Skeleton className="ml-auto h-3 w-8 shrink-0" />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!isPlanning && error && (
              <div className="flex shrink-0 items-start gap-2 rounded-lg border border-danger/15 bg-danger/5 px-3 py-2.5 text-xs text-danger">
                <IconAlertTriangle size={16} className="shrink-0" />
                <span className="min-w-0 wrap-break-word">{error}</span>
              </div>
            )}

            {/* Detached children count as something depending on the row: they are
                listed just below, and claiming nothing does would contradict it. */}
            {!isPlanning && plan && plan.steps.length === 0 && plan.detached.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-elevated text-text-subtle">
                  <IconTrash size={20} />
                </div>
                <p className="max-w-sm text-xs text-text-muted">
                  Nothing depends on {plan.targetRows === 1 ? 'this row' : 'these rows'}. Deleting
                  is just the delete.
                </p>
              </div>
            )}

            {!isPlanning && plan && plan.steps.length > 0 && (
              <PlanGroup icon={<IconTrash size={14} />} label="Deleted with it">
                {plan.steps.map((step) => (
                  <li
                    key={`${step.schema}.${step.table}.${step.constraintName}.${step.depth}`}
                    // Indented by hop, so a grandchild reads as one - the delete
                    // order is bottom-up and the nesting is what explains why.
                    className={cn(
                      'flex min-h-11 items-center gap-2 py-1.5 pr-3',
                      DEPTH_INDENT[Math.min(step.depth, DEPTH_INDENT.length) - 1]
                    )}
                  >
                    {step.depth > 1 && (
                      <IconCornerDownRight size={14} className="shrink-0 text-text-subtle" />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-text">
                          {stepLabel(step, schema)}
                        </span>
                        {/* Already the schema's own rule - these were going anyway. */}
                        {step.onDelete.toUpperCase() === 'CASCADE' && (
                          <Chip tone="neutral">cascade</Chip>
                        )}
                      </div>
                      <span className="truncate text-[12px] text-text-subtle">
                        {step.columns.join(', ')} → {step.parentTable}
                      </span>
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-danger">
                      {formatNumber(step.rowCount)}
                    </span>
                  </li>
                ))}
              </PlanGroup>
            )}

            {!isPlanning && plan && plan.detached.length > 0 && (
              <PlanGroup icon={<IconEraser size={14} />} label="Kept, reference cleared">
                {plan.detached.map((step) => (
                  <li
                    key={`${step.schema}.${step.table}.${step.constraintName}`}
                    className="flex min-h-11 items-center gap-2 px-3 py-1.5"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-text">
                        {stepLabel(step, schema)}
                      </span>
                      <span className="truncate text-[12px] text-text-subtle">
                        {step.columns.join(', ')} · {step.onDelete.toLowerCase()}
                      </span>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-text-muted">
                      {formatNumber(step.rowCount)}
                    </span>
                  </li>
                ))}
              </PlanGroup>
            )}

            {!isPlanning && plan && planNeedsWarning(plan) && (
              <div className="flex shrink-0 items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2.5 text-xs text-warning">
                <IconAlertTriangle size={16} className="shrink-0" />
                <span>
                  {plan.isTruncated &&
                    'The chain goes deeper than this walk follows, so the counts are a lower bound and the delete may still be refused. '}
                  {plan.failures.length > 0 &&
                    `Could not read dependents of ${plan.failures.map((f) => f.table).join(', ')}.`}
                </span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-border px-5 py-4">
            <span className="flex-1 text-xs text-text-muted tabular-nums">
              {plan
                ? `${formatNumber(planTotalRows(plan))} row${planTotalRows(plan) === 1 ? '' : 's'} across ${planTableCount(plan)} table${planTableCount(plan) === 1 ? '' : 's'}`
                : 'Reading the foreign key graph'}
            </span>
            <Button size="sm" variant="outline" onClick={onClose} disabled={isDeleting}>
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

/** One hairline card per kind of consequence, headed the way Attio labels a group. */
function PlanGroup({
  icon,
  label,
  children
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div className="flex items-center gap-1.5 px-0.5 text-text-subtle">
        {icon}
        <span className="text-[12px] font-medium">{label}</span>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {children}
      </ul>
    </div>
  )
}
