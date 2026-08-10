import { describe, expect, it } from 'vitest'
import { repairFilters, snapEnumValue, type RawFilter } from '../../../src/main/ai/filter-repair'
import type { ColumnInfo } from '../../../src/shared/types'

function column(overrides: Partial<ColumnInfo> = {}): ColumnInfo {
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

const NAME = column({
  name: 'user_name',
  dataType: 'text',
  udtName: 'text',
  enumValues: null
})

function repair(raw: RawFilter[], columns: ColumnInfo[] = [column(), NAME]) {
  return repairFilters(raw, columns)
}

describe('snapping a model value onto a real enum label', () => {
  it('fixes the case the model guessed wrong', () => {
    expect(snapEnumValue('update', ['Update', 'Login'])).toBe('Update')
  })

  it('looks through the punctuation a model substitutes for spaces', () => {
    expect(snapEnumValue('status_change', ['Status Change'])).toBe('Status Change')
    expect(snapEnumValue('STATUS-CHANGE', ['Status Change'])).toBe('Status Change')
  })

  it('prefers the exact label when two differ only in case', () => {
    // Legal in Postgres, and snapping to the other one answers a different question.
    expect(snapEnumValue('update', ['Update', 'update'])).toBe('update')
    expect(snapEnumValue('Update', ['Update', 'update'])).toBe('Update')
  })

  it('refuses a value that is merely close', () => {
    expect(snapEnumValue('updte', ['Update', 'Login'])).toBeNull()
  })

  it('refuses an empty value', () => {
    expect(snapEnumValue('', ['Update'])).toBeNull()
    expect(snapEnumValue('   ', ['Update'])).toBeNull()
  })

  it('does not let a punctuation-only label swallow everything', () => {
    // Both squash to '', which would otherwise match.
    expect(snapEnumValue('!!!', ['---'])).toBeNull()
  })
})

describe('repairing the filters a model returned', () => {
  it('snaps the enum value the database would have rejected', () => {
    // The reported bug: "show rows that action has update" against an enum whose
    // labels are capitalised produced `invalid input value for enum audit_action`.
    const { filters, notes } = repair([{ column: 'action', operator: '=', value: 'update' }])

    expect(filters).toEqual([{ column: 'action', operator: '=', value: 'Update' }])
    expect(notes).toEqual([])
  })

  it('downgrades a wildcard match on an enum to equality', () => {
    // `enum ILIKE text` is "operator does not exist" - it can never execute.
    const { filters } = repair([{ column: 'action', operator: 'ilike', value: '%update%' }])

    expect(filters).toEqual([{ column: 'action', operator: '=', value: 'Update' }])
  })

  it('leaves a wildcard match on a text column exactly as it is', () => {
    const { filters } = repair([{ column: 'user_name', operator: 'ilike', value: '%aarav%' }])

    expect(filters).toEqual([{ column: 'user_name', operator: 'ilike', value: '%aarav%' }])
  })

  it('keeps an ordering operator on an enum but still snaps its value', () => {
    // Postgres enums are totally ordered by enumsortorder, so this is legal SQL.
    const { filters } = repair([{ column: 'action', operator: '>', value: 'login' }])

    expect(filters).toEqual([{ column: 'action', operator: '>', value: 'Login' }])
  })

  it('drops a value no label matches and names it in a note', () => {
    const { filters, notes } = repair([{ column: 'action', operator: '=', value: 'updte' }])

    expect(filters).toEqual([])
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('action')
    expect(notes[0]).toContain('updte')
  })

  it('drops a wildcard that strips to nothing', () => {
    const { filters, notes } = repair([{ column: 'action', operator: 'ilike', value: '%' }])

    expect(filters).toEqual([])
    expect(notes).toHaveLength(1)
  })

  it('leaves a null check on an enum column untouched', () => {
    const { filters, notes } = repair([{ column: 'action', operator: 'is null' }])

    expect(filters).toEqual([{ column: 'action', operator: 'is null' }])
    expect(notes).toEqual([])
  })

  it('drops a filter on a column the model invented', () => {
    const { filters, notes } = repair([{ column: 'nope', operator: '=', value: 'x' }])

    expect(filters).toEqual([])
    // Not the user's problem to solve - nothing to rephrase.
    expect(notes).toEqual([])
  })

  it('drops a value that still smells like a SQL expression', () => {
    // Values are bound as parameters, so this would be sent as a literal.
    const { filters } = repair([{ column: 'user_name', operator: '=', value: 'now()' }])

    expect(filters).toEqual([])
  })

  it('keeps the conditions it can while dropping the ones it cannot', () => {
    const { filters, notes } = repair([
      { column: 'action', operator: '=', value: 'update' },
      { column: 'action', operator: '=', value: 'banana' }
    ])

    expect(filters).toEqual([{ column: 'action', operator: '=', value: 'Update' }])
    expect(notes).toHaveLength(1)
  })

  it('leaves every filter alone on an engine without enums', () => {
    // D1/SQLite reports enumValues: null for every column.
    const sqlite = [column({ dataType: 'TEXT', udtName: 'TEXT', enumValues: null })]
    const { filters, notes } = repair(
      [{ column: 'action', operator: 'ilike', value: '%up%' }],
      sqlite
    )

    expect(filters).toEqual([{ column: 'action', operator: 'ilike', value: '%up%' }])
    expect(notes).toEqual([])
  })
})
