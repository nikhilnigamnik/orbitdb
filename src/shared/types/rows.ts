/**
 * Reading and writing rows: filters, paging, and the four mutations.
 */

import type { ColumnInfo } from './schema'

export type SortDirection = 'asc' | 'desc'

export interface RowFilter {
  column: string
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'like' | 'ilike' | 'is null' | 'is not null'
  value?: string
}

/**
 * How several filters combine. A single top-level connector rather than
 * arbitrary nesting: it covers "any of these" without a query-builder UI.
 */
export type FilterJoin = 'and' | 'or'

export interface GetRowsOptions {
  connectionId: string
  schema: string
  table: string
  limit: number
  offset: number
  orderBy?: string
  orderDir?: SortDirection
  filters?: RowFilter[]
  filterJoin?: FilterJoin
}

export interface CountRowsOptions {
  connectionId: string
  schema: string
  table: string
  filters?: RowFilter[]
  filterJoin?: FilterJoin
}

/**
 * Above this many rows, an unfiltered COUNT(*) costs more than the precision is
 * worth and the estimate stands instead. A filtered count always runs - that is
 * the case where the estimate is not merely imprecise but wrong.
 */
export const MAX_EXACT_COUNT_ROWS = 1_000_000

export interface RowsResult {
  rows: Record<string, unknown>[]
  columns: ColumnInfo[]
  totalEstimate: number | null
}

export interface RowMutation {
  connectionId: string
  schema: string
  table: string
  values: Record<string, unknown>
}

export interface RowUpdate extends RowMutation {
  pk: Record<string, unknown>
}

export interface RowDelete {
  connectionId: string
  schema: string
  table: string
  pk: Record<string, unknown>
}

export interface DistinctValuesOptions {
  connectionId: string
  schema: string
  table: string
  column: string
  limit?: number
  search?: string
}
