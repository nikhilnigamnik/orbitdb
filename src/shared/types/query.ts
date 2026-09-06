/**
 * The query editor: what is run, what comes back, and what is kept.
 */

import type { DatabaseEngine } from './connection'

export interface RunQueryOptions {
  connectionId: string
  sql: string
  params?: unknown[]
  queryId?: string
}

export interface CancelQueryOptions {
  connectionId: string
  queryId: string
}

export const MAX_QUERY_RESULT_ROWS = 10_000

export interface QueryResult {
  success: boolean
  error?: string
  rows: Record<string, unknown>[]
  fields: { name: string; dataTypeID: number }[]
  rowCount: number | null
  command: string | null
  durationMs: number
  truncated: boolean
}

/**
 * One entry in the query store: every query that ran, plus the ones the user
 * kept. Starring is what separates them - a starred entry is never pruned, so
 * "save this query" and "protect it from the history cap" are one action rather
 * than two concepts that can disagree.
 */
export interface SavedQuery {
  id: string
  connectionId: string
  sql: string
  /** User-given name. Null until one is typed; only starred entries can have one. */
  name: string | null
  isStarred: boolean
  ranAt: string
  durationMs: number
  success: boolean
}

export interface RecordQueryRun {
  connectionId: string
  sql: string
  durationMs: number
  success: boolean
}

export interface SavedQueryPatch {
  name?: string | null
  isStarred?: boolean
  sql?: string
}

/**
 * Who asked for a query: something the user typed or triggered, or the app's own
 * introspection. Without the distinction the log is mostly pragmas.
 */
export type QueryOrigin = 'user' | 'internal'

export interface QueryLogEntry {
  origin: QueryOrigin
  id: string
  connectionId: string
  engine: DatabaseEngine
  sql: string
  params: unknown[]
  durationMs: number
  rowCount: number | null
  success: boolean
  error?: string
  ranAt: string
}
