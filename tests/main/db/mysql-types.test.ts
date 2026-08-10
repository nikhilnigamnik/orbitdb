import { describe, expect, it, vi } from 'vitest'

// mysql2 opens sockets at import time in some environments; the two functions
// under test are pure string handling and need none of it.
vi.mock('mysql2/promise', () => ({ default: { createPool: () => ({}) }, createPool: () => ({}) }))

const { normalizeUdtName, parseEnumValues } = await import('../../../src/main/db/drivers/mysql')

describe('reading enum members out of a MySQL column type', () => {
  it('pulls the labels from the declaration', () => {
    expect(parseEnumValues("enum('Update','Login','Status Change')")).toEqual([
      'Update',
      'Login',
      'Status Change'
    ])
  })

  it('unescapes a doubled quote inside a label', () => {
    // MySQL writes a literal apostrophe as '' inside the declaration.
    expect(parseEnumValues("enum('it''s','fine')")).toEqual(["it's", 'fine'])
  })

  it('handles a label containing a comma', () => {
    expect(parseEnumValues("enum('a,b','c')")).toEqual(['a,b', 'c'])
  })

  it('is case-insensitive about the keyword', () => {
    expect(parseEnumValues("ENUM('A')")).toEqual(['A'])
  })

  it('returns null for anything that is not an enum', () => {
    expect(parseEnumValues('varchar(255)')).toBeNull()
    expect(parseEnumValues('int')).toBeNull()
    // A set is a different type and must not be read as an enum.
    expect(parseEnumValues("set('a','b')")).toBeNull()
  })

  it('returns null rather than an empty list for an empty declaration', () => {
    expect(parseEnumValues('enum()')).toBeNull()
  })
})

describe('normalising a MySQL type name', () => {
  it('leaves an enum as enum, so the members are not printed twice', () => {
    expect(normalizeUdtName('enum', "enum('a','b')")).toBe('enum')
  })

  it('reads tinyint(1) as a boolean', () => {
    expect(normalizeUdtName('tinyint', 'tinyint(1)')).toBe('bool')
    expect(normalizeUdtName('tinyint', 'tinyint(4)')).toBe('int4')
  })

  it('folds the integer and float families', () => {
    expect(normalizeUdtName('bigint', 'bigint(20)')).toBe('int4')
    expect(normalizeUdtName('double', 'double')).toBe('float8')
    expect(normalizeUdtName('decimal', 'decimal(10,2)')).toBe('numeric')
  })

  it('passes anything else through lowercased', () => {
    expect(normalizeUdtName('VARCHAR', 'varchar(255)')).toBe('varchar')
    expect(normalizeUdtName('json', 'json')).toBe('json')
  })
})
