/**
 * Saved table views - a named set of filters, sort and column state.
 */

import type { FilterJoin, RowFilter, SortDirection } from './rows'

/**
 * A named way of looking at one table: the filters, the sort, and which columns
 * are on screen.
 *
 * Column *widths* are deliberately not part of it. A width is physical drag
 * state that belongs to the table however you are looking at it, so re-applying
 * one on every view switch would undo the last drag rather than restore a view.
 * They stay in `view-prefs`.
 */
export interface TableViewState {
  filters: RowFilter[]
  filterJoin: FilterJoin
  orderBy: string | null
  orderDir: SortDirection
  hiddenColumns: string[]
  frozenColumns: string[]
  pageSize: number
}

/** Which table a set of saved views belongs to. */
export interface TableViewScope {
  connectionId: string
  schema: string
  table: string
}

export interface SavedTableView extends TableViewScope {
  id: string
  name: string
  view: TableViewState
  createdAt: string
  updatedAt: string
}

export interface SaveTableViewInput extends TableViewScope {
  name: string
  view: TableViewState
}

export interface SavedTableViewPatch {
  name?: string
  view?: TableViewState
}
