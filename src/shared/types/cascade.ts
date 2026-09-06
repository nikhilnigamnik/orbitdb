/**
 * Deleting a row together with everything that points at it.
 */

/**
 * One table's worth of rows that go when the target row does.
 *
 * `columns` are the child's own columns holding the reference, and `depth` is
 * how many hops from the row the user asked to delete - 1 is a direct child.
 * Deleting deepest-first is what makes the whole thing legal, so the depth is
 * carried rather than recomputed.
 */
export interface CascadeDeleteStep {
  schema: string
  table: string
  columns: string[]
  constraintName: string
  parentSchema: string
  parentTable: string
  depth: number
  rowCount: number
  /** The constraint's own rule, so a branch the database already cascades is labelled. */
  onDelete: string
}

/**
 * A child the database *keeps*: `ON DELETE SET NULL`/`SET DEFAULT` rewrites the
 * reference instead of removing the row. Cascading into these would delete rows
 * the schema explicitly says should survive, so they are reported and left alone.
 */
export interface CascadeDetachStep {
  schema: string
  table: string
  columns: string[]
  constraintName: string
  onDelete: string
  rowCount: number
}

export interface CascadeDeleteOptions {
  connectionId: string
  schema: string
  table: string
  /** Primary key of every row being deleted. */
  pks: Record<string, unknown>[]
}

export interface CascadeDeletePlan {
  schema: string
  table: string
  targetRows: number
  /** Shallowest first. Deletion runs in reverse. */
  steps: CascadeDeleteStep[]
  detached: CascadeDetachStep[]
  /** Dependent rows only - the target rows are counted by `targetRows`. */
  totalRows: number
  /**
   * The walk stopped at `CASCADE_DELETE_MAX_DEPTH` with children still to
   * follow, so the plan is a lower bound and the delete may still be refused.
   */
  isTruncated: boolean
  /** Tables whose dependents could not be read, named rather than swallowed. */
  failures: { table: string; error: string }[]
}

export interface CascadeDeleteResult {
  /** One entry per table, summed across every step that touched it. */
  deleted: { schema: string; table: string; rows: number }[]
  totalRows: number
  /** False on engines with no transaction here (D1), where a failure leaves partial work. */
  wasAtomic: boolean
}

/**
 * How far the walk follows the foreign key graph. Deep chains are real, but an
 * unbounded walk on a schema with a cycle is not something a delete dialog
 * should attempt - past this the plan says so instead of guessing.
 */
export const CASCADE_DELETE_MAX_DEPTH = 6

/**
 * How many key values are bound into a single statement.
 *
 * A longer list is split across several statements rather than refused: the
 * limit here is what one planner will happily take, not what the cascade can
 * handle. All the statements for a level run inside the same transaction, so
 * splitting one delete into ten changes nothing a caller can observe.
 */
export const CASCADE_DELETE_BIND_CHUNK = 1_000

/**
 * How many distinct key values one level may carry in total.
 *
 * This does *not* cap how many rows are deleted: a leaf table is deleted by its
 * parent's key values, so a row with 50k log entries cascades fine. It bites
 * only when an intermediate table - one that itself has children - matches this
 * many rows, at which point the walk is doing enough work that refusing beats
 * grinding. Ordinary shapes stay well under it because the values are chunked
 * rather than bound in one statement.
 */
export const CASCADE_DELETE_KEY_LIMIT = 50_000
