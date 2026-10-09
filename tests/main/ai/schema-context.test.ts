import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SchemaGraph, SchemaGraphColumn } from '../../../src/shared/types'

const stub = vi.hoisted(() => ({
  schemas: [{ name: 'public' }] as { name: string }[],
  graph: null as SchemaGraph | null
}))

vi.mock('../../../src/main/db/manager', () => ({
  listSchemas: async () => stub.schemas,
  getSchemaGraph: async () => stub.graph
}))

const { buildSchemaContext } = await import('../../../src/main/ai/context')

function col(overrides: Partial<SchemaGraphColumn> = {}): SchemaGraphColumn {
  return {
    name: 'id',
    dataType: 'uuid',
    udtName: 'uuid',
    isNullable: false,
    isPrimaryKey: true,
    enumValues: null,
    ...overrides
  }
}

function graph(columns: SchemaGraphColumn[]): SchemaGraph {
  return {
    schema: 'public',
    tables: [{ schema: 'public', name: 'audit_logs', columns }],
    edges: []
  }
}

const ACTION = col({
  name: 'action',
  dataType: 'USER-DEFINED',
  udtName: 'audit_action',
  isPrimaryKey: false,
  enumValues: ['Update', 'Login', 'Status Change']
})

beforeEach(() => {
  stub.schemas = [{ name: 'public' }]
  stub.graph = null
})

describe('the whole-database map given to free-form SQL', () => {
  it('names an enum type and lists its values', async () => {
    // Postgres reports data_type as "USER-DEFINED", which told the model nothing:
    // generated SQL guessed `action = 'update'` and the query failed.
    stub.graph = graph([col(), ACTION])

    const text = await buildSchemaContext('c1', 'postgres')

    expect(text).toContain('action audit_action')
    expect(text).toContain("values: 'Update' | 'Login' | 'Status Change'")
    expect(text).not.toContain('USER-DEFINED')
  })

  it('keeps the flags it already carried', async () => {
    stub.graph = graph([col(), ACTION])

    const text = await buildSchemaContext('c1', 'postgres')

    expect(text).toContain('public.audit_logs(')
    expect(text).toContain('id uuid PK NOT NULL')
    expect(text).toContain('action audit_action NOT NULL values:')
  })

  it('renders an ordinary column exactly as before', async () => {
    const name = col({
      name: 'user_name',
      dataType: 'text',
      udtName: 'text',
      isPrimaryKey: false,
      isNullable: true
    })
    stub.graph = graph([name])

    expect(await buildSchemaContext('c1', 'postgres')).toContain('user_name text')
  })

  it('lists a MySQL enum once rather than twice', async () => {
    // MySQL puts the members in dataType too, so naming it by udtName is what
    // stops them being printed a second time.
    stub.graph = graph([
      col({
        name: 'action',
        dataType: "enum('Update','Login')",
        udtName: 'enum',
        isPrimaryKey: false,
        enumValues: ['Update', 'Login']
      })
    ])

    const text = await buildSchemaContext('c1', 'mysql')

    expect(text).toContain("action enum NOT NULL values: 'Update' | 'Login'")
    expect(text).not.toContain("enum('Update','Login')")
  })

  it('says nothing extra for an engine without enums', async () => {
    // D1/SQLite reports enumValues: null for every column.
    stub.graph = graph([col({ dataType: 'TEXT', udtName: 'text', enumValues: null })])

    expect(await buildSchemaContext('c1', 'd1')).not.toContain('values:')
  })

  it('skips system schemas', async () => {
    stub.schemas = [{ name: 'pg_catalog' }, { name: 'information_schema' }]
    stub.graph = graph([ACTION])

    expect(await buildSchemaContext('c1', 'postgres')).toBe('')
  })
})

describe('a database with more tables than the model is shown', () => {
  it('picks the ones the request is about, drops foreign keys to tables left out, and says so', async () => {
    const filler = Array.from({ length: 80 }, (_, i) => ({
      schema: 'public',
      name: `a_${String(i).padStart(3, '0')}`,
      columns: [col()]
    }))
    stub.graph = {
      schema: 'public',
      tables: [...filler, { schema: 'public', name: 'users', columns: [col()] }],
      edges: [
        {
          name: 'fk1',
          from: { schema: 'public', table: 'a_079', columns: ['user_id'] },
          to: { schema: 'public', table: 'users', columns: ['id'] }
        }
      ]
    }

    const text = await buildSchemaContext('c1', 'postgres', 'how many users signed up')

    expect(text).toContain('public.users(')
    expect(text).toContain('most relevant to the request')
    // a_079 joins users, so it is pulled in with it, edge and all.
    expect(text).toContain('public.a_079(')
    expect(text).toContain('FK: a_079(user_id) -> users(id)')
    expect(text.split('\n').filter((l) => l.startsWith('public.'))).toHaveLength(60)
  })
})
