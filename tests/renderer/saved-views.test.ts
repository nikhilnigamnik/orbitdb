import { describe, expect, it } from 'vitest'
import {
  applyViewToPrefs,
  captureView,
  isSameView,
  sortViews,
  upsertView
} from '@renderer/features/tables/lib/saved-views'
import { defaultViewPrefs } from '@renderer/features/tables/lib/view-prefs'
import type { SavedTableView, TableViewState } from '@renderer/types'

function view(overrides: Partial<TableViewState> = {}): TableViewState {
  return {
    filters: [{ column: 'status', operator: '=', value: 'active' }],
    filterJoin: 'and',
    orderBy: 'created_at',
    orderDir: 'desc',
    hiddenColumns: [],
    frozenColumns: [],
    pageSize: 50,
    ...overrides
  }
}

function saved(id: string, name: string): SavedTableView {
  return {
    id,
    connectionId: 'c1',
    schema: 'public',
    table: 'users',
    name,
    view: view(),
    createdAt: '2026-08-10T10:00:00.000Z',
    updatedAt: '2026-08-10T10:00:00.000Z'
  }
}

describe('capturing what is on screen', () => {
  it('takes the filters, the sort and the column layout', () => {
    const captured = captureView({
      filters: [{ column: 'status', operator: '=', value: 'active' }],
      filterJoin: 'or',
      orderBy: 'name',
      orderDir: 'asc',
      prefs: {
        ...defaultViewPrefs(),
        hiddenColumns: ['secret'],
        frozenColumns: ['id'],
        pageSize: 100
      }
    })

    expect(captured).toEqual({
      filters: [{ column: 'status', operator: '=', value: 'active' }],
      filterJoin: 'or',
      orderBy: 'name',
      orderDir: 'asc',
      hiddenColumns: ['secret'],
      frozenColumns: ['id'],
      pageSize: 100
    })
  })

  it('leaves column widths out - they belong to the table, not to a view', () => {
    const captured = captureView({
      filters: [],
      filterJoin: 'and',
      orderBy: null,
      orderDir: 'asc',
      prefs: { ...defaultViewPrefs(), columnSizing: { id: 220 } }
    })

    expect(captured).not.toHaveProperty('columnSizing')
  })
})

describe('applying a view to the stored preferences', () => {
  it('carries the layout across', () => {
    const next = applyViewToPrefs(
      view({ hiddenColumns: ['secret'], frozenColumns: ['id'], pageSize: 250 }),
      defaultViewPrefs()
    )

    expect(next.hiddenColumns).toEqual(['secret'])
    expect(next.frozenColumns).toEqual(['id'])
    expect(next.pageSize).toBe(250)
    expect(next.orderBy).toBe('created_at')
    expect(next.orderDir).toBe('desc')
  })

  it('keeps the widths the user dragged, which no view records', () => {
    const prefs = { ...defaultViewPrefs(), columnSizing: { id: 220 } }

    expect(applyViewToPrefs(view(), prefs).columnSizing).toEqual({ id: 220 })
  })
})

describe('deciding whether the screen still matches the view', () => {
  it('matches an identical view', () => {
    expect(isSameView(view(), view())).toBe(true)
  })

  it('notices a changed filter value', () => {
    expect(
      isSameView(
        view(),
        view({ filters: [{ column: 'status', operator: '=', value: 'archived' }] })
      )
    ).toBe(false)
  })

  it('ignores the join below two filters, where it changes nothing', () => {
    // The filter bar only offers the connector once there are two filters, so
    // reporting "modified" here would point at a control that is not on screen.
    expect(isSameView(view({ filterJoin: 'and' }), view({ filterJoin: 'or' }))).toBe(true)
  })

  it('notices the join once two filters actually combine', () => {
    const two = [
      { column: 'status', operator: '=' as const, value: 'active' },
      { column: 'plan', operator: '=' as const, value: 'pro' }
    ]

    expect(
      isSameView(
        view({ filters: two, filterJoin: 'and' }),
        view({ filters: two, filterJoin: 'or' })
      )
    ).toBe(false)
  })

  it('ignores the sort direction when nothing is sorted', () => {
    expect(
      isSameView(
        view({ orderBy: null, orderDir: 'asc' }),
        view({ orderBy: null, orderDir: 'desc' })
      )
    ).toBe(true)
  })

  it('treats hidden columns as a set, since the order they were ticked is not a view', () => {
    expect(
      isSameView(view({ hiddenColumns: ['a', 'b'] }), view({ hiddenColumns: ['b', 'a'] }))
    ).toBe(true)
  })

  it('treats frozen columns as a sequence, since that order is the pin order', () => {
    expect(
      isSameView(view({ frozenColumns: ['a', 'b'] }), view({ frozenColumns: ['b', 'a'] }))
    ).toBe(false)
  })

  it('notices a changed page size', () => {
    expect(isSameView(view(), view({ pageSize: 100 }))).toBe(false)
  })
})

describe('keeping the list in order', () => {
  it('sorts by name', () => {
    expect(sortViews([saved('2', 'Zebra'), saved('1', 'Alpha')]).map((v) => v.name)).toEqual([
      'Alpha',
      'Zebra'
    ])
  })

  it('replaces a view in place rather than adding a second copy', () => {
    const list = [saved('1', 'Alpha'), saved('2', 'Zebra')]
    const renamed = { ...saved('1', 'Middle') }

    expect(upsertView(list, renamed).map((v) => v.name)).toEqual(['Middle', 'Zebra'])
  })

  it('adds one that is not there yet', () => {
    expect(upsertView([saved('1', 'Alpha')], saved('2', 'Beta')).map((v) => v.name)).toEqual([
      'Alpha',
      'Beta'
    ])
  })
})
