/** Table rows rendered at once. cmdk measures and reorders every item it holds. */
export const PALETTE_TABLE_LIMIT = 50

/**
 * How well `query` matches an item, lower being better, or null for no match.
 * `fields[0]` is the item's own name; the rest (schema, host, keywords) only
 * ever match as a substring, so `users` ranks the table above a schema that
 * happens to contain the word.
 *
 * - 0: the name starts with the query
 * - 1: a word inside the name does (`order_items` for `items`)
 * - 2: the name contains it
 * - 3: some other field contains it
 * - 4: every space-separated word of the query is in some field (`public users`)
 */
export function matchRank(query: string, fields: readonly string[]): number | null {
  const needle = query.trim().toLowerCase()
  if (!needle) return 0
  const [name = '', ...rest] = fields.map((field) => field.toLowerCase())

  if (name.startsWith(needle)) return 0
  if (name.split(/[\s_.\-/]+/).some((word) => word.startsWith(needle))) return 1
  if (name.includes(needle)) return 2
  if (rest.some((field) => field.includes(needle))) return 3

  const haystack = [name, ...rest].join(' ')
  const words = needle.split(/\s+/)
  if (words.length > 1 && words.every((word) => haystack.includes(word))) return 4
  return null
}

export interface FilteredItems<T> {
  items: T[]
  /** How many matched before the limit, so the list can say what it held back. */
  total: number
}

/** Matches ordered best first, ties kept in their original order, then capped. */
export function filterItems<T>(
  items: readonly T[],
  query: string,
  fieldsOf: (item: T) => readonly string[],
  limit = Infinity
): FilteredItems<T> {
  const ranked: { item: T; rank: number; index: number }[] = []
  items.forEach((item, index) => {
    const rank = matchRank(query, fieldsOf(item))
    if (rank != null) ranked.push({ item, rank, index })
  })
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index)
  return { items: ranked.slice(0, limit).map((entry) => entry.item), total: ranked.length }
}
