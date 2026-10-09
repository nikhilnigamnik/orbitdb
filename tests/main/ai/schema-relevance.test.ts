import { describe, expect, it } from 'vitest'

import { nameVariants, selectRelevantTables } from '../../../src/main/ai/schema-relevance'
import type { SchemaGraphEdge, SchemaGraphTable } from '../../../src/shared/types'

function table(name: string, columns: string[] = ['id']): SchemaGraphTable {
  return {
    schema: 'public',
    name,
    columns: columns.map((c) => ({
      name: c,
      dataType: 'text',
      udtName: 'text',
      isNullable: true,
      isPrimaryKey: c === 'id',
      enumValues: null
    }))
  }
}

function fk(from: string, to: string): SchemaGraphEdge {
  return {
    name: `${from}_${to}_fk`,
    from: { schema: 'public', table: from, columns: [`${to}_id`] },
    to: { schema: 'public', table: to, columns: ['id'] }
  }
}

/** a_001 … a_099, then the tables a test actually cares about, sorting last. */
const FILLER = Array.from({ length: 99 }, (_, i) => table(`a_${String(i + 1).padStart(3, '0')}`))

function names(tables: SchemaGraphTable[]): string[] {
  return tables.map((t) => t.name)
}

describe('selectRelevantTables', () => {
  it('keeps every table when they all fit', () => {
    const tables = [table('users'), table('orders')]
    expect(selectRelevantTables(tables, [], 'anything', 60)).toBe(tables)
  })

  it('keeps the first ones, as before, when there is nothing to rank by', () => {
    expect(names(selectRelevantTables(FILLER, [], '', 10))).toEqual(names(FILLER.slice(0, 10)))
  })

  it('finds a table the SQL names even when it sorts past the cut', () => {
    // The bug: on JRS's 110-table schema the first 60 alphabetically were all
    // the model ever saw.
    const tables = [...FILLER, table('users')]
    const shown = names(selectRelevantTables(tables, [], 'select email from "users"', 60))
    expect(shown).toHaveLength(60)
    expect(shown).toContain('users')
  })

  it('matches a request in the other number, and a word of a compound name', () => {
    const tables = [...FILLER, table('patients'), table('dispense_items'), table('categories')]
    const shown = names(
      selectRelevantTables(tables, [], 'medicines dispensed to each patient by category', 60)
    )
    expect(shown).toContain('patients')
    expect(shown).toContain('categories')
    // "dispensed" is not "dispense", and a guess that loose would match noise.
    expect(shown).not.toContain('dispense_items')
    expect(names(selectRelevantTables(tables, [], 'total dispense quantity', 60))).toContain(
      'dispense_items'
    )
  })

  it('matches a table named in plain words, above the neighbours of a busy one', () => {
    // On JRS "revenue targets for this quarter by user" missed revenue_targets:
    // dozens of tables join users, and each of them outscored a two-word match.
    const hub = Array.from({ length: 70 }, (_, i) => table(`h_${String(i).padStart(3, '0')}`))
    const tables = [...hub, table('users'), table('revenue_targets')]
    const edges = hub.map((t) => fk(t.name, 'users'))
    const shown = names(
      selectRelevantTables(tables, edges, 'revenue targets for this quarter by user', 60)
    )
    expect(shown).toContain('revenue_targets')
    expect(shown).toContain('users')
    expect(
      names(selectRelevantTables(tables, edges, 'the revenue target for each user', 60))
    ).toContain('revenue_targets')
  })

  it('brings in what a named table joins to, which the query will need', () => {
    const tables = [...FILLER, table('orders'), table('customers')]
    const shown = names(
      selectRelevantTables(tables, [fk('orders', 'customers')], 'total of orders last week', 60)
    )
    expect(shown).toContain('orders')
    expect(shown).toContain('customers')
  })

  it('scores a distinctive column, but not one every table has', () => {
    const tables = [...FILLER, table('people', ['id', 'phone_number'])]
    expect(names(selectRelevantTables(tables, [], 'who has phone_number set', 60))).toContain(
      'people'
    )
    const everyone = [
      ...FILLER.map((t) => table(t.name, ['id', 'created_at'])),
      table('zzz', ['id', 'created_at'])
    ]
    expect(names(selectRelevantTables(everyone, [], 'order by created_at', 60))).not.toContain(
      'zzz'
    )
  })

  it('returns the chosen tables in their original order', () => {
    const tables = [...FILLER, table('users')]
    const shown = names(selectRelevantTables(tables, [], 'users', 60))
    expect(shown.at(-1)).toBe('users')
  })
})

describe('nameVariants', () => {
  it('pairs singular and plural the way table names are written', () => {
    expect(nameVariants('patients')).toContain('patient')
    expect(nameVariants('patient')).toContain('patients')
    expect(nameVariants('categories')).toContain('category')
    expect(nameVariants('category')).toContain('categories')
    expect(nameVariants('addresses')).toContain('address')
    expect(nameVariants('status')).not.toContain('statu')
    expect(nameVariants('analysis')).not.toContain('analysi')
  })
})
