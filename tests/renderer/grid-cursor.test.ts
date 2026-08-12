import { describe, expect, it } from 'vitest'
import {
  clampCursor,
  isInRange,
  isSingleCell,
  moveCursor,
  rangeBetween
} from '../../src/renderer/src/features/tables/lib/grid-cursor'

const BOUNDS = { rowCount: 3, columnCount: 4 }

describe('moving the cursor', () => {
  it('steps in each direction', () => {
    const start = { rowIndex: 1, columnIndex: 1 }

    expect(moveCursor(start, 'up', BOUNDS)).toEqual({ rowIndex: 0, columnIndex: 1 })
    expect(moveCursor(start, 'down', BOUNDS)).toEqual({ rowIndex: 2, columnIndex: 1 })
    expect(moveCursor(start, 'left', BOUNDS)).toEqual({ rowIndex: 1, columnIndex: 0 })
    expect(moveCursor(start, 'right', BOUNDS)).toEqual({ rowIndex: 1, columnIndex: 2 })
  })

  it('stops at the edges instead of wrapping', () => {
    // A right arrow that lands you one row down is a surprise; Tab inside the
    // editor is the control that wraps.
    expect(moveCursor({ rowIndex: 0, columnIndex: 3 }, 'right', BOUNDS)).toEqual({
      rowIndex: 0,
      columnIndex: 3
    })
    expect(moveCursor({ rowIndex: 0, columnIndex: 0 }, 'left', BOUNDS)).toEqual({
      rowIndex: 0,
      columnIndex: 0
    })
    expect(moveCursor({ rowIndex: 2, columnIndex: 0 }, 'down', BOUNDS)).toEqual({
      rowIndex: 2,
      columnIndex: 0
    })
    expect(moveCursor({ rowIndex: 0, columnIndex: 0 }, 'up', BOUNDS)).toEqual({
      rowIndex: 0,
      columnIndex: 0
    })
  })

  it('jumps to the ends of a row and of the grid', () => {
    const start = { rowIndex: 1, columnIndex: 2 }

    expect(moveCursor(start, 'row-start', BOUNDS).columnIndex).toBe(0)
    expect(moveCursor(start, 'row-end', BOUNDS).columnIndex).toBe(3)
    expect(moveCursor(start, 'first-row', BOUNDS).rowIndex).toBe(0)
    expect(moveCursor(start, 'last-row', BOUNDS).rowIndex).toBe(2)
  })

  it('does not go negative in an empty grid', () => {
    const empty = { rowCount: 0, columnCount: 0 }

    expect(moveCursor({ rowIndex: 0, columnIndex: 0 }, 'row-end', empty)).toEqual({
      rowIndex: 0,
      columnIndex: 0
    })
    expect(moveCursor({ rowIndex: 0, columnIndex: 0 }, 'last-row', empty).rowIndex).toBe(0)
  })
})

describe('the range between two corners', () => {
  it('normalises whichever way it was dragged', () => {
    const downRight = rangeBetween({ rowIndex: 0, columnIndex: 1 }, { rowIndex: 2, columnIndex: 3 })
    const upLeft = rangeBetween({ rowIndex: 2, columnIndex: 3 }, { rowIndex: 0, columnIndex: 1 })

    expect(downRight).toEqual({ rowStart: 0, rowEnd: 2, colStart: 1, colEnd: 3 })
    expect(upLeft).toEqual(downRight)
  })

  it('is inclusive at both ends', () => {
    const range = rangeBetween({ rowIndex: 1, columnIndex: 1 }, { rowIndex: 2, columnIndex: 2 })

    expect(isInRange(range, 1, 1)).toBe(true)
    expect(isInRange(range, 2, 2)).toBe(true)
    expect(isInRange(range, 0, 1)).toBe(false)
    expect(isInRange(range, 1, 3)).toBe(false)
  })

  it('knows when nothing was extended', () => {
    const one = rangeBetween({ rowIndex: 1, columnIndex: 1 }, { rowIndex: 1, columnIndex: 1 })
    const many = rangeBetween({ rowIndex: 1, columnIndex: 1 }, { rowIndex: 1, columnIndex: 2 })

    expect(isSingleCell(one)).toBe(true)
    expect(isSingleCell(many)).toBe(false)
  })
})

describe('after the grid changes underneath', () => {
  it('pulls a cursor back inside', () => {
    // A reload with fewer rows, or a hidden column.
    expect(clampCursor({ rowIndex: 9, columnIndex: 9 }, BOUNDS)).toEqual({
      rowIndex: 2,
      columnIndex: 3
    })
  })

  it('drops the cursor when there is nothing left to point at', () => {
    expect(clampCursor({ rowIndex: 0, columnIndex: 0 }, { rowCount: 0, columnCount: 4 })).toBeNull()
    expect(clampCursor({ rowIndex: 0, columnIndex: 0 }, { rowCount: 3, columnCount: 0 })).toBeNull()
  })
})
