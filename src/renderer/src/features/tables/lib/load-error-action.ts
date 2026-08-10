import type { FilterJoin, RowFilter } from '@renderer/types'

export interface FilterQueryState {
  filters: RowFilter[]
  filterJoin: FilterJoin
}

function isSameFilter(a: RowFilter, b: RowFilter): boolean {
  return a.column === b.column && a.operator === b.operator && a.value === b.value
}

function isSameQuery(a: FilterQueryState, b: FilterQueryState): boolean {
  if (a.filterJoin !== b.filterJoin) return false
  if (a.filters.length !== b.filters.length) return false
  return a.filters.every((f, i) => isSameFilter(f, b.filters[i]))
}

/**
 * Which action a failed row load should offer.
 *
 * 'undo' only when this load's filters differ from the last set that loaded
 * successfully - otherwise the filters are not what broke and offering to revert
 * them is a lie. Comparing against the last good query is the cheap proxy for
 * "the filters did this": no driver error strings to parse, and it degrades
 * safely (a filter change that coincides with a dropped connection offers an undo
 * that fails again, which is no worse than the refresh it replaced).
 */
export function loadErrorAction(
  current: FilterQueryState,
  lastGood: FilterQueryState | null
): 'undo' | 'refresh' {
  if (!lastGood) return 'refresh'
  return isSameQuery(current, lastGood) ? 'refresh' : 'undo'
}
