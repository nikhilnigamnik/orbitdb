import {
  CASCADE_DELETE_BIND_CHUNK,
  CASCADE_DELETE_MAX_DEPTH,
  type CascadeDeletePlan,
  type CascadeDeleteResult,
  type CascadeDeleteStep,
  type CascadeDetachStep,
  type ReferencingKeyInfo
} from '../../shared/types'
import {
  CascadeCycleError,
  CascadeLimitError,
  PlanGraph,
  assertWithinKeyLimit,
  tupleKey,
  type PlanNode
} from './cascade-plan-guard'
import { toCount } from './coerce'
import type { ValueSearchDialect } from './value-search'

export { CascadeCycleError, CascadeLimitError } from './cascade-plan-guard'

/**
 * Deleting a row together with everything that depends on it.
 *
 * The database refuses a delete whose children are still pointing at it, and
 * `ON DELETE CASCADE` is the schema's way of saying "take them too" - but that
 * is a decision made when the table was created, and most schemas leave it at
 * the default. This walks the foreign key graph at delete time instead, so the
 * same thing can be done from a row the user is looking at.
 *
 * Two rules make it safe enough to offer:
 *
 * - Nothing is deleted before the user has seen the count per table. The plan is
 *   built and shown first; the delete is a second, separate call.
 * - `SET NULL`/`SET DEFAULT` children are never followed. Those rows are meant
 *   to survive with the reference rewritten, and deleting them would be the
 *   cascade overruling the schema.
 */

export interface CascadeStatement {
  schema: string
  table: string
  sql: string
  params: unknown[]
}

export interface CascadeDeleteDeps {
  dialect: ValueSearchDialect
  /**
   * How many bound parameters one statement may carry, on an engine that caps
   * it. D1 refuses more than 100; Postgres and MySQL take far more than the
   * tuple chunk ever binds and leave this unset.
   */
  maxBindParams?: number
  referencingKeys(schema: string, table: string): Promise<ReferencingKeyInfo[]>
  select(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>
}

export interface CascadePlanOptions {
  /**
   * Whether to count the rows each step, and the plan as a whole, will delete.
   *
   * The preview needs the counts - they are what the user agrees to. The
   * execute path replans only for the statements and discards the plan, and on
   * Postgres and MySQL it does so inside the write transaction with the target
   * rows locked, so it turns them off: every `rowCount` and `totalRows` is then
   * 0, and a step the count would have pruned is a delete matching nothing.
   */
  shouldCount?: boolean
}

export interface CascadePlanResult {
  plan: CascadeDeletePlan
  /** Deepest first, target row last - the only order the deletes are legal in. */
  statements: CascadeStatement[]
}

/** A planned step and the node it deletes - paired so neither can drift. */
interface PlannedStep {
  /** The node's place in the plan graph, which decides the delete order. */
  index: number
  step: CascadeDeleteStep
  node: PlanNode
}

type QueuedNode = Pick<PlannedStep, 'index' | 'node'>

/** What a statement builder needs: where the values go and how many fit. */
type BindContext = Pick<CascadeDeleteDeps, 'dialect' | 'maxBindParams'>

/**
 * Rows are matched by an IN list rather than a correlated subquery.
 *
 * A subquery would read better, but MySQL rejects `delete from t where … (select
 * … from t)` outright (error 1093), which is exactly the self-referencing tree
 * case. Bound values work identically on all three engines, and they are what
 * lets the preview report an exact count instead of an estimate.
 */
export function buildMatchSql(
  dialect: ValueSearchDialect,
  columns: string[],
  values: unknown[][],
  params: unknown[]
): string {
  if (columns.length === 1) {
    const placeholders = values.map((tuple) => {
      params.push(tuple[0])
      return dialect.placeholder(params.length)
    })
    return `(${dialect.quoteIdent(columns[0])} in (${placeholders.join(', ')}))`
  }

  const groups = values.map((tuple) => {
    const parts = columns.map((column, i) => {
      params.push(tuple[i])
      return `${dialect.quoteIdent(column)} = ${dialect.placeholder(params.length)}`
    })
    return `(${parts.join(' and ')})`
  })
  return `(${groups.join(' or ')})`
}

/**
 * Tuples per statement.
 *
 * Postgres and MySQL take `CASCADE_DELETE_BIND_CHUNK` tuples. An engine that
 * caps bound parameters gets however many whole tuples fit under the cap - a
 * composite key spends one parameter per column - and never fewer than one.
 */
export function tuplesPerStatement(ctx: BindContext, columnCount: number): number {
  if (ctx.maxBindParams === undefined) return CASCADE_DELETE_BIND_CHUNK
  return Math.max(1, Math.floor(ctx.maxBindParams / Math.max(1, columnCount)))
}

/**
 * Splits a value list into batches small enough to bind. An empty list gives
 * no batch at all: a statement over an empty IN list is a syntax error.
 *
 * The batches partition a *distinct* set of tuples, so a row matches at most one
 * of them - which is what lets the counts be summed and the deletes be run one
 * after another without either double-counting.
 */
function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size))
  return batches
}

/**
 * Distinct, and with anything holding a NULL dropped.
 *
 * `col = NULL` is never true, so a NULL key value selects nothing - carrying it
 * would add a bound parameter that can only ever widen the statement without
 * matching a row. The same rule `referencing.ts` applies when it declines to
 * link on a NULL.
 */
export function normaliseTuples(tuples: unknown[][]): unknown[][] {
  const seen = new Set<string>()
  const out: unknown[][] = []
  for (const tuple of tuples) {
    if (tuple.some((value) => value === null || value === undefined)) continue
    const key = tupleKey(tuple)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tuple)
  }
  return out
}

function isSubset(columns: string[], of: string[]): boolean {
  return columns.every((column) => of.includes(column))
}

/**
 * The values of `columns` across the rows this node matches.
 *
 * When the node is already identified by those columns - a foreign key pointing
 * at the primary key, which is nearly all of them - the values are already in
 * hand and no query is needed at all.
 */
async function valuesFor(
  node: PlanNode,
  columns: string[],
  deps: CascadeDeleteDeps
): Promise<unknown[][]> {
  if (isSubset(columns, node.matchColumns)) {
    const indexes = columns.map((column) => node.matchColumns.indexOf(column))
    return normaliseTuples(node.matchValues.map((tuple) => indexes.map((i) => tuple[i])))
  }

  const projection = columns.map((column) => deps.dialect.quoteIdent(column)).join(', ')
  const collected: unknown[][] = []
  const size = tuplesPerStatement(deps, node.matchColumns.length)
  for (const batch of chunk(node.matchValues, size)) {
    const params: unknown[] = []
    const where = buildMatchSql(deps.dialect, node.matchColumns, batch, params)
    const sql = `select distinct ${projection} from ${deps.dialect.qualifiedTable(node.schema, node.table)} where ${where}`
    const rows = await deps.select(sql, params)
    for (const row of rows) collected.push(columns.map((column) => row[column]))
  }
  return normaliseTuples(collected)
}

async function countMatching(
  schema: string,
  table: string,
  columns: string[],
  values: unknown[][],
  deps: CascadeDeleteDeps
): Promise<number> {
  let total = 0
  for (const batch of chunk(values, tuplesPerStatement(deps, columns.length))) {
    const params: unknown[] = []
    const where = buildMatchSql(deps.dialect, columns, batch, params)
    const sql = `select count(*) as total from ${deps.dialect.qualifiedTable(schema, table)} where ${where}`
    const rows = await deps.select(sql, params)
    total += toCount(rows[0]?.total)
  }
  return total
}

function deleteStatements(node: PlanNode, ctx: BindContext): CascadeStatement[] {
  const size = tuplesPerStatement(ctx, node.matchColumns.length)
  return chunk(node.matchValues, size).map((batch) => {
    const params: unknown[] = []
    const where = buildMatchSql(ctx.dialect, node.matchColumns, batch, params)
    const sql = `delete from ${ctx.dialect.qualifiedTable(node.schema, node.table)} where ${where}`
    return { schema: node.schema, table: node.table, sql, params }
  })
}

/**
 * `select … for update` over the rows the cascade starts from.
 *
 * Taking this before the walk is what closes the window the replan alone leaves
 * open. Both Postgres and InnoDB take a shared lock on a parent row when a child
 * row referencing it is inserted, and `for update` conflicts with that - so once
 * the target rows are locked, no new dependant can appear underneath one between
 * the moment the walk counts it and the moment the delete runs.
 *
 * D1 gets none of this: the REST endpoint is one statement per request, so there
 * is no transaction for a lock to live in.
 */
export function lockStatements(
  ctx: BindContext,
  schema: string,
  table: string,
  columns: string[],
  values: unknown[][]
): CascadeStatement[] {
  return chunk(values, tuplesPerStatement(ctx, columns.length)).map((batch) => {
    const params: unknown[] = []
    const where = buildMatchSql(ctx.dialect, columns, batch, params)
    const sql = `select 1 from ${ctx.dialect.qualifiedTable(schema, table)} where ${where} for update`
    return { schema, table, sql, params }
  })
}

function isDetaching(onDelete: string): boolean {
  const rule = onDelete.toUpperCase().replace(/_/g, ' ')
  return rule === 'SET NULL' || rule === 'SET DEFAULT'
}

function isUsableKey(key: ReferencingKeyInfo): boolean {
  return key.columns.length > 0 && key.columns.length === key.referencedColumns.length
}

/**
 * Rows, not steps.
 *
 * `notifications.recipient_id` and `notifications.actor_id` can both point at
 * `users.id`: two steps over one set of rows, whose counts overlap. Summing them
 * promises more rows than the delete removes, because the second statement finds
 * the first one's rows already gone - and that sum is what the confirm button
 * says out loud. Any table more than one step reached is therefore counted once
 * more with every condition OR'd together.
 *
 * A table with a single step is already exact and costs no extra query, which is
 * every table in the ordinary case.
 */
async function countPlannedRows(planned: PlannedStep[], deps: CascadeDeleteDeps): Promise<number> {
  const byTable = new Map<string, PlannedStep[]>()
  for (const entry of planned) {
    const key = `${entry.node.schema}.${entry.node.table}`
    const group = byTable.get(key)
    if (group) group.push(entry)
    else byTable.set(key, [entry])
  }

  let total = 0
  for (const group of byTable.values()) {
    if (group.length === 1) {
      total += group[0].step.rowCount
      continue
    }
    // The union cannot be chunked the way a single predicate can - the batches
    // would overlap - so a group too large to bind at once, or one whose count
    // fails, falls back to the sum of its steps.
    //
    // The sum is an upper bound, and that is the safe direction to miss in: the
    // user is agreeing to a destructive action, so being shown more rows than
    // go is a worse promise than the exact number but a better one than fewer.
    // Understating would delete rows nobody was warned about.
    const summed = group.reduce((sum, entry) => sum + entry.step.rowCount, 0)
    const bound = group.reduce(
      (sum, entry) => sum + entry.node.matchValues.length * entry.node.matchColumns.length,
      0
    )
    if (bound > (deps.maxBindParams ?? CASCADE_DELETE_BIND_CHUNK)) {
      total += summed
      continue
    }
    try {
      total += await countUnion(
        group.map((entry) => entry.node),
        deps
      )
    } catch {
      total += summed
    }
  }
  return total
}

/** One count over every predicate that reached a table, OR'd into a single scan. */
async function countUnion(nodes: PlanNode[], deps: CascadeDeleteDeps): Promise<number> {
  const params: unknown[] = []
  const clauses = nodes.map((node) =>
    buildMatchSql(deps.dialect, node.matchColumns, node.matchValues, params)
  )
  const { schema, table } = nodes[0]
  const sql = `select count(*) as total from ${deps.dialect.qualifiedTable(schema, table)} where ${clauses.join(' or ')}`
  const rows = await deps.select(sql, params)
  return toCount(rows[0]?.total)
}

function assertRootValues(
  schema: string,
  table: string,
  pkColumns: string[],
  values: unknown[][]
): void {
  if (pkColumns.length > 0 && values.length > 0) return
  throw new Error(`Cannot cascade from ${schema}.${table}: no primary key values to start from`)
}

/**
 * The tuples the walk starts from: each row's primary key, distinct and with
 * NULLs dropped - or the planner's own error when nothing is left.
 *
 * The drivers' lock step runs before the planner does and used to take the raw
 * tuples, so an all-NULL key list produced `where ("id" in ()) for update`: a
 * syntax error raised from inside the transaction in place of this message.
 */
export function rootTuples(
  schema: string,
  table: string,
  pkColumns: string[],
  pks: Record<string, unknown>[]
): unknown[][] {
  const values = normaliseTuples(toPkTuples(pkColumns, pks))
  assertRootValues(schema, table, pkColumns, values)
  return values
}

/**
 * Breadth-first down the foreign key graph, counting as it goes.
 *
 * The walk is breadth-first so that `depth` is a hop count, but the delete
 * order comes from the `PlanGraph` the walk builds: a node's rank is the
 * longest path the root reaches it by, and ranks are deleted deepest first.
 * In a tree that is the reversed walk; where a table is reached along two
 * paths it is what keeps the node after the dependents of both. A link that
 * closes a loop is refused outright, and a self-referencing tree walks down
 * real levels instead and is bounded by depth.
 */
export async function planCascadeDelete(
  schema: string,
  table: string,
  pkColumns: string[],
  pkValues: unknown[][],
  deps: CascadeDeleteDeps,
  options: CascadePlanOptions = {}
): Promise<CascadePlanResult> {
  const shouldCount = options.shouldCount ?? true
  const rootValues = normaliseTuples(pkValues)
  assertRootValues(schema, table, pkColumns, rootValues)

  const root: PlanNode = {
    schema,
    table,
    matchColumns: pkColumns,
    matchValues: rootValues,
    depth: 0
  }
  assertWithinKeyLimit(root)

  const graph = new PlanGraph(root)
  const planned: PlannedStep[] = []
  const detached: CascadeDetachStep[] = []
  const failures: { table: string; error: string }[] = []
  const queue: QueuedNode[] = [{ node: root, index: 0 }]
  let isTruncated = false

  // One sweep per table rather than per node. A self-referencing tree meets the
  // same table at every level, and on D1 each of those calls is a `pragma
  // foreign_key_list` over the whole database - the answer cannot change inside
  // a single walk, so asking twice only costs.
  const keyCache = new Map<string, ReferencingKeyInfo[]>()
  async function referencingKeys(schema: string, table: string): Promise<ReferencingKeyInfo[]> {
    const cacheKey = `${schema}.${table}`
    const cached = keyCache.get(cacheKey)
    if (cached) return cached
    const fetched = await deps.referencingKeys(schema, table)
    keyCache.set(cacheKey, fetched)
    return fetched
  }

  while (queue.length > 0) {
    const { node, index } = queue.shift() as QueuedNode

    let keys: ReferencingKeyInfo[]
    try {
      keys = await referencingKeys(node.schema, node.table)
    } catch (err) {
      failures.push({
        table: `${node.schema}.${node.table}`,
        error: err instanceof Error ? err.message : String(err)
      })
      continue
    }

    const usable = keys.filter(isUsableKey)
    if (usable.length === 0) continue

    for (const key of usable) {
      try {
        const parentValues = await valuesFor(node, key.referencedColumns, deps)
        if (parentValues.length === 0) continue

        const rowCount = shouldCount
          ? await countMatching(key.schema, key.table, key.columns, parentValues, deps)
          : null
        if (rowCount === 0) continue

        if (isDetaching(key.onDelete)) {
          if (rowCount !== null) {
            detached.push({
              schema: key.schema,
              table: key.table,
              columns: key.columns,
              constraintName: key.name,
              onDelete: key.onDelete,
              rowCount
            })
          }
          continue
        }

        // Only here, with a real row count in hand, is the plan actually cut
        // short. Checking on the way into the node instead reported every plan
        // that merely *ended* at the limit as a lower bound, including the ones
        // whose last table has a declared child matching nothing at all.
        if (node.depth >= CASCADE_DELETE_MAX_DEPTH) {
          isTruncated = true
          continue
        }

        const child: PlanNode = {
          schema: key.schema,
          table: key.table,
          matchColumns: key.columns,
          matchValues: parentValues,
          depth: node.depth + 1
        }
        assertWithinKeyLimit(child)

        const link = graph.link(index, child)
        if (!link.isNew) continue

        planned.push({
          index: link.index,
          step: {
            schema: key.schema,
            table: key.table,
            columns: key.columns,
            constraintName: key.name,
            parentSchema: node.schema,
            parentTable: node.table,
            depth: child.depth,
            rowCount: rowCount ?? 0,
            onDelete: key.onDelete
          },
          node: child
        })
        queue.push({ node: child, index: link.index })
      } catch (err) {
        if (err instanceof CascadeLimitError || err instanceof CascadeCycleError) throw err
        failures.push({
          table: `${key.schema}.${key.table}`,
          error: err instanceof Error ? err.message : String(err)
        })
      }
    }
  }

  // Shallowest rank first; the deletes are exactly that, reversed.
  const ordered = [...planned].sort(
    (a, b) => graph.rankOf(a.index) - graph.rankOf(b.index) || a.index - b.index
  )
  const statements = [...ordered]
    .reverse()
    .flatMap((entry) => deleteStatements(entry.node, deps))
    .concat(deleteStatements(root, deps))

  const totalRows = shouldCount ? await countPlannedRows(planned, deps) : 0

  return {
    plan: {
      schema,
      table,
      targetRows: rootValues.length,
      steps: ordered.map((entry) => ({ ...entry.step, depth: graph.rankOf(entry.index) })),
      detached,
      totalRows,
      isTruncated,
      failures
    },
    statements
  }
}

/**
 * The tuples the walk starts from.
 *
 * A missing primary key column is fatal rather than skipped: a delete built from
 * a partial key would match by whatever remains, which on a composite key is
 * every sibling row.
 */
export function toPkTuples(pkColumns: string[], pks: Record<string, unknown>[]): unknown[][] {
  return pks.map((pk) =>
    pkColumns.map((column) => {
      if (!(column in pk)) throw new Error(`Missing primary key column ${column}`)
      return pk[column]
    })
  )
}

/**
 * Per-table totals, summed across every step that touched one - a table reached
 * by two different foreign keys is two statements but one line in the result.
 */
export function toCascadeResult(
  affected: { schema: string; table: string; rows: number }[],
  wasAtomic: boolean
): CascadeDeleteResult {
  const byTable = new Map<string, { schema: string; table: string; rows: number }>()
  for (const entry of affected) {
    const key = `${entry.schema}.${entry.table}`
    const existing = byTable.get(key)
    if (existing) {
      existing.rows += entry.rows
    } else {
      byTable.set(key, { ...entry })
    }
  }
  const deleted = [...byTable.values()]
  return {
    deleted,
    totalRows: deleted.reduce((sum, entry) => sum + entry.rows, 0),
    wasAtomic
  }
}
