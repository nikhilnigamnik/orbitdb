/**
 * The two sweeps: finding a value anywhere, and finding broken references.
 */

/**
 * How a searched value is matched. `exact` can use an index and is what finding
 * an id wants; `contains` cannot, and is a full scan of every column it touches.
 */
export type ValueSearchMode = 'exact' | 'contains'

export interface ValueSearchOptions {
  connectionId: string
  schema: string
  term: string
  mode: ValueSearchMode
  /** Echoed to `db:search-cancel`, since a sweep can outlast the user's patience. */
  searchId?: string
}

export interface ValueSearchHit {
  schema: string
  table: string
  column: string
  count: number
}

export interface ValueSearchResult {
  /** Most hits first. */
  hits: ValueSearchHit[]
  tablesSearched: number
  /** Tables past `VALUE_SEARCH_TABLE_LIMIT`, so the UI can admit the sweep was partial. */
  tablesSkipped: number
  columnsSearched: number
  /**
   * Tables whose query failed - a permission, an exotic type, a view over
   * something unreadable. Named rather than swallowed: a search reporting no
   * hits when it never actually looked is worse than one that says so.
   */
  failures: { table: string; error: string }[]
  /** True when the user cancelled, so partial results are not read as complete. */
  wasCancelled: boolean
}

/**
 * A sweep touches every table, so it is capped rather than allowed to run away
 * on a database with thousands of them. Ordered by the planner's row estimate
 * ascending, so the cap drops the most expensive tables rather than arbitrary ones.
 */
export const VALUE_SEARCH_TABLE_LIMIT = 200

/**
 * A column pointing at rows that are not there. `isDeclared` separates the two
 * kinds, and both are worth reporting: an undeclared one is the common case, but
 * a *declared* constraint with orphans behind it means the database was not
 * enforcing it - SQLite ships with foreign keys off, and MySQL's older engines
 * ignore them entirely.
 */
export interface BrokenReference {
  schema: string
  table: string
  column: string
  referencedTable: string
  referencedColumn: string
  isDeclared: boolean
  count: number
}

export interface CheckReferencesOptions {
  connectionId: string
  schema: string
  /** Echoed to `db:sweep-cancel`, since this reads every table it can pair up. */
  sweepId?: string
}

export interface CheckReferencesResult {
  /** Most orphans first. */
  broken: BrokenReference[]
  pairsChecked: number
  /** Pairs past `REFERENCE_CHECK_PAIR_LIMIT`, so the UI can admit it was partial. */
  pairsSkipped: number
  /** Column pairs found, whether or not they turned out to have orphans. */
  pairsFound: number
  failures: { table: string; error: string }[]
  wasCancelled: boolean
}

/** Each pair is a join across two whole tables, so the sweep is bounded. */
export const REFERENCE_CHECK_PAIR_LIMIT = 150
