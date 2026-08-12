import type { FilterDialect } from './filters'
import {
  VALUE_SEARCH_TABLE_LIMIT,
  type ColumnInfo,
  type TableInfo,
  type ValueSearchHit,
  type ValueSearchMode,
  type ValueSearchResult
} from '../../shared/types'

/**
 * Finding a value anywhere in a database.
 *
 * The engine-specific parts are quoting, placeholders and the cast to text; the
 * decisions - which columns are worth looking at, what the counting query looks
 * like, how much of the database to touch - are the same everywhere and live
 * here so they can be tested without a server.
 */

export interface ValueSearchDialect extends FilterDialect {
  qualifiedTable(schema: string, table: string): string
  /** `col::text` in Postgres, `cast(col as char)` in MySQL, `cast(col as text)` in SQLite. */
  castText(expr: string): string
}

/**
 * Column types worth searching.
 *
 * Text and uuid cover what people actually paste in. Numerics are deliberately
 * excluded from `contains`: casting a bigint to text so that `42` can match
 * `1420` produces noise that buries the real hit, and it forfeits any index.
 * They are searched on `exact` when the term is a number, which is the case
 * where the answer is unambiguous.
 */
const TEXTUAL = new Set([
  'text',
  'varchar',
  'character varying',
  'char',
  'character',
  'bpchar',
  'citext',
  'name',
  'uuid',
  'json',
  'jsonb'
])

const NUMERIC = new Set([
  'int2',
  'int4',
  'int8',
  'smallint',
  'integer',
  'bigint',
  'numeric',
  'decimal',
  'real',
  'float',
  'float4',
  'float8',
  'double',
  'double precision',
  'int',
  'mediumint',
  'tinyint'
])

/**
 * Type names as they arrive, made comparable: lowercased, MySQL's `varchar(255)`
 * length dropped, and Postgres's array marker stripped so `_text` reads as
 * `text`. That last one means array columns *are* searched - `text[]` casts to
 * `{a,b}`, which `contains` can find a member inside. `exact` will never match
 * one, so it costs a scan for nothing there; kept because finding an id buried
 * in an array is worth more than the wasted pass.
 */
function normalise(column: ColumnInfo): string[] {
  return [column.udtName, column.dataType].filter(Boolean).map((t) =>
    t
      .toLowerCase()
      .replace(/^_/, '')
      .replace(/\(.*\)$/, '')
      .trim()
  )
}

export function isNumericTerm(term: string): boolean {
  return term.trim() !== '' && Number.isFinite(Number(term))
}

/**
 * Whether a column can hold the term being looked for. An enum counts as
 * textual - Postgres reports it as `USER-DEFINED`, which is why `enumValues` is
 * consulted rather than the type name.
 */
export function isSearchableColumn(
  column: ColumnInfo,
  mode: ValueSearchMode,
  term: string
): boolean {
  if (column.enumValues && column.enumValues.length > 0) return true
  const types = normalise(column)
  if (types.some((t) => TEXTUAL.has(t))) return true
  if (mode === 'exact' && isNumericTerm(term) && types.some((t) => NUMERIC.has(t))) return true
  return false
}

export interface TableSearchSql {
  sql: string
  params: unknown[]
  /** The columns each `c<n>` alias corresponds to, in order. */
  columns: string[]
}

/**
 * One query per table rather than one per column: a table is scanned once and
 * reports a count for every candidate column at the same time.
 *
 * `sum(case when … then 1 else 0 end)` rather than `count(*) filter (where …)`,
 * which MySQL does not have. Returns null when no column on the table could
 * hold the term, so the caller can skip the round trip entirely.
 */
export function buildTableSearchSql(
  dialect: ValueSearchDialect,
  schema: string,
  table: string,
  columns: ColumnInfo[],
  mode: ValueSearchMode,
  term: string
): TableSearchSql | null {
  const candidates = columns.filter((column) => isSearchableColumn(column, mode, term))
  if (candidates.length === 0) return null

  const bound = mode === 'exact' ? term : `%${term.toLowerCase()}%`

  // The same value is bound once per column rather than once per query. It is
  // tempting to bind it a single time and repeat the placeholder, but `?` is
  // positional in SQLite and MySQL - every one of them is its own binding, so
  // that only ever worked on Postgres's numbered `$1`, and D1 answered every
  // table with "Wrong number of parameter bindings for SQL query."
  const params: unknown[] = []

  const selects = candidates.map((column, i) => {
    const cast = dialect.castText(dialect.quoteIdent(column.name))
    params.push(bound)
    const placeholder = dialect.placeholder(params.length)
    const predicate =
      mode === 'exact'
        ? `${cast} = ${placeholder}`
        : // Both sides lowered rather than trusting ILIKE or a collation: the
          // three engines disagree, and a search that is case-sensitive on one
          // of them is a silent wrong answer.
          `lower(${cast}) like ${placeholder}`
    return `sum(case when ${predicate} then 1 else 0 end) as c${i}`
  })

  return {
    sql: `select ${selects.join(', ')} from ${dialect.qualifiedTable(schema, table)}`,
    params,
    columns: candidates.map((c) => c.name)
  }
}

/**
 * Tables to sweep, cheapest first, capped.
 *
 * Ascending by row estimate so that when the cap bites it drops the tables that
 * would have cost the most - and so a result arrives quickly on the small
 * tables where a stray id usually turns up. A null estimate sorts last: unknown
 * is treated as large, since guessing small is the expensive mistake.
 */
export function orderTablesForSearch(tables: TableInfo[]): {
  searched: TableInfo[]
  skipped: number
} {
  const base = tables.filter((t) => t.type === 'table')
  const sorted = [...base].sort((a, b) => {
    const left = a.estimatedRows ?? Number.POSITIVE_INFINITY
    const right = b.estimatedRows ?? Number.POSITIVE_INFINITY
    if (left !== right) return left - right
    return a.name.localeCompare(b.name)
  })
  return {
    searched: sorted.slice(0, VALUE_SEARCH_TABLE_LIMIT),
    skipped: Math.max(0, sorted.length - VALUE_SEARCH_TABLE_LIMIT)
  }
}

/** Turns one table's aggregate row into hits, dropping the columns with none. */
export function toHits(
  schema: string,
  table: string,
  columns: string[],
  row: Record<string, unknown> | undefined
): ValueSearchHit[] {
  if (!row) return []
  const hits: ValueSearchHit[] = []
  columns.forEach((column, i) => {
    // Counts arrive as strings from pg and either from mysql2; `sum` over no
    // rows is null, which is zero hits rather than a failure.
    const raw = row[`c${i}`]
    const count = raw === null || raw === undefined ? 0 : Number(raw)
    if (Number.isFinite(count) && count > 0) hits.push({ schema, table, column, count })
  })
  return hits
}

export interface SweepDeps {
  dialect: ValueSearchDialect
  listTables(): Promise<TableInfo[]>
  columnsFor(table: string): Promise<ColumnInfo[]>
  run(sql: string, params: unknown[]): Promise<Record<string, unknown> | undefined>
  /** Polled between tables so a long sweep can be abandoned. */
  isCancelled(): boolean
}

/**
 * The sweep itself, shared by all three engines.
 *
 * Tables are searched one at a time rather than in parallel: this is already
 * the most expensive thing the app can ask a database to do, and firing every
 * table at once would turn a slow feature into an outage.
 */
export async function sweepTables(
  schema: string,
  term: string,
  mode: ValueSearchMode,
  deps: SweepDeps
): Promise<ValueSearchResult> {
  const { searched, skipped } = orderTablesForSearch(await deps.listTables())

  const hits: ValueSearchHit[] = []
  const failures: { table: string; error: string }[] = []
  let tablesSearched = 0
  let columnsSearched = 0
  let wasCancelled = false

  for (const table of searched) {
    if (deps.isCancelled()) {
      wasCancelled = true
      break
    }
    try {
      const columns = await deps.columnsFor(table.name)
      const built = buildTableSearchSql(deps.dialect, schema, table.name, columns, mode, term)
      if (!built) continue
      const row = await deps.run(built.sql, built.params)
      // Counted after the query, not before: a table that threw was not
      // searched, and counting it as though it had been is how "245 columns
      // across 34 tables" sat next to "34 could not be read".
      tablesSearched += 1
      columnsSearched += built.columns.length
      hits.push(...toHits(schema, table.name, built.columns, row))
    } catch (err) {
      // One unreadable table must not end the sweep - the other two hundred
      // may still hold the answer.
      failures.push({ table: table.name, error: err instanceof Error ? err.message : String(err) })
    }
  }

  hits.sort((a, b) => b.count - a.count || a.table.localeCompare(b.table))
  return { hits, tablesSearched, tablesSkipped: skipped, columnsSearched, failures, wasCancelled }
}
