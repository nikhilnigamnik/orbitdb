/**
 * Where the keyboard is in the grid, and what a range selection covers.
 *
 * Columns are addressed by index rather than name: movement is positional, and
 * an index survives two columns sharing a name across a join result where a
 * lookup by name would not.
 */

export interface CellCursor {
  rowIndex: number
  columnIndex: number
}

/** A rectangle of cells, inclusive at both ends and always normalised. */
export interface CellRange {
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
}

export interface GridBounds {
  rowCount: number
  columnCount: number
}

export type CursorMove =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'row-start'
  | 'row-end'
  | 'first-row'
  | 'last-row'

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), Math.max(max, 0))
}

/**
 * The cursor after a move, clamped at the edges.
 *
 * Deliberately does not wrap. Tab inside the cell editor wraps to the next row
 * because it is walking a sequence of fields; an arrow key is pointing at a
 * direction, and a right arrow that lands you one row down is a surprise.
 */
export function moveCursor(cursor: CellCursor, move: CursorMove, bounds: GridBounds): CellCursor {
  const lastRow = bounds.rowCount - 1
  const lastCol = bounds.columnCount - 1

  switch (move) {
    case 'up':
      return { ...cursor, rowIndex: clamp(cursor.rowIndex - 1, lastRow) }
    case 'down':
      return { ...cursor, rowIndex: clamp(cursor.rowIndex + 1, lastRow) }
    case 'left':
      return { ...cursor, columnIndex: clamp(cursor.columnIndex - 1, lastCol) }
    case 'right':
      return { ...cursor, columnIndex: clamp(cursor.columnIndex + 1, lastCol) }
    case 'row-start':
      return { ...cursor, columnIndex: 0 }
    case 'row-end':
      return { ...cursor, columnIndex: clamp(lastCol, lastCol) }
    case 'first-row':
      return { ...cursor, rowIndex: 0 }
    case 'last-row':
      return { ...cursor, rowIndex: clamp(lastRow, lastRow) }
  }
}

/** The rectangle spanned by two corners, in either order. */
export function rangeBetween(anchor: CellCursor, cursor: CellCursor): CellRange {
  return {
    rowStart: Math.min(anchor.rowIndex, cursor.rowIndex),
    rowEnd: Math.max(anchor.rowIndex, cursor.rowIndex),
    colStart: Math.min(anchor.columnIndex, cursor.columnIndex),
    colEnd: Math.max(anchor.columnIndex, cursor.columnIndex)
  }
}

export function isInRange(range: CellRange, rowIndex: number, columnIndex: number): boolean {
  return (
    rowIndex >= range.rowStart &&
    rowIndex <= range.rowEnd &&
    columnIndex >= range.colStart &&
    columnIndex <= range.colEnd
  )
}

/** True when the range covers exactly one cell, i.e. nothing was extended. */
export function isSingleCell(range: CellRange): boolean {
  return range.rowStart === range.rowEnd && range.colStart === range.colEnd
}

/**
 * A cursor still inside the grid after the rows or columns changed underneath
 * it - a reload with fewer rows, or a hidden column. Returns null when the grid
 * has nothing left to point at.
 */
export function clampCursor(cursor: CellCursor, bounds: GridBounds): CellCursor | null {
  if (bounds.rowCount === 0 || bounds.columnCount === 0) return null
  return {
    rowIndex: clamp(cursor.rowIndex, bounds.rowCount - 1),
    columnIndex: clamp(cursor.columnIndex, bounds.columnCount - 1)
  }
}
