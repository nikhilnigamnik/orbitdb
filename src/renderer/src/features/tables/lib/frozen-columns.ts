/**
 * Layout for columns pinned to the left edge.
 *
 * A sticky column needs an explicit `left` offset, which is the summed width of
 * everything pinned before it. That means a frozen column needs a known width -
 * an auto-sized one measures differently per render and the offsets drift - so
 * freezing pins a width if the column does not already have one.
 */

/** The checkbox and row-number columns, which are pinned whenever anything is. */
export const LEADING_STICKY_WIDTH = 76

/** Applied to a frozen column with no dragged width of its own. */
export const FROZEN_DEFAULT_WIDTH = 180

export function frozenWidth(column: string, sizing: Record<string, number>): number {
  return sizing[column] ?? FROZEN_DEFAULT_WIDTH
}

/**
 * Left offset per frozen column, in the order they are pinned. Columns that are
 * not frozen are absent.
 */
export function frozenOffsets(
  frozen: string[],
  sizing: Record<string, number>
): Map<string, number> {
  const offsets = new Map<string, number>()
  let left = LEADING_STICKY_WIDTH
  for (const column of frozen) {
    offsets.set(column, left)
    left += frozenWidth(column, sizing)
  }
  return offsets
}

/**
 * Frozen columns first, in the order they were pinned, then the rest in their
 * original order. A pinned column that stayed in the middle of the grid would
 * slide over its own neighbours as they scroll past.
 */
export function orderColumns<T extends { name: string }>(columns: T[], frozen: string[]): T[] {
  if (frozen.length === 0) return columns
  const byName = new Map(columns.map((column) => [column.name, column]))
  const pinned = frozen
    .map((name) => byName.get(name))
    .filter((column): column is T => column != null)
  const pinnedNames = new Set(pinned.map((column) => column.name))
  return [...pinned, ...columns.filter((column) => !pinnedNames.has(column.name))]
}
