import type { FilterJoin, RowFilter } from '../../shared/types'

/**
 * Operators the renderer is allowed to ask for. Anything outside this set is
 * dropped rather than interpolated — the operator is the one part of a filter
 * that cannot be bound as a parameter.
 */
const ALLOWED_OPERATORS = new Set<RowFilter['operator']>([
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'like',
  'ilike',
  'is null',
  'is not null'
])

const UNARY_OPERATORS = new Set<RowFilter['operator']>(['is null', 'is not null'])

export interface FilterDialect {
  quoteIdent(name: string): string
  /** Placeholder for the nth bound parameter, 1-based. */
  placeholder(position: number): string
  /** Engines without ILIKE fold it onto LIKE. */
  supportsIlike: boolean
}

export interface FilterSql {
  /** `where …`, or empty when nothing survived validation. */
  whereSql: string
  params: unknown[]
}

/**
 * Build the WHERE clause for a set of row filters.
 *
 * Column names are checked against the table's real columns and quoted;
 * operators are checked against the allowlist; values are always bound. A
 * filter that fails any of those is skipped rather than rejected, so one stale
 * filter cannot break the whole page.
 */
export function buildFilterSql(
  filters: RowFilter[] | undefined,
  validColumns: Set<string>,
  dialect: FilterDialect,
  join: FilterJoin = 'and'
): FilterSql {
  const params: unknown[] = []
  const clauses: string[] = []

  for (const filter of filters ?? []) {
    if (!validColumns.has(filter.column)) continue
    if (!ALLOWED_OPERATORS.has(filter.operator)) continue

    const column = dialect.quoteIdent(filter.column)

    if (UNARY_OPERATORS.has(filter.operator)) {
      clauses.push(`${column} ${filter.operator}`)
      continue
    }
    if (filter.value == null) continue

    const operator =
      filter.operator === 'ilike' && !dialect.supportsIlike ? 'like' : filter.operator
    params.push(filter.value)
    clauses.push(`${column} ${operator} ${dialect.placeholder(params.length)}`)
  }

  // Parenthesised so an OR set stays one unit if anything is ever appended.
  const combined = clauses.join(join === 'or' ? ' or ' : ' and ')
  return {
    whereSql:
      clauses.length > 0
        ? `where ${clauses.length > 1 && join === 'or' ? `(${combined})` : combined}`
        : '',
    params
  }
}
