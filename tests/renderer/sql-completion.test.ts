import { describe, expect, it } from 'vitest'
import {
  buildSqlSchema,
  dialectFor,
  tableNames
} from '../../src/renderer/src/features/query/lib/sql-completion'
import { MySQL, PostgreSQL, SQLite } from '@codemirror/lang-sql'
import type { SchemaGraph } from '../../src/shared/types'

function graph(schema: string, tables: Record<string, string[]>): SchemaGraph {
  return {
    schema,
    edges: [],
    tables: Object.entries(tables).map(([name, columns]) => ({
      schema,
      name,
      columns: columns.map((column) => ({
        name: column,
        dataType: 'text',
        udtName: 'text',
        isNullable: true,
        isPrimaryKey: false,
        enumValues: null
      }))
    }))
  }
}

describe('the dialect', () => {
  it('follows the engine', () => {
    expect(dialectFor('postgres')).toBe(PostgreSQL)
    expect(dialectFor('mysql')).toBe(MySQL)
    expect(dialectFor('d1')).toBe(SQLite)
  })
})

describe('the completion namespace', () => {
  const PUBLIC = graph('public', { users: ['id', 'email'], orders: ['id', 'total'] })

  it('offers a table both qualified and bare', () => {
    // Real queries are written unqualified, so completing only `public.users`
    // would mean the common case never fires.
    const schema = buildSqlSchema([PUBLIC], 'public')

    expect(schema).toHaveProperty('users', ['id', 'email'])
    expect(schema).toHaveProperty(['public', 'users'], ['id', 'email'])
  })

  it('keeps every schema reachable under its own prefix', () => {
    const schema = buildSqlSchema([PUBLIC, graph('billing', { invoices: ['id'] })], 'public')

    expect(schema).toHaveProperty(['billing', 'invoices'], ['id'])
    expect(schema).toHaveProperty(['public', 'users'])
  })

  it('gives the bare name to the default schema when two collide', () => {
    const other = graph('archive', { users: ['old_id'] })
    const schema = buildSqlSchema([other, PUBLIC], 'public')

    // `archive` came first in the list, but `public` is the default.
    expect(schema).toHaveProperty('users', ['id', 'email'])
    expect(schema).toHaveProperty(['archive', 'users'], ['old_id'])
  })

  it('handles a schema with no tables', () => {
    expect(buildSqlSchema([graph('empty', {})], 'empty')).toEqual({ empty: {} })
  })

  it('handles no schemas at all', () => {
    expect(buildSqlSchema([])).toEqual({})
  })
})

describe('the table list', () => {
  it('leaves the default schema unqualified and prefixes the rest', () => {
    const graphs = [graph('public', { users: [] }), graph('billing', { invoices: [] })]

    expect(tableNames(graphs, 'public')).toEqual(['users', 'billing.invoices'])
  })

  it('leaves everything bare when there is only one schema', () => {
    // D1 and single-schema Postgres, where a prefix is pure noise.
    expect(tableNames([graph('main', { users: [] })])).toEqual(['users'])
  })
})
