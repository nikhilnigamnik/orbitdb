import { describe, expect, it } from 'vitest'
import { buildFilterSuggestions } from '../../src/renderer/src/features/tables/lib/filter-suggestions'
import type { ColumnInfo } from '../../src/shared/types'

function col(overrides: Partial<ColumnInfo> = {}): ColumnInfo {
  return {
    name: 'id',
    dataType: 'uuid',
    udtName: 'uuid',
    isNullable: false,
    isPrimaryKey: true,
    defaultValue: null,
    ordinalPosition: 1,
    characterMaximumLength: null,
    enumValues: null,
    ...overrides
  }
}

const ACTION = col({
  name: 'action',
  dataType: 'USER-DEFINED',
  udtName: 'audit_action',
  isPrimaryKey: false,
  enumValues: ['Update', 'Login', 'Status Change']
})

const CREATED_AT = col({
  name: 'created_at',
  dataType: 'timestamp with time zone',
  udtName: 'timestamptz',
  isPrimaryKey: false
})

describe('example prompts drawn from the table on screen', () => {
  it('offers an enum value the column really holds', () => {
    // The whole point: "where status is active" was nonsense on a table with no
    // status column, and an enum is the one domain we know without a query.
    expect(buildFilterSuggestions([col(), ACTION])).toContain('action is Update')
  })

  it('offers a relative date against a timestamp column', () => {
    expect(buildFilterSuggestions([col(), CREATED_AT])).toContain('created_at in the last 7 days')
  })

  it('offers a boolean column as a true check', () => {
    const isActive = col({ name: 'is_active', udtName: 'bool', isPrimaryKey: false })
    expect(buildFilterSuggestions([col(), isActive])).toContain('is_active is true')
  })

  it('mixes the shapes rather than draining one kind', () => {
    // Six enums should still leave room for the date example.
    const enums = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) =>
      col({ name: n, udtName: `${n}_kind`, isPrimaryKey: false, enumValues: ['One', 'Two'] })
    )
    const out = buildFilterSuggestions([...enums, CREATED_AT])

    expect(out).toContain('created_at in the last 7 days')
    expect(out).toHaveLength(3)
  })

  it('backs off to sort-only prompts when the table offers nothing of its own', () => {
    // A bare uuid PK yields nothing, but the list must not be empty - and it is
    // two, not three: filler the table cannot answer is worse than a short list.
    const out = buildFilterSuggestions([col()])

    expect(out).toEqual(['most recent 100 rows', 'the 20 oldest rows'])
  })

  it('never suggests more than the dialog shows', () => {
    const many = [ACTION, CREATED_AT, col({ name: 'ok', udtName: 'bool', isPrimaryKey: false })]
    expect(buildFilterSuggestions(many)).toHaveLength(3)
  })

  it('skips an enum carrying an empty label', () => {
    // editableEnumValues rejects these, and "action is " reads as broken.
    const odd = col({ name: 'action', udtName: 'k', isPrimaryKey: false, enumValues: ['', 'Live'] })
    expect(buildFilterSuggestions([odd]).join(' ')).not.toContain('action is')
  })

  it('does not offer an is-not-empty check on a primary key', () => {
    // Unique by definition - the answer is every row.
    const pk = col({ name: 'slug', dataType: 'text', udtName: 'text', isNullable: true })
    expect(buildFilterSuggestions([pk]).join(' ')).not.toContain('slug is not empty')
  })

  it('falls back cleanly on an engine that normalises every type away', () => {
    // D1/SQLite reports only json/bool/int4/float8/text, so no temporal match.
    const sqlite = [
      col({ name: 'id', udtName: 'int4' }),
      col({ name: 'created_at', dataType: 'TEXT', udtName: 'text', isPrimaryKey: false })
    ]
    const out = buildFilterSuggestions(sqlite)

    expect(out).not.toContain('created_at in the last 7 days')
    expect(out).toEqual(['most recent 100 rows', 'the 20 oldest rows'])
  })
})
