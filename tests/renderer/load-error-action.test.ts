import { describe, expect, it } from 'vitest'
import {
  loadErrorAction,
  type FilterQueryState
} from '../../src/renderer/src/features/tables/lib/load-error-action'

const NONE: FilterQueryState = { filters: [], filterJoin: 'and' }
const UPDATE: FilterQueryState = {
  filters: [{ column: 'action', operator: '=', value: 'update' }],
  filterJoin: 'and'
}

describe('what a failed load should offer', () => {
  it('offers to undo when the filters are what changed', () => {
    expect(loadErrorAction(UPDATE, NONE)).toBe('undo')
  })

  it('offers a refresh when the filters did not change', () => {
    // A sort-only reload that fails is not the filters' fault, and offering to
    // revert them would be a lie.
    expect(loadErrorAction(UPDATE, UPDATE)).toBe('refresh')
  })

  it('offers a refresh when no load has ever succeeded', () => {
    // There is no known-good state to go back to.
    expect(loadErrorAction(UPDATE, null)).toBe('refresh')
  })

  it('offers to undo when only the join changed', () => {
    expect(loadErrorAction({ ...UPDATE, filterJoin: 'or' }, UPDATE)).toBe('undo')
  })

  it('offers to undo when a filter value changed in place', () => {
    const edited: FilterQueryState = {
      filters: [{ column: 'action', operator: '=', value: 'Update' }],
      filterJoin: 'and'
    }
    expect(loadErrorAction(edited, UPDATE)).toBe('undo')
  })

  it('treats an identical filter list as unchanged whatever the array identity', () => {
    expect(loadErrorAction(UPDATE, { ...UPDATE, filters: [...UPDATE.filters] })).toBe('refresh')
  })
})
