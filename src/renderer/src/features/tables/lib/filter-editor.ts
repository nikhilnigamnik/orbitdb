import type { RowFilter } from '@renderer/types'

export interface OperatorMeta {
  value: RowFilter['operator']
  label: string
  /** Takes no value — the comparison is the whole filter. */
  unary?: boolean
}

export const OPERATORS: OperatorMeta[] = [
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '≥' },
  { value: '<=', label: '≤' },
  { value: 'like', label: 'like' },
  { value: 'ilike', label: 'ilike' },
  { value: 'is null', label: 'is null', unary: true },
  { value: 'is not null', label: 'not null', unary: true }
]

const UNARY = new Set(OPERATORS.filter((o) => o.unary).map((o) => o.value))
const WILDCARD = new Set<RowFilter['operator']>(['like', 'ilike'])

export function isUnaryOperator(operator: RowFilter['operator']): boolean {
  return UNARY.has(operator)
}

/** Whether the value is a LIKE pattern, where a bare term matches nothing extra. */
export function usesWildcards(operator: RowFilter['operator']): boolean {
  return WILDCARD.has(operator)
}

/**
 * Turn what the editor holds into the filter to apply.
 *
 * `rawValue` is `null` only when the user picked the NULL suggestion, which is a
 * request for absence rather than for the empty string — `= ''` would match
 * nothing on a nullable column. Unary operators drop whatever value came with
 * them, since the comparison carries no operand.
 */
export function resolveFilter(
  column: string,
  operator: RowFilter['operator'],
  rawValue: unknown
): RowFilter {
  const wantsAbsence = rawValue === null && !isUnaryOperator(operator)
  const resolved: RowFilter['operator'] = wantsAbsence
    ? operator === '!='
      ? 'is not null'
      : 'is null'
    : operator

  return {
    column,
    operator: resolved,
    value: isUnaryOperator(resolved) || rawValue == null ? '' : String(rawValue)
  }
}

/** Append a new filter, or replace the one being rewritten. */
export function upsertFilter(
  filters: RowFilter[],
  filter: RowFilter,
  index: number | null
): RowFilter[] {
  if (index == null) return [...filters, filter]
  return filters.map((existing, i) => (i === index ? filter : existing))
}
