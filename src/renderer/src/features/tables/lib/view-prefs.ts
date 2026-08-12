import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@renderer/config/site'
import type { SortDirection } from '@renderer/types'

/**
 * How one table is being looked at: sort, page size, which columns are hidden
 * and how wide the resized ones are.
 *
 * Per connection *and* per table, in localStorage. This is view state, not user
 * data - losing it costs a re-drag, so it does not need to reach `userData` the
 * way saved queries do.
 */
export interface TableViewPrefs {
  columnSizing: Record<string, number>
  hiddenColumns: string[]
  /** Stuck to the left edge while the grid scrolls sideways, in this order. */
  frozenColumns: string[]
  orderBy: string | null
  orderDir: SortDirection
  pageSize: number
}

export function defaultViewPrefs(): TableViewPrefs {
  return {
    columnSizing: {},
    hiddenColumns: [],
    frozenColumns: [],
    orderBy: null,
    orderDir: 'asc',
    pageSize: DEFAULT_PAGE_SIZE
  }
}

function key(connectionId: string, schema: string, table: string): string {
  return `orbitdb:table-view:${connectionId}:${schema}.${table}`
}

/** Widths outside this range are not a view preference, they are a broken grid. */
const MIN_COLUMN_WIDTH = 64
const MAX_COLUMN_WIDTH = 1200

function readSizing(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || raw === null) return {}
  const out: Record<string, number> = {}
  for (const [column, width] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof width !== 'number' || !Number.isFinite(width)) continue
    out[column] = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width))
  }
  return out
}

/**
 * Parsing is defensive throughout: localStorage is hand-editable, and these
 * entries outlive the schema they were written against. A column that has since
 * been dropped is harmless in either list - it simply never matches - so stale
 * names are kept rather than reconciled against columns the caller would have
 * to pass in.
 */
export function loadViewPrefs(connectionId: string, schema: string, table: string): TableViewPrefs {
  const fallback = defaultViewPrefs()
  if (!connectionId) return fallback
  try {
    const raw = localStorage.getItem(key(connectionId, schema, table))
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<TableViewPrefs>
    return {
      columnSizing: readSizing(parsed.columnSizing),
      hiddenColumns: Array.isArray(parsed.hiddenColumns)
        ? parsed.hiddenColumns.filter((c): c is string => typeof c === 'string')
        : [],
      frozenColumns: Array.isArray(parsed.frozenColumns)
        ? parsed.frozenColumns.filter((c): c is string => typeof c === 'string')
        : [],
      orderBy: typeof parsed.orderBy === 'string' ? parsed.orderBy : null,
      orderDir: parsed.orderDir === 'desc' ? 'desc' : 'asc',
      pageSize:
        typeof parsed.pageSize === 'number' && Number.isFinite(parsed.pageSize)
          ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(parsed.pageSize)))
          : DEFAULT_PAGE_SIZE
    }
  } catch {
    return fallback
  }
}

export function saveViewPrefs(
  connectionId: string,
  schema: string,
  table: string,
  prefs: TableViewPrefs
): void {
  if (!connectionId) return
  try {
    localStorage.setItem(key(connectionId, schema, table), JSON.stringify(prefs))
  } catch {
    // quota / private mode - the view just won't be remembered
  }
}

/**
 * Hiding every column leaves a grid with nothing in it and no control to bring
 * anything back, so the last visible one cannot be hidden.
 */
export function toggleHiddenColumn(
  hidden: string[],
  column: string,
  allColumns: string[]
): string[] {
  if (!hidden.includes(column)) {
    const visible = allColumns.filter((c) => !hidden.includes(c))
    if (visible.length <= 1) return hidden
    return [...hidden, column]
  }
  return hidden.filter((c) => c !== column)
}

/**
 * Freezing more than a couple of columns leaves no room for the rest, so the
 * count is capped rather than left to produce an unscrollable grid.
 */
export const MAX_FROZEN_COLUMNS = 3

export function toggleFrozenColumn(frozen: string[], column: string): string[] {
  if (frozen.includes(column)) return frozen.filter((c) => c !== column)
  if (frozen.length >= MAX_FROZEN_COLUMNS) return frozen
  return [...frozen, column]
}
