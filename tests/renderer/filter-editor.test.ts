import { describe, expect, it } from 'vitest'
import {
  OPERATORS,
  isUnaryOperator,
  resolveFilter,
  upsertFilter,
  usesWildcards
} from '@renderer/features/tables/lib/filter-editor'
import type { RowFilter } from '@renderer/types'

describe('resolveFilter', () => {
  it('carries a typed value through as a string', () => {
    expect(resolveFilter('id', '=', 42)).toEqual({ column: 'id', operator: '=', value: '42' })
    expect(resolveFilter('name', 'ilike', '%ab%')).toEqual({
      column: 'name',
      operator: 'ilike',
      value: '%ab%'
    })
  })

  it('turns a NULL pick into a null test, not an empty-string comparison', () => {
    // The bug this replaces: null collapsed to '', committing `col = ''`, which
    // matches nothing on a nullable column.
    expect(resolveFilter('deleted_at', '=', null)).toEqual({
      column: 'deleted_at',
      operator: 'is null',
      value: ''
    })
  })

  it('reads a NULL pick under != as "is not null"', () => {
    expect(resolveFilter('deleted_at', '!=', null)).toEqual({
      column: 'deleted_at',
      operator: 'is not null',
      value: ''
    })
  })

  it('keeps an already-unary operator as it is', () => {
    expect(resolveFilter('a', 'is null', null).operator).toBe('is null')
    expect(resolveFilter('a', 'is not null', null).operator).toBe('is not null')
  })

  it('drops any value a unary operator was carrying', () => {
    expect(resolveFilter('a', 'is null', 'leftover').value).toBe('')
  })

  it('treats the empty string as a value, not as absence', () => {
    // Only a NULL *pick* means absence - an emptied text box is still a value.
    expect(resolveFilter('a', '=', '')).toEqual({ column: 'a', operator: '=', value: '' })
  })

  it('renders false and zero rather than dropping them', () => {
    expect(resolveFilter('flag', '=', false).value).toBe('false')
    expect(resolveFilter('count', '>', 0).value).toBe('0')
  })
})

describe('upsertFilter', () => {
  const existing: RowFilter[] = [
    { column: 'a', operator: '=', value: '1' },
    { column: 'b', operator: '>', value: '2' }
  ]
  const incoming: RowFilter = { column: 'c', operator: '<', value: '3' }

  it('appends when nothing is being edited', () => {
    expect(upsertFilter(existing, incoming, null)).toEqual([...existing, incoming])
  })

  it('replaces in place when editing, leaving the others and the order alone', () => {
    expect(upsertFilter(existing, incoming, 0)).toEqual([incoming, existing[1]])
    expect(upsertFilter(existing, incoming, 1)).toEqual([existing[0], incoming])
  })

  it('does not mutate the array it was given', () => {
    const snapshot = structuredClone(existing)
    upsertFilter(existing, incoming, 0)
    expect(existing).toEqual(snapshot)
  })
})

describe('operator metadata', () => {
  it('marks exactly the null tests as unary', () => {
    const unary = OPERATORS.filter((o) => o.unary).map((o) => o.value)
    expect(unary).toEqual(['is null', 'is not null'])
    expect(isUnaryOperator('is null')).toBe(true)
    expect(isUnaryOperator('=')).toBe(false)
  })

  it('marks exactly the pattern operators as wildcard-taking', () => {
    expect(usesWildcards('like')).toBe(true)
    expect(usesWildcards('ilike')).toBe(true)
    expect(usesWildcards('=')).toBe(false)
    expect(usesWildcards('is null')).toBe(false)
  })

  it('offers every operator the shared RowFilter type allows', () => {
    // Keeps the picker from silently falling behind the type the drivers accept.
    const supported: RowFilter['operator'][] = [
      '=',
      '!=',
      '>',
      '<',
      '>=',
      '<=',
      'like',
      'ilike',
      'is null',
      'is not null'
    ]
    expect(OPERATORS.map((o) => o.value).sort()).toEqual([...supported].sort())
  })
})
