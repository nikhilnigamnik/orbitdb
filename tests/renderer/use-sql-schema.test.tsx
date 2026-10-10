// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { schemasToLoad, useSqlSchema } from '@renderer/features/query/hooks/use-sql-schema'
import type { SchemaGraph } from '@renderer/types'

afterEach(cleanup)

// A Supabase database as Postgres lists it - alphabetically, with `public`
// well past the five-schema cap. Loading the first five never reached it, so
// a bare `users` completed to auth.users.
const SUPABASE = [
  'auth',
  'extensions',
  'graphql',
  'graphql_public',
  'net',
  'pgsodium',
  'public',
  'realtime',
  'storage',
  'vault'
]

function graph(schema: string, columns: string[]): SchemaGraph {
  return {
    schema,
    tables: [
      {
        schema,
        name: 'users',
        columns: columns.map((name) => ({
          name,
          dataType: 'text',
          udtName: 'text',
          isNullable: true,
          isPrimaryKey: false,
          enumValues: null
        }))
      }
    ],
    edges: []
  }
}

const listSchemas = vi.fn()
const schemaGraph = vi.fn()

beforeEach(() => {
  listSchemas
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve({ success: true, data: SUPABASE.map((name) => ({ name })) })
    )
  schemaGraph.mockReset().mockImplementation((_id: string, schema: string) =>
    Promise.resolve({
      success: true,
      data: graph(schema, schema === 'public' ? ['id', 'email'] : ['id', 'aud'])
    })
  )
  Object.assign(window, { api: { db: { listSchemas, schemaGraph } } })
})

describe('which schemas completion loads', () => {
  it('always includes the default, wherever the engine lists it', () => {
    expect(schemasToLoad(SUPABASE)).toEqual([
      'public',
      'auth',
      'extensions',
      'graphql',
      'graphql_public'
    ])
  })

  it('prefers the connected database on MySQL, where a schema is a database', () => {
    expect(schemasToLoad(['information_schema', 'app', 'mysql'], 'app')).toEqual([
      'app',
      'information_schema',
      'mysql'
    ])
  })

  it('loads nothing from an empty list', () => {
    expect(schemasToLoad([])).toEqual([])
  })
})

describe('useSqlSchema on a Supabase database', () => {
  it('loads public and resolves a bare table name to it', async () => {
    const { result } = renderHook(() => useSqlSchema('c1'))

    await waitFor(() => expect(result.current).toBeDefined())
    expect(schemaGraph).toHaveBeenCalledWith('c1', 'public')
    expect(schemaGraph).toHaveBeenCalledTimes(5)
    expect(result.current?.public).toEqual({ users: ['id', 'email'] })
    expect(result.current?.auth).toEqual({ users: ['id', 'aud'] })
    // The bare name is what a query actually writes, and it has to be public's.
    expect(result.current?.users).toEqual(['id', 'email'])
  })
})
