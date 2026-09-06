import {
  CASCADE_DELETE_BIND_CHUNK,
  CASCADE_DELETE_KEY_LIMIT,
  CASCADE_DELETE_MAX_DEPTH,
  type CascadeDeletePlan,
  type CascadeDeleteResult,
  type CascadeDeleteStep,
  type CascadeDetachStep,
  type ReferencingKeyInfo
} from '../../shared/types'
import { toCount } from './coerce'
import type { ValueSearchDialect } from './value-search'

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
  referencingKeys(schema: string, table: string): Promise<ReferencingKeyInfo[]>
  select(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>
}

export interface CascadePlanResult {
  plan: CascadeDeletePlan
  /** Deepest first, target row last - the only order the deletes are legal in. */
  statements: CascadeStatement[]
}

/** A planned step and the node it deletes - paired so neither can drift. */
interface PlannedStep {
  step: CascadeDeleteStep
  node: PlanNode
}

/** A set of rows, named by the columns whose values pick them out. */
interface PlanNode {
  schema: string
  table: string
  matchColumns: string[]
  matchValues: unknown[][]
  depth: number
}

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
 * Splits a value list into batches small enough to bind.
 *
 * The batches partition a *distinct* set of tuples, so a row matches at most one
 * of them - which is what lets the counts be summed and the deletes be run one
 * after another without either double-counting.
 */
function chunk<T>(items: T[], size: number): T[][] {
  if (items.length <= size) return [items]
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size))
  return batches
}

function tupleKey(tuple: unknown[]): string {
  return JSON.stringify(tuple.map((value) => (value instanceof Date ? value.toISOString() : value)))
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
  for (const batch of chunk(node.matchValues, CASCADE_DELETE_BIND_CHUNK)) {
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
  for (const batch of chunk(values, CASCADE_DELETE_BIND_CHUNK)) {
    const params: unknown[] = []
    const where = buildMatchSql(deps.dialect, columns, batch, params)
    const sql = `select count(*) as total from ${deps.dialect.qualifiedTable(schema, table)} where ${where}`
    const rows = await deps.select(sql, params)
    total += toCount(rows[0]?.total)
  }
  return total
}

function deleteStatements(node: PlanNode, deps: CascadeDeleteDeps): CascadeStatement[] {
  return chunk(node.matchValues, CASCADE_DELETE_BIND_CHUNK).map((batch) => {
    const params: unknown[] = []
    const where = buildMatchSql(deps.dialect, node.matchColumns, batch, params)
    const sql = `delete from ${deps.dialect.qualifiedTable(node.schema, node.table)} where ${where}`
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
  dialect: ValueSearchDialect,
  schema: string,
  table: string,
  columns: string[],
  values: unknown[][]
): CascadeStatement[] {
  return chunk(values, CASCADE_DELETE_BIND_CHUNK).map((batch) => {
    const params: unknown[] = []
    const where = buildMatchSql(dialect, columns, batch, params)
    const sql = `select 1 from ${dialect.qualifiedTable(schema, table)} where ${where} for update`
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
 * Distinct from a per-table failure: one table that cannot be read leaves a plan
 * worth showing, but a plan too large to bind is not a plan at all, so this is
 * rethrown past the per-key catch rather than collected.
 */
export class CascadeLimitError extends Error {}

/**
 * The bound on a level, once chunking has taken the statement size out of it.
 *
 * This counts *parent* keys, not the rows they select: a row with 50k log
 * entries carries a single value and cascades fine. It is deliberately far
 * above the chunk size - an intermediate table matching a few thousand rows is
 * an ordinary customer/orders/order-items shape, not a pathological one, and
 * refusing it left the user with no path at all once the plain delete had
 * already been turned down by the foreign key.
 */
function assertWithinKeyLimit(node: PlanNode): void {
  if (node.matchValues.length <= CASCADE_DELETE_KEY_LIMIT) return
  throw new CascadeLimitError(
    `Too many rows to cascade safely: ${node.schema}.${node.table} matches ` +
      `${node.matchValues.length} keys, past the limit of ${CASCADE_DELETE_KEY_LIMIT}. ` +
      `Delete these in the query editor instead.`
  )
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
    if (bound > CASCADE_DELETE_BIND_CHUNK) {
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

/**
 * Breadth-first down the foreign key graph, counting as it goes.
 *
 * Breadth-first is not incidental: a row's dependents are always at a strictly
 * greater depth than the row itself, so walking back up the levels is a delete
 * order that never leaves a constraint violated. Two tables that reference each
 * other would revisit the same row set forever, hence the `seen` guard; a
 * self-referencing tree walks down real levels instead and is bounded by depth.
 */
export async function planCascadeDelete(
  schema: string,
  table: string,
  pkColumns: string[],
  pkValues: unknown[][],
  deps: CascadeDeleteDeps
): Promise<CascadePlanResult> {
  const rootValues = normaliseTuples(pkValues)
  if (pkColumns.length === 0 || rootValues.length === 0) {
    throw new Error(`Cannot cascade from ${schema}.${table}: no primary key values to start from`)
  }

  const root: PlanNode = {
    schema,
    table,
    matchColumns: pkColumns,
    matchValues: rootValues,
    depth: 0
  }
  assertWithinKeyLimit(root)

  const planned: PlannedStep[] = []
  const detached: CascadeDetachStep[] = []
  const failures: { table: string; error: string }[] = []
  const seen = new Set<string>()
  const queue: PlanNode[] = [root]
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
    const node = queue.shift() as PlanNode

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

        const rowCount = await countMatching(key.schema, key.table, key.columns, parentValues, deps)
        if (rowCount === 0) continue

        if (isDetaching(key.onDelete)) {
          detached.push({
            schema: key.schema,
            table: key.table,
            columns: key.columns,
            constraintName: key.name,
            onDelete: key.onDelete,
            rowCount
          })
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

        const fingerprint = `${child.schema}.${child.table}|${child.matchColumns.join(',')}|${child.matchValues
          .map(tupleKey)
          .sort()
          .join('|')}`
        if (seen.has(fingerprint)) continue
        seen.add(fingerprint)

        planned.push({
          step: {
            schema: key.schema,
            table: key.table,
            columns: key.columns,
            constraintName: key.name,
            parentSchema: node.schema,
            parentTable: node.table,
            depth: child.depth,
            rowCount,
            onDelete: key.onDelete
          },
          node: child
        })
        queue.push(child)
      } catch (err) {
        if (err instanceof CascadeLimitError) throw err
        failures.push({
          table: `${key.schema}.${key.table}`,
          error: err instanceof Error ? err.message : String(err)
        })
      }
    }
  }

  const statements = [...planned]
    .reverse()
    .flatMap((entry) => deleteStatements(entry.node, deps))
    .concat(deleteStatements(root, deps))

  const totalRows = await countPlannedRows(planned, deps)

  return {
    plan: {
      schema,
      table,
      targetRows: rootValues.length,
      steps: planned.map((entry) => entry.step),
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
