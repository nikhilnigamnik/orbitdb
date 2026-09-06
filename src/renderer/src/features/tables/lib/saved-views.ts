import type {
  FilterJoin,
  RowFilter,
  SavedTableView,
  SortDirection,
  TableViewState
} from '@renderer/types'
import type { TableViewPrefs } from './view-prefs'

/** The parts of the data view a named view is built from. */
export interface TableViewSnapshot {
  filters: RowFilter[]
  filterJoin: FilterJoin
  orderBy: string | null
  orderDir: SortDirection
  prefs: TableViewPrefs
}

/**
 * What is worth remembering under a name. `columnSizing` is deliberately left
 * out - a width belongs to the table however you are looking at it, so applying
 * a view must not undo the last drag.
 */
export function captureView(snapshot: TableViewSnapshot): TableViewState {
  return {
    filters: snapshot.filters,
    filterJoin: snapshot.filterJoin,
    orderBy: snapshot.orderBy,
    orderDir: snapshot.orderDir,
    hiddenColumns: snapshot.prefs.hiddenColumns,
    frozenColumns: snapshot.prefs.frozenColumns,
    pageSize: snapshot.prefs.pageSize
  }
}

/** Folds a view back into the stored preferences, keeping the widths as they are. */
export function applyViewToPrefs(view: TableViewState, prefs: TableViewPrefs): TableViewPrefs {
  return {
    ...prefs,
    hiddenColumns: view.hiddenColumns,
    frozenColumns: view.frozenColumns,
    orderBy: view.orderBy,
    orderDir: view.orderDir,
    pageSize: view.pageSize
  }
}

/**
 * A comparable form of a view, used to decide whether the screen still shows
 * what the applied view saved.
 *
 * Two fields only mean something in context, and comparing them raw reports a
 * change the user cannot see: the join is inert below two filters, and the sort
 * direction is inert with no column to sort on. Hidden columns are a set - the
 * order they were ticked in is not part of the view - while frozen columns are
 * a sequence, since that order is the order they are pinned in.
 */
function canonical(view: TableViewState): string {
  return JSON.stringify({
    filters: view.filters.map((f) => [f.column, f.operator, f.value ?? null]),
    filterJoin: view.filters.length > 1 ? view.filterJoin : 'and',
    orderBy: view.orderBy,
    orderDir: view.orderBy ? view.orderDir : 'asc',
    hiddenColumns: [...view.hiddenColumns].sort(),
    frozenColumns: view.frozenColumns,
    pageSize: view.pageSize
  })
}

export function isSameView(a: TableViewState, b: TableViewState): boolean {
  return canonical(a) === canonical(b)
}

export function sortViews(views: SavedTableView[]): SavedTableView[] {
  return [...views].sort((a, b) => a.name.localeCompare(b.name))
}

/** Replaces a saved view in the list, or adds it, keeping the list name-ordered. */
export function upsertView(views: SavedTableView[], saved: SavedTableView): SavedTableView[] {
  return sortViews([...views.filter((v) => v.id !== saved.id), saved])
}
