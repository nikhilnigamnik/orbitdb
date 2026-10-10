import { describe, expect, it } from 'vitest'
import {
  decodeFilters,
  decodeJoin,
  encodeFilters
} from '@renderer/features/tables/lib/filter-params'
import type { RowFilter } from '@renderer/types'

const filters: RowFilter[] = [
  { column: 'status', operator: '=', value: 'active' },
  { column: 'deleted_at', operator: 'is null', value: '' }
]

describe('round trip', () => {
  it('survives encoding and decoding unchanged', () => {
    expect(decodeFilters(encodeFilters(filters))).toEqual(filters)
  })

  it('encodes nothing for an empty set, so the URL stays clean', () => {
    expect(encodeFilters([])).toBeNull()
  })

  it('keeps values that would otherwise need escaping', () => {
    const awkward: RowFilter[] = [{ column: 'name', operator: 'ilike', value: "%o'brien & co%" }]
    expect(decodeFilters(encodeFilters(awkward))).toEqual(awkward)
  })
})

describe('decoding something the user could have edited', () => {
  it('yields nothing for absent or unparseable input', () => {
    // A URL outlives the app that wrote it; a stale link should open the table,
    // not an error.
    expect(decodeFilters(null)).toEqual([])
    expect(decodeFilters('')).toEqual([])
    expect(decodeFilters('not json')).toEqual([])
    expect(decodeFilters('{"not":"an array"}')).toEqual([])
  })

  it('drops an entry with an operator the drivers do not accept', () => {
    const raw = JSON.stringify([
      { column: 'a', operator: '; drop table users --', value: 'x' },
      { column: 'b', operator: '=', value: 'keep' }
    ])
    expect(decodeFilters(raw)).toEqual([{ column: 'b', operator: '=', value: 'keep' }])
  })

  it('drops entries that are not shaped like a filter', () => {
    const raw = JSON.stringify([
      null,
      'string',
      { operator: '=', value: 'x' },
      { column: '', operator: '=', value: 'x' },
      { column: 'a', operator: '=', value: { nested: true } },
      { column: 'good', operator: '=', value: 'x' }
    ])
    expect(decodeFilters(raw)).toEqual([{ column: 'good', operator: '=', value: 'x' }])
  })

  it('keeps a unary filter that carries no value', () => {
    expect(decodeFilters(JSON.stringify([{ column: 'a', operator: 'is null' }]))).toEqual([
      { column: 'a', operator: 'is null', value: undefined }
    ])
  })
})

describe('the connector', () => {
  it('is and unless the URL says otherwise', () => {
    expect(decodeJoin(null)).toBe('and')
    expect(decodeJoin('and')).toBe('and')
    expect(decodeJoin('nonsense')).toBe('and')
  })

  it('reads or', () => {
    expect(decodeJoin('or')).toBe('or')
  })
})

describe('a comparison with nothing to compare against', () => {
  // `?filters=[{"column":"id","operator":"=","value":null}]` used to show an
  // active `id =` chip while main omitted the clause, so every row loaded under
  // a filter that looked applied.
  it('drops a binary operator whose value is JSON null', () => {
    const raw = JSON.stringify([{ column: 'id', operator: '=', value: null }])
    expect(decodeFilters(raw)).toEqual([])
  })

  it('drops a binary operator with no value at all, keeping its neighbours', () => {
    const raw = JSON.stringify([
      { column: 'id', operator: 'ilike' },
      { column: 'name', operator: '=', value: 'keep' }
    ])
    expect(decodeFilters(raw)).toEqual([{ column: 'name', operator: '=', value: 'keep' }])
  })

  it('keeps an empty string, which is a value', () => {
    const raw = JSON.stringify([{ column: 'name', operator: '=', value: '' }])
    expect(decodeFilters(raw)).toEqual([{ column: 'name', operator: '=', value: '' }])
  })

  it('still lets a unary operator arrive with a null value', () => {
    const raw = JSON.stringify([{ column: 'deleted_at', operator: 'is not null', value: null }])
    expect(decodeFilters(raw)).toEqual([{ column: 'deleted_at', operator: 'is not null' }])
  })

  it('still drops a unary operator carrying something that is not a string', () => {
    const raw = JSON.stringify([{ column: 'deleted_at', operator: 'is null', value: 42 }])
    expect(decodeFilters(raw)).toEqual([])
  })
})
