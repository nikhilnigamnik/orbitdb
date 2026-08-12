import { describe, expect, it } from 'vitest'
import {
  childFilters,
  childTableLabel
} from '../../src/renderer/src/features/tables/lib/referencing'
import {
  decodeFilters,
  tableRouteWithFilters
} from '../../src/renderer/src/features/tables/lib/filter-params'
import type { ReferencingKeyInfo } from '../../src/shared/types'

function key(overrides: Partial<ReferencingKeyInfo> = {}): ReferencingKeyInfo {
  return {
    name: 'orders_user_id_fkey',
    schema: 'public',
    table: 'orders',
    columns: ['user_id'],
    referencedSchema: 'public',
    referencedTable: 'users',
    referencedColumns: ['id'],
    onDelete: 'CASCADE',
    onUpdate: 'NO ACTION',
    ...overrides
  }
}

describe('the filters that find a row’s children', () => {
  it('matches the child column against the parent value', () => {
    expect(childFilters(key(), { id: 42, email: 'a@b.c' })).toEqual([
      { column: 'user_id', operator: '=', value: '42' }
    ])
  })

  it('reads the referenced column, not the primary key', () => {
    // A foreign key may point at any unique column, and often does.
    const fk = key({ columns: ['user_email'], referencedColumns: ['email'] })

    expect(childFilters(fk, { id: 42, email: 'a@b.c' })).toEqual([
      { column: 'user_email', operator: '=', value: 'a@b.c' }
    ])
  })

  it('pairs a composite key up in order', () => {
    const fk = key({
      columns: ['tenant_id', 'user_id'],
      referencedColumns: ['tenant', 'id']
    })

    expect(childFilters(fk, { tenant: 't1', id: 7 })).toEqual([
      { column: 'tenant_id', operator: '=', value: 't1' },
      { column: 'user_id', operator: '=', value: '7' }
    ])
  })

  it('refuses a NULL on the parent side', () => {
    // `col = NULL` is never true, so a filter built from it would report zero
    // children as confidently as a real count.
    expect(childFilters(key({ referencedColumns: ['email'] }), { email: null })).toBeNull()
  })

  it('refuses a column the row does not carry', () => {
    expect(childFilters(key(), { email: 'a@b.c' })).toBeNull()
  })

  it('refuses a key whose two sides disagree on width', () => {
    expect(childFilters(key({ columns: ['a', 'b'] }), { id: 1 })).toBeNull()
    expect(childFilters(key({ columns: [], referencedColumns: [] }), { id: 1 })).toBeNull()
  })

  it('stringifies a date rather than handing the filter an object', () => {
    const fk = key({ columns: ['day'], referencedColumns: ['created_at'] })
    const filters = childFilters(fk, { created_at: new Date('2026-08-10T00:00:00Z') })

    expect(typeof filters![0].value).toBe('string')
  })
})

describe('the label for a child table', () => {
  it('drops the schema when it is the same one', () => {
    expect(childTableLabel(key())).toBe('orders')
  })

  it('keeps it when the child lives elsewhere', () => {
    expect(childTableLabel(key({ schema: 'billing' }))).toBe('billing.orders')
  })
})

describe('the route to those children', () => {
  it('round-trips through the filters param', () => {
    const filters = childFilters(key(), { id: 42 })!
    const route = tableRouteWithFilters('public', 'orders', filters)

    const params = new URLSearchParams(route.slice(route.indexOf('?')))
    expect(params.get('table')).toBe('orders')
    expect(decodeFilters(params.get('filters'))).toEqual(filters)
  })

  it('falls back to the plain table route with nothing to filter on', () => {
    expect(tableRouteWithFilters('public', 'orders', [])).not.toContain('filters=')
  })
})
