import { describe, expect, it } from 'vitest'
import { isJsonColumn, toBindValue } from '../../../src/main/db/json-bind'

const jsonb = { dataType: 'jsonb', udtName: 'jsonb' }
const mysqlJson = { dataType: 'json', udtName: 'json' }
const text = { dataType: 'text', udtName: 'text' }

describe('which columns are JSON', () => {
  it('recognises both engines', () => {
    expect(isJsonColumn(jsonb)).toBe(true)
    expect(isJsonColumn({ dataType: 'json', udtName: 'json' })).toBe(true)
    expect(isJsonColumn(mysqlJson)).toBe(true)
  })

  it('leaves other columns, including arrays of json, alone', () => {
    expect(isJsonColumn(text)).toBe(false)
    expect(isJsonColumn({ dataType: 'ARRAY', udtName: '_jsonb' })).toBe(false)
  })
})

describe('binding a value read back from a JSON column', () => {
  it('serialises an object, which mysql2 would otherwise send as [object Object]', () => {
    expect(toBindValue(mysqlJson, { a: 1, b: [true, null] })).toBe('{"a":1,"b":[true,null]}')
  })

  it('serialises an array, which node-pg would otherwise send as an array literal', () => {
    expect(toBindValue(jsonb, [1, 2, 3])).toBe('[1,2,3]')
    expect(toBindValue(jsonb, [])).toBe('[]')
  })

  it('passes a string through, since it is already JSON text the user typed', () => {
    expect(toBindValue(jsonb, '{"a":1}')).toBe('{"a":1}')
  })

  it('passes scalars and null through', () => {
    expect(toBindValue(jsonb, 5)).toBe(5)
    expect(toBindValue(jsonb, true)).toBe(true)
    expect(toBindValue(jsonb, null)).toBeNull()
  })

  it('leaves dates and buffers to the driver', () => {
    const when = new Date('2026-01-01T00:00:00Z')
    const bytes = Buffer.from('x')
    expect(toBindValue(jsonb, when)).toBe(when)
    expect(toBindValue(jsonb, bytes)).toBe(bytes)
  })

  it('does nothing for a column that is not JSON', () => {
    const value = [1, 2]
    expect(toBindValue(text, value)).toBe(value)
    expect(toBindValue(undefined, value)).toBe(value)
  })
})
