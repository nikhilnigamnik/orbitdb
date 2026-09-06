import type { CascadeDeletePlan } from '@renderer/types'

/**
 * A delete refused because something still points at the row.
 *
 * Matched on the message rather than a code: the IPC envelope carries
 * `err.message` and nothing else, so the driver's error object - and with it
 * `code`/`errno` - is gone by the time the renderer sees it. Each engine words
 * it differently:
 *
 * - Postgres: `… violates foreign key constraint "posts_author_id_fkey" …`
 * - MySQL: `Cannot delete or update a parent row: a foreign key constraint fails`
 * - SQLite/D1: `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT_FOREIGNKEY`
 */
const FOREIGN_KEY_PATTERNS = [
  /violates foreign key constraint/i,
  /foreign key constraint fail/i,
  /sqlite_constraint_foreignkey/i,
  /cannot delete or update a parent row/i
]

export function isForeignKeyError(message: string): boolean {
  return FOREIGN_KEY_PATTERNS.some((pattern) => pattern.test(message))
}

/** `schema.table`, or the bare name when it is the schema already on screen. */
export function stepLabel(step: { schema: string; table: string }, currentSchema: string): string {
  return step.schema === currentSchema ? step.table : `${step.schema}.${step.table}`
}

/**
 * Whether a plan has anything to warn about beyond its counts.
 *
 * A truncated walk is the one that actually matters: the plan is a lower bound,
 * so the delete can still be refused by a constraint the walk never reached.
 */
export function planNeedsWarning(plan: CascadeDeletePlan): boolean {
  return plan.isTruncated || plan.failures.length > 0
}

/** Row count including the target rows, which is what the button promises. */
export function planTotalRows(plan: CascadeDeletePlan): number {
  return plan.targetRows + plan.totalRows
}

/**
 * Distinct tables touched, target included.
 *
 * Counting steps would overstate it: a table reached by two foreign keys - or a
 * self-reference at two depths - is two steps but one table.
 */
export function planTableCount(plan: CascadeDeletePlan): number {
  const tables = new Set([`${plan.schema}.${plan.table}`])
  for (const step of plan.steps) tables.add(`${step.schema}.${step.table}`)
  return tables.size
}
