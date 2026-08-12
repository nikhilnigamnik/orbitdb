import { tableRoute } from '@renderer/config/routes'
import type { FilterJoin, RowFilter } from '@renderer/types'
import { OPERATORS } from './filter-editor'

/**
 * Filters as URL parameters, so a filtered view can be linked and reopened.
 *
 * Parsing is defensive by necessity: a URL is user-editable and can outlive the
 * schema it was written against. Anything malformed is dropped rather than
 * throwing - a stale link should open the table, not an error.
 */

export const FILTERS_PARAM = 'filters'
export const JOIN_PARAM = 'join'

const VALID_OPERATORS = new Set(OPERATORS.map((o) => o.value))

export function encodeFilters(filters: RowFilter[]): string | null {
  if (filters.length === 0) return null
  return JSON.stringify(filters)
}

export function decodeFilters(raw: string | null): RowFilter[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return parsed.flatMap((entry): RowFilter[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const { column, operator, value } = entry as Record<string, unknown>
    if (typeof column !== 'string' || column === '') return []
    if (typeof operator !== 'string' || !VALID_OPERATORS.has(operator as RowFilter['operator'])) {
      return []
    }
    if (value != null && typeof value !== 'string') return []
    return [{ column, operator: operator as RowFilter['operator'], value: value as string }]
  })
}

export function decodeJoin(raw: string | null): FilterJoin {
  return raw === 'or' ? 'or' : 'and'
}

/**
 * Both filter params as one comparable string, so a component that reads *and*
 * writes them can tell its own last write apart from one that arrived from
 * outside (a search hit, an FK jump, the back button).
 *
 * `and` normalises to empty because it is never written - only `or` is, and
 * only when there is more than one filter to join. Without that, a hand-edited
 * `join=and` would read as a change forever.
 */
export function filterParamsKey(filters: RowFilter[], join: FilterJoin): string {
  const encoded = encodeFilters(filters) ?? ''
  return `${encoded}|${join === 'or' && filters.length > 1 ? 'or' : ''}`
}

export function readFilterParamsKey(params: URLSearchParams): string {
  return `${params.get(FILTERS_PARAM) ?? ''}|${params.get(JOIN_PARAM) === 'or' ? 'or' : ''}`
}

/**
 * A table route already narrowed to some rows. Uses the filters param rather
 * than the single-column `fkColumn`/`fkValue` pair, so a composite key links as
 * precisely as a simple one.
 */
export function tableRouteWithFilters(schema: string, table: string, filters: RowFilter[]): string {
  const encoded = encodeFilters(filters)
  if (!encoded) return tableRoute(schema, table)
  return `${tableRoute(schema, table)}&${FILTERS_PARAM}=${encodeURIComponent(encoded)}`
}
