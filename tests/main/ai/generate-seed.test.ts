import { describe, expect, it } from 'vitest'
import { zodSchema } from 'ai'
import { coerceValue, columnSpec, seedRowsSchema } from '../../../src/main/ai/generate-seed'
import type { ColumnInfo, TableDetails } from '../../../src/shared/types'

function col(overrides: Partial<ColumnInfo> = {}): ColumnInfo {
  return {
    name: 'action',
    dataType: 'USER-DEFINED',
    udtName: 'audit_action',
    isNullable: false,
    isPrimaryKey: false,
    defaultValue: null,
    ordinalPosition: 1,
    characterMaximumLength: null,
    enumValues: ['Update', 'Login', 'Status Change'],
    ...overrides
  }
}

function details(columns: ColumnInfo[]): TableDetails {
  return {
    schema: 'public',
    name: 'audit_logs',
    type: 'table',
    columns,
    primaryKey: [],
    indexes: [],
    foreignKeys: [],
    estimatedRows: 0
  }
}

describe('the column list the model is asked to fill', () => {
  it('names the enum type and its values', () => {
    // "USER-DEFINED (NOT NULL)" gave the model no way to invent an acceptable
    // value, so it returned no rows at all.
    const spec = columnSpec(details([col()]), [col()])

    expect(spec).toContain('action: audit_action (NOT NULL)')
    expect(spec).toContain("values: 'Update' | 'Login' | 'Status Change'")
    expect(spec).not.toContain('USER-DEFINED')
  })

  it('omits the length on a MySQL enum', () => {
    // MySQL reports an ENUM's characterMaximumLength as its longest label, so
    // "enum(12)" beside the real values only invites the model to truncate them.
    const mysql = col({
      dataType: "enum('Update','Login')",
      udtName: 'enum',
      characterMaximumLength: 12
    })

    expect(columnSpec(details([mysql]), [mysql])).toContain('- action: enum (NOT NULL)')
  })

  it('leaves an ordinary column rendering as it was', () => {
    const name = col({
      name: 'user_name',
      dataType: 'character varying',
      udtName: 'varchar',
      characterMaximumLength: 120,
      isNullable: true,
      enumValues: null
    })

    expect(columnSpec(details([name]), [name])).toContain(
      '- user_name: character varying(120) (nullable)'
    )
  })
})

describe('the response schema sent to the model', () => {
  const columns = [col(), col({ name: 'user_name', udtName: 'text', enumValues: null })]

  function rowSchema() {
    const json = zodSchema(seedRowsSchema(columns)).jsonSchema as Record<string, never>
    // { rows: { items: <the row shape> } }
    return (json.properties as never)['rows']['items'] as Record<string, unknown>
  }

  it('names every column it is asking for', () => {
    // A z.record converts to {type:'object', additionalProperties:{}} - a row
    // declaring no permitted keys. Sent as a native output_config.format the model
    // answers with an empty array, which surfaced as "returned no sample rows".
    const row = rowSchema()

    expect(Object.keys(row.properties as object)).toEqual(['action', 'user_name'])
    expect(row.required).toEqual(['action', 'user_name'])
    expect(row.additionalProperties, 'an open row is what broke seeding').toBe(false)
  })

  it('accepts the JSON scalars a row value can be', () => {
    const parsed = seedRowsSchema(columns).safeParse({
      rows: [{ action: 'Update', user_name: null }]
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a row missing a column', () => {
    const parsed = seedRowsSchema(columns).safeParse({ rows: [{ action: 'Update' }] })
    expect(parsed.success).toBe(false)
  })
})

describe('coercing a model value for insertion', () => {
  it('repairs the case of an enum value', () => {
    expect(coerceValue(col(), 'update')).toBe('Update')
  })

  it('repairs punctuation and spacing', () => {
    expect(coerceValue(col(), 'status_change')).toBe('Status Change')
  })

  it('substitutes a real label when nothing matches a NOT NULL enum', () => {
    // Fabricated data either way - a usable row beats an insert certain to fail.
    expect(coerceValue(col(), 'Banana')).toBe('Update')
  })

  it('prefers null for an unmatched nullable enum', () => {
    expect(coerceValue(col({ isNullable: true }), 'Banana')).toBeNull()
  })

  it('does not treat an enum named like a date as a date', () => {
    // The type regexes match on the name: "update_time" hits /date|time/ and the
    // value would have been parsed as a timestamp and dropped.
    const timeish = col({ udtName: 'update_time', enumValues: ['Draft', 'Sent'] })

    expect(coerceValue(timeish, 'draft')).toBe('Draft')
  })

  it('still coerces non-enum types as before', () => {
    const int = col({ dataType: 'integer', udtName: 'int4', enumValues: null })
    const bool = col({ dataType: 'boolean', udtName: 'bool', enumValues: null })

    expect(coerceValue(int, '1,200')).toBe(1200)
    expect(coerceValue(bool, 'yes')).toBe(true)
    expect(coerceValue(int, null)).toBeNull()
  })
})
