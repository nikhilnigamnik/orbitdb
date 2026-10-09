import { describe, expect, it } from 'vitest'
import {
  PALETTE_TABLE_LIMIT,
  filterItems,
  matchRank
} from '@renderer/features/command-palette/lib/palette-filter'

interface Row {
  name: string
  schema: string
}

const fields = (row: Row) => [row.name, row.schema]

describe('matchRank', () => {
  it('matches everything on an empty query', () => {
    expect(matchRank('  ', ['users'])).toBe(0)
  })

  it('is case-insensitive', () => {
    expect(matchRank('USE', ['users'])).toBe(0)
  })

  it('ranks a prefix above a word start above a substring', () => {
    const prefix = matchRank('item', ['items'])
    const wordStart = matchRank('item', ['order_items'])
    const inside = matchRank('item', ['lineitems'])
    expect(prefix).toBeLessThan(wordStart!)
    expect(wordStart).toBeLessThan(inside!)
  })

  it('ranks a match on the name above one on the schema', () => {
    expect(matchRank('auth', ['auth_tokens', 'public'])).toBeLessThan(
      matchRank('auth', ['users', 'auth'])!
    )
  })

  it('matches every word of a multi-word query across fields', () => {
    expect(matchRank('public users', ['users', 'public'])).not.toBeNull()
    expect(matchRank('auth users', ['users', 'public'])).toBeNull()
  })

  it('reports no match rather than a poor one', () => {
    expect(matchRank('zzz', ['users', 'public'])).toBeNull()
  })
})

describe('filterItems', () => {
  it('orders best first and keeps the original order between equals', () => {
    const rows: Row[] = [
      { name: 'order_items', schema: 'public' },
      { name: 'items', schema: 'public' },
      { name: 'items_archive', schema: 'public' }
    ]
    const { items } = filterItems(rows, 'items', fields)
    expect(items.map((r) => r.name)).toEqual(['items', 'items_archive', 'order_items'])
  })

  it('caps what it returns but reports how many matched', () => {
    const rows = Array.from({ length: 3000 }, (_, i) => ({ name: `t${i}`, schema: 'public' }))
    const { items, total } = filterItems(rows, '', fields, PALETTE_TABLE_LIMIT)
    expect(items).toHaveLength(PALETTE_TABLE_LIMIT)
    expect(total).toBe(3000)
  })
})
