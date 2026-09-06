/**
 * The connection overview - the screen about the connection rather than a table.
 */

export interface TableSize {
  schema: string
  name: string
  /** Bytes on disk including indexes, or null where the engine cannot say. */
  bytes: number | null
  /** The planner's estimate, not an exact count - this is a listing, not a report. */
  estimatedRows: number | null
}

/**
 * What a connection looks like at a glance. Every size is nullable: D1 exposes
 * no size at all, and a Postgres user without the right grants gets nulls
 * rather than an error.
 */
export interface ConnectionOverview {
  databaseName: string
  serverVersion: string
  schemaCount: number
  tableCount: number
  viewCount: number
  /** Total bytes across the tables listed, or null when unavailable. */
  totalBytes: number | null
  /** Largest first, capped at `OVERVIEW_TABLE_LIMIT`. */
  largestTables: TableSize[]
}

/** Enough to see where the weight is without turning the page into a report. */
export const OVERVIEW_TABLE_LIMIT = 10
