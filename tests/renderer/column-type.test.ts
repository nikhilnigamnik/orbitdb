import { describe, expect, it } from 'vitest'
import { formatColumnType } from '@renderer/lib/column-type'

describe('Postgres verbose spellings', () => {
  it('shortens them to what Postgres itself calls them', () => {
    // These are what crushed the column name in the grid header.
    expect(formatColumnType('timestamp with time zone', 'timestamptz')).toBe('timestamptz')
    expect(formatColumnType('timestamp without time zone', 'timestamp')).toBe('timestamp')
    expect(formatColumnType('character varying', 'varchar')).toBe('varchar')
    expect(formatColumnType('double precision', 'float8')).toBe('float8')
  })

  it('does not care about case', () => {
    expect(formatColumnType('TIMESTAMP WITH TIME ZONE', 'timestamptz')).toBe('timestamptz')
  })
})

describe('placeholders that name no type', () => {
  it('shows an enum’s own name instead of USER-DEFINED', () => {
    // USER-DEFINED is what information_schema says for enums and composites —
    // it is not a type name, and told the user nothing.
    expect(formatColumnType('USER-DEFINED', 'order_status')).toBe('order_status')
  })

  it('shows an array as its element type', () => {
    // Postgres reports ARRAY, with udt_name as the element type underscored.
    expect(formatColumnType('ARRAY', '_text')).toBe('text[]')
    expect(formatColumnType('ARRAY', '_int4')).toBe('int4[]')
  })

  it('keeps the placeholder when there is nothing better', () => {
    expect(formatColumnType('USER-DEFINED', undefined)).toBe('USER-DEFINED')
  })
})

describe('engines that already label well', () => {
  it('leaves MySQL’s precision alone', () => {
    // MySQL puts the useful detail in dataType and normalises udtName for the
    // editor, so preferring udtName here would lose information.
    expect(formatColumnType('varchar(255)', 'text')).toBe('varchar(255)')
    expect(formatColumnType('int(11)', 'int4')).toBe('int(11)')
    expect(formatColumnType('tinyint(1)', 'bool')).toBe('tinyint(1)')
  })

  it('leaves SQLite’s declared types alone', () => {
    expect(formatColumnType('TEXT', 'text')).toBe('TEXT')
    expect(formatColumnType('INTEGER', 'int4')).toBe('INTEGER')
  })

  it('leaves plain Postgres types alone', () => {
    expect(formatColumnType('uuid', 'uuid')).toBe('uuid')
    expect(formatColumnType('jsonb', 'jsonb')).toBe('jsonb')
  })
})

describe('missing input', () => {
  it('falls back to the udt name when there is no data type', () => {
    expect(formatColumnType('', 'uuid')).toBe('uuid')
    expect(formatColumnType('   ', 'uuid')).toBe('uuid')
  })

  it('yields an empty string when there is nothing at all', () => {
    expect(formatColumnType('', undefined)).toBe('')
  })
})
