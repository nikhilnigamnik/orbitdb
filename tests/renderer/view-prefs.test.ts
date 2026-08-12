// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_FROZEN_COLUMNS,
  defaultViewPrefs,
  loadViewPrefs,
  saveViewPrefs,
  toggleFrozenColumn,
  toggleHiddenColumn
} from '../../src/renderer/src/features/tables/lib/view-prefs'

const KEY = 'orbitdb:table-view:c1:public.users'

beforeEach(() => {
  localStorage.clear()
})

describe('a round trip', () => {
  it('comes back as it went in', () => {
    const prefs = {
      columnSizing: { name: 220 },
      hiddenColumns: ['secret'],
      frozenColumns: ['id'],
      orderBy: 'created_at',
      orderDir: 'desc' as const,
      pageSize: 100
    }
    saveViewPrefs('c1', 'public', 'users', prefs)

    expect(loadViewPrefs('c1', 'public', 'users')).toEqual(prefs)
  })

  it('is scoped per connection and per table', () => {
    saveViewPrefs('c1', 'public', 'users', { ...defaultViewPrefs(), pageSize: 250 })

    expect(loadViewPrefs('c2', 'public', 'users').pageSize).toBe(50)
    expect(loadViewPrefs('c1', 'public', 'orders').pageSize).toBe(50)
  })

  it('returns the defaults for a table never opened', () => {
    expect(loadViewPrefs('c1', 'public', 'users')).toEqual(defaultViewPrefs())
  })

  it('writes nothing without a connection', () => {
    saveViewPrefs('', 'public', 'users', defaultViewPrefs())
    expect(localStorage.length).toBe(0)
  })
})

describe('reading a file that has drifted', () => {
  it('falls back to the defaults on unparseable JSON', () => {
    localStorage.setItem(KEY, '{ not json')
    expect(loadViewPrefs('c1', 'public', 'users')).toEqual(defaultViewPrefs())
  })

  it('drops entries of the wrong type rather than trusting them', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        columnSizing: { good: 100, bad: 'wide' },
        hiddenColumns: ['ok', 42],
        frozenColumns: 'id',
        orderBy: 7,
        orderDir: 'sideways',
        pageSize: 'lots'
      })
    )

    expect(loadViewPrefs('c1', 'public', 'users')).toEqual({
      columnSizing: { good: 100 },
      hiddenColumns: ['ok'],
      frozenColumns: [],
      orderBy: null,
      orderDir: 'asc',
      pageSize: 50
    })
  })

  it('clamps a width that would break the grid', () => {
    localStorage.setItem(KEY, JSON.stringify({ columnSizing: { a: 5, b: 99999 } }))

    expect(loadViewPrefs('c1', 'public', 'users').columnSizing).toEqual({ a: 64, b: 1200 })
  })

  it('clamps an out-of-range page size', () => {
    localStorage.setItem(KEY, JSON.stringify({ pageSize: 999999 }))
    expect(loadViewPrefs('c1', 'public', 'users').pageSize).toBe(1000)

    localStorage.setItem(KEY, JSON.stringify({ pageSize: 0 }))
    expect(loadViewPrefs('c1', 'public', 'users').pageSize).toBe(1)
  })

  it('keeps a column that no longer exists', () => {
    // Harmless in either list - it simply never matches - and reconciling would
    // mean passing the current columns in on every read.
    localStorage.setItem(KEY, JSON.stringify({ hiddenColumns: ['dropped_column'] }))

    expect(loadViewPrefs('c1', 'public', 'users').hiddenColumns).toEqual(['dropped_column'])
  })
})

describe('toggling a column', () => {
  const ALL = ['a', 'b', 'c']

  it('hides and shows again', () => {
    expect(toggleHiddenColumn([], 'b', ALL)).toEqual(['b'])
    expect(toggleHiddenColumn(['b'], 'b', ALL)).toEqual([])
  })

  it('refuses to hide the last visible column', () => {
    // An empty grid has no control left to bring anything back.
    expect(toggleHiddenColumn(['a', 'b'], 'c', ALL)).toEqual(['a', 'b'])
  })

  it('still allows showing one back when only one is visible', () => {
    expect(toggleHiddenColumn(['a', 'b'], 'a', ALL)).toEqual(['b'])
  })
})

describe('freezing a column', () => {
  it('pins and unpins', () => {
    expect(toggleFrozenColumn([], 'id')).toEqual(['id'])
    expect(toggleFrozenColumn(['id'], 'id')).toEqual([])
  })

  it('keeps the order they were pinned in', () => {
    expect(toggleFrozenColumn(['id'], 'name')).toEqual(['id', 'name'])
  })

  it('stops at the cap, which would otherwise leave nothing scrollable', () => {
    const full = Array.from({ length: MAX_FROZEN_COLUMNS }, (_, i) => `c${i}`)
    expect(toggleFrozenColumn(full, 'one_more')).toEqual(full)
  })

  it('still unpins when the cap is reached', () => {
    const full = Array.from({ length: MAX_FROZEN_COLUMNS }, (_, i) => `c${i}`)
    expect(toggleFrozenColumn(full, 'c0')).not.toContain('c0')
  })
})
