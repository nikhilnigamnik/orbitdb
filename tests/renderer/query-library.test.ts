import { describe, expect, it } from 'vitest'
import {
  collapseSql,
  groupQueries,
  queryLabel
} from '../../src/renderer/src/features/query/lib/query-library'
import type { SavedQuery } from '../../src/shared/types'

function query(overrides: Partial<SavedQuery> = {}): SavedQuery {
  return {
    id: 'q1',
    connectionId: 'c1',
    sql: 'select 1',
    name: null,
    isStarred: false,
    ranAt: '2026-08-10T10:00:00.000Z',
    durationMs: 3,
    success: true,
    ...overrides
  }
}

describe('grouping', () => {
  it('splits the kept ones from the rest, preserving order within each', () => {
    const groups = groupQueries([
      query({ id: 'a', isStarred: true }),
      query({ id: 'b' }),
      query({ id: 'c', isStarred: true }),
      query({ id: 'd' })
    ])

    expect(groups.saved.map((q) => q.id)).toEqual(['a', 'c'])
    expect(groups.recent.map((q) => q.id)).toEqual(['b', 'd'])
  })

  it('handles an empty library', () => {
    expect(groupQueries([])).toEqual({ saved: [], recent: [] })
  })
})

describe('collapsing SQL to one line', () => {
  it('replaces newlines and runs of indentation with single spaces', () => {
    expect(collapseSql('select *\n  from users\n  where id = 1')).toBe(
      'select * from users where id = 1'
    )
  })

  it('trims the ends', () => {
    expect(collapseSql('\n  select 1  \n')).toBe('select 1')
  })
})

describe('the label', () => {
  it('is the name once there is one', () => {
    expect(queryLabel(query({ name: 'Daily signups', isStarred: true }))).toBe('Daily signups')
  })

  it('falls back to the SQL on one line', () => {
    expect(queryLabel(query({ sql: 'select *\nfrom users' }))).toBe('select * from users')
  })

  it('treats a whitespace-only name as no name', () => {
    expect(queryLabel(query({ name: '   ', sql: 'select 1' }))).toBe('select 1')
  })
})
