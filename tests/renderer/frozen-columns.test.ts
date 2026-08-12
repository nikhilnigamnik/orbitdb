import { describe, expect, it } from 'vitest'
import {
  FROZEN_DEFAULT_WIDTH,
  LEADING_STICKY_WIDTH,
  frozenOffsets,
  frozenWidth,
  orderColumns
} from '../../src/renderer/src/features/tables/lib/frozen-columns'

describe('the left offsets', () => {
  it('starts past the checkbox and row-number columns', () => {
    expect(frozenOffsets(['id'], {}).get('id')).toBe(LEADING_STICKY_WIDTH)
  })

  it('accumulates the widths of everything pinned before', () => {
    const offsets = frozenOffsets(['id', 'name'], { id: 100, name: 200 })

    expect(offsets.get('id')).toBe(LEADING_STICKY_WIDTH)
    expect(offsets.get('name')).toBe(LEADING_STICKY_WIDTH + 100)
  })

  it('falls back to a fixed width for a column never dragged', () => {
    // An auto-sized column measures differently per render, and the offsets
    // would drift with it.
    const offsets = frozenOffsets(['id', 'name'], {})

    expect(offsets.get('name')).toBe(LEADING_STICKY_WIDTH + FROZEN_DEFAULT_WIDTH)
    expect(frozenWidth('id', {})).toBe(FROZEN_DEFAULT_WIDTH)
    expect(frozenWidth('id', { id: 90 })).toBe(90)
  })

  it('leaves unfrozen columns out entirely', () => {
    expect(frozenOffsets(['id'], {}).has('name')).toBe(false)
  })

  it('is empty with nothing frozen', () => {
    expect(frozenOffsets([], {}).size).toBe(0)
  })
})

describe('ordering', () => {
  const COLUMNS = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]

  it('moves pinned columns to the front, in the order they were pinned', () => {
    expect(orderColumns(COLUMNS, ['c', 'a']).map((column) => column.name)).toEqual(['c', 'a', 'b'])
  })

  it('leaves the list untouched with nothing pinned', () => {
    expect(orderColumns(COLUMNS, [])).toBe(COLUMNS)
  })

  it('ignores a pinned column that is no longer there', () => {
    // A dropped column, or one hidden since it was pinned.
    expect(orderColumns(COLUMNS, ['gone', 'b']).map((column) => column.name)).toEqual([
      'b',
      'a',
      'c'
    ])
  })

  it('never drops or duplicates a column', () => {
    const ordered = orderColumns(COLUMNS, ['b'])
    expect(ordered).toHaveLength(COLUMNS.length)
    expect(new Set(ordered.map((c) => c.name)).size).toBe(COLUMNS.length)
  })
})
