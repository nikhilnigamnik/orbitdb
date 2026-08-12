import type { ReferencingKeyInfo, RowFilter } from '@renderer/types'
import { stringifyValue } from './cell-value'

/**
 * The filters that select the child rows pointing at one parent row.
 *
 * Returns null when the link cannot be expressed:
 *
 * - a malformed key (no columns, or the two sides disagree on how many)
 * - a NULL on the parent side. `col = NULL` is never true in SQL, so a filter
 *   built from it would report zero children with the same confidence as a real
 *   count. Nothing is the honest answer, not zero.
 */
export function childFilters(
  key: ReferencingKeyInfo,
  row: Record<string, unknown>
): RowFilter[] | null {
  const { columns, referencedColumns } = key
  if (columns.length === 0 || columns.length !== referencedColumns.length) return null

  const filters: RowFilter[] = []
  for (let i = 0; i < columns.length; i++) {
    const value = row[referencedColumns[i]]
    if (value === null || value === undefined) return null
    filters.push({ column: columns[i], operator: '=', value: stringifyValue(value) })
  }
  return filters
}

/** `schema.table` unless the child lives in the same schema, where the prefix is noise. */
export function childTableLabel(key: ReferencingKeyInfo): string {
  return key.schema === key.referencedSchema ? key.table : `${key.schema}.${key.table}`
}
