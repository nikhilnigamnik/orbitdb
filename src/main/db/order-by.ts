import type { SortDirection } from '../../shared/types'

export interface OrderDialect {
  quoteIdent(name: string): string
}

/**
 * Build a deterministic ORDER BY.
 *
 * Sorting by a non-unique column is not a total order, and LIMIT/OFFSET over a
 * partial order is undefined between statements — the same row can land on two
 * pages, or on none. Appending the primary key breaks every tie, which costs
 * nothing when the sort column is already unique.
 */
export function buildOrderBySql(
  orderBy: string | undefined,
  orderDir: SortDirection | undefined,
  primaryKey: string[],
  validColumns: Set<string>,
  dialect: OrderDialect
): string {
  const direction = orderDir === 'desc' ? 'desc' : 'asc'
  const terms: string[] = []

  if (orderBy && validColumns.has(orderBy)) {
    terms.push(`${dialect.quoteIdent(orderBy)} ${direction}`)
  }

  for (const key of primaryKey) {
    // Already sorted by it — a second mention would be redundant, and on some
    // engines an error.
    if (key === orderBy) continue
    terms.push(dialect.quoteIdent(key))
  }

  return terms.length > 0 ? `order by ${terms.join(', ')}` : ''
}
