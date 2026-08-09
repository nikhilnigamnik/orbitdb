import { describe, expect, it } from 'vitest'
import { buildOrderBySql } from '../../../src/main/db/order-by'

const dialect = { quoteIdent: (name: string) => `"${name}"` }
const columns = new Set(['id', 'tenant_id', 'status', 'created_at'])

const order = (by: string | undefined, dir: 'asc' | 'desc' | undefined, pk: string[]) =>
  buildOrderBySql(by, dir, pk, columns, dialect)

describe('with no sort chosen', () => {
  it('orders by the primary key, which is already total', () => {
    expect(order(undefined, undefined, ['id'])).toBe('order by "id"')
  })

  it('orders by every part of a composite key, in order', () => {
    expect(order(undefined, undefined, ['tenant_id', 'id'])).toBe('order by "tenant_id", "id"')
  })

  it('emits nothing when there is no key to order by', () => {
    // A table with no primary key has no stable order to offer.
    expect(order(undefined, undefined, [])).toBe('')
  })
})

describe('with a sort chosen', () => {
  it('breaks ties on the primary key', () => {
    // The bug this replaces: sorting by a non-unique column gave a partial
    // order, so LIMIT/OFFSET could repeat a row on two pages or skip it.
    expect(order('status', 'asc', ['id'])).toBe('order by "status" asc, "id"')
  })

  it('breaks ties the same way when descending', () => {
    expect(order('status', 'desc', ['id'])).toBe('order by "status" desc, "id"')
  })

  it('appends every part of a composite key', () => {
    expect(order('status', 'asc', ['tenant_id', 'id'])).toBe(
      'order by "status" asc, "tenant_id", "id"'
    )
  })

  it('does not mention the sort column twice when it is the key', () => {
    // A repeated term is redundant at best and an error on some engines.
    expect(order('id', 'desc', ['id'])).toBe('order by "id" desc')
  })

  it('keeps the rest of a composite key when sorting by part of it', () => {
    expect(order('tenant_id', 'asc', ['tenant_id', 'id'])).toBe('order by "tenant_id" asc, "id"')
  })

  it('still orders by the key when the sort column is not a real one', () => {
    // A stale sort from a dropped column must not take the ordering with it.
    expect(order('gone', 'asc', ['id'])).toBe('order by "id"')
  })

  it('defaults an unspecified direction to ascending', () => {
    expect(order('status', undefined, ['id'])).toBe('order by "status" asc, "id"')
  })
})
