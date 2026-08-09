import { describe, expect, it } from 'vitest'
import {
  boolishToString,
  coerceCellValue,
  editableEnumValues,
  stringifyValue
} from '@renderer/features/tables/lib/cell-value'
import type { ColumnInfo } from '@renderer/types'

// coerceCellValue decides what is written to the database, so these pin the
// boundaries rather than the happy path.

function column(udtName: string, overrides: Partial<ColumnInfo> = {}): ColumnInfo {
  return {
    name: 'value',
    dataType: udtName,
    udtName,
    isNullable: true,
    isPrimaryKey: false,
    defaultValue: null,
    ordinalPosition: 1,
    characterMaximumLength: null,
    enumValues: null,
    ...overrides
  }
}

const coerce = (udt: string, raw: string, isNull = false, overrides: Partial<ColumnInfo> = {}) =>
  coerceCellValue(column(udt, overrides), raw, isNull)

// vitest.config.ts pins TZ to Asia/Kolkata, so these offsets are the same on
// any machine — and a non-zero offset means the zone actually renders, rather
// than collapsing to the 'Z' that UTC would produce.
const OFFSET = '+05:30'

describe('null', () => {
  it('wins over whatever was typed', () => {
    expect(coerce('text', 'ignored', true)).toBeNull()
    expect(coerce('int4', '42', true)).toBeNull()
  })

  it('is not the same as an empty string on a text column', () => {
    // Writing '' where NULL was meant is a silent data change.
    expect(coerce('text', '')).toBe('')
  })
})

describe('booleans', () => {
  it('reads the forms the engines actually return', () => {
    expect(boolishToString(true)).toBe('true')
    expect(boolishToString(1)).toBe('true')
    expect(boolishToString('1')).toBe('true')
    expect(boolishToString('t')).toBe('true') // postgres
    expect(boolishToString('true')).toBe('true')
    expect(boolishToString(false)).toBe('false')
    expect(boolishToString(0)).toBe('false')
  })

  it('treats absent as unset, not as false', () => {
    expect(boolishToString(null)).toBe('')
    expect(boolishToString(undefined)).toBe('')
    expect(boolishToString('')).toBe('')
  })

  it('coerces to a real boolean, and empty to null', () => {
    expect(coerce('bool', 'true')).toBe(true)
    expect(coerce('bool', 't')).toBe(true)
    expect(coerce('bool', '1')).toBe(true)
    expect(coerce('bool', 'false')).toBe(false)
    expect(coerce('bool', '')).toBeNull()
  })
})

describe('integers', () => {
  it('sends a number', () => {
    expect(coerce('int4', '42')).toBe(42)
    expect(coerce('int8', '-7')).toBe(-7)
  })

  it('rejects anything that is not one', () => {
    expect(() => coerce('int4', '1.5')).toThrow(/invalid integer/)
    expect(() => coerce('int4', '1e3')).toThrow(/invalid integer/)
    expect(() => coerce('int4', 'abc')).toThrow(/invalid integer/)
  })

  it('keeps a bigint as a string rather than rounding it', () => {
    // 9007199254740993 is not representable as a double; Number() would return
    // ...992 and silently write the wrong row id.
    const huge = '9007199254740993'
    expect(coerce('int8', huge)).toBe(huge)
  })

  it('leaves an empty box alone rather than writing 0', () => {
    expect(coerce('int4', '')).toBe('')
  })
})

describe('decimals', () => {
  it('sends numerics as strings, since a double would round them', () => {
    expect(coerce('numeric', '0.1234567890123456789')).toBe('0.1234567890123456789')
  })

  it('rejects a numeric that is not a number', () => {
    expect(() => coerce('numeric', '12abc')).toThrow(/invalid number/)
  })

  it('sends floats as numbers', () => {
    expect(coerce('float8', '1.5')).toBe(1.5)
    expect(coerce('float8', '1e3')).toBe(1000)
  })

  it('rejects a float that is not a number', () => {
    expect(() => coerce('float8', 'abc')).toThrow(/invalid number/)
  })

  it('passes money through for the server to parse', () => {
    expect(coerce('money', '$1,234.56')).toBe('$1,234.56')
  })
})

describe('uuid', () => {
  it('normalises case, since engines compare it lowercased', () => {
    expect(coerce('uuid', '3F2504E0-4F89-11D3-9A0C-0305E82C3301')).toBe(
      '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
    )
  })

  it('rejects a malformed one before it reaches the engine', () => {
    expect(() => coerce('uuid', 'not-a-uuid')).toThrow(/invalid UUID/)
    expect(() => coerce('uuid', '3f2504e0-4f89-11d3-9a0c')).toThrow(/invalid UUID/)
  })
})

describe('json', () => {
  it('sends parsed JSON, not the string of it', () => {
    expect(coerce('jsonb', '{"a":1}')).toEqual({ a: 1 })
    expect(coerce('json', '[1,2]')).toEqual([1, 2])
  })

  it('rejects invalid JSON with the column named', () => {
    expect(() => coerceCellValue(column('jsonb', { name: 'payload' }), '{oops', false)).toThrow(
      /Column "payload": invalid JSON/
    )
  })

  it('leaves an empty box alone rather than writing null', () => {
    expect(coerce('jsonb', '')).toBe('')
  })
})

describe('length limits', () => {
  it('refuses a value the column cannot hold', () => {
    expect(() => coerce('varchar', 'abcd', false, { characterMaximumLength: 3 })).toThrow(
      /exceeds 3 characters/
    )
  })

  it('allows one that exactly fits', () => {
    expect(coerce('varchar', 'abc', false, { characterMaximumLength: 3 })).toBe('abc')
  })

  it('says character, not characters, for a limit of one', () => {
    expect(() => coerce('varchar', 'ab', false, { characterMaximumLength: 1 })).toThrow(
      /exceeds 1 character$/
    )
  })

  it('measures the raw value, not a trimmed one', () => {
    expect(() => coerce('text', '  a  ', false, { characterMaximumLength: 3 })).toThrow(/exceeds/)
  })
})

describe('stringifyValue', () => {
  it('shows an absent value as an empty box', () => {
    expect(stringifyValue(null)).toBe('')
    expect(stringifyValue(undefined)).toBe('')
  })

  it('pretty-prints objects so they can be edited', () => {
    expect(stringifyValue({ a: 1 })).toBe('{\n  "a": 1\n}')
  })

  it('keeps the offset on a timestamptz, which is an absolute instant', () => {
    const value = new Date('2026-08-09T12:00:00Z')
    expect(stringifyValue(value, 'timestamptz')).toBe(`2026-08-09 17:30:00${OFFSET}`)
  })

  it('drops the time from a date column', () => {
    expect(stringifyValue(new Date(2026, 7, 9, 15, 30), 'date')).toBe('2026-08-09')
  })
})

describe('editableEnumValues', () => {
  it('offers the labels when there are some', () => {
    expect(editableEnumValues(column('mood', { enumValues: ['sad', 'ok'] }))).toEqual(['sad', 'ok'])
  })

  it('declines when a label is the empty string, which Radix reserves', () => {
    expect(editableEnumValues(column('mood', { enumValues: ['', 'ok'] }))).toBeNull()
  })

  it('declines when the column is not an enum', () => {
    expect(editableEnumValues(column('text'))).toBeNull()
    expect(editableEnumValues(column('mood', { enumValues: [] }))).toBeNull()
  })
})
