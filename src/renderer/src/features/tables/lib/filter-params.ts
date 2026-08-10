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
