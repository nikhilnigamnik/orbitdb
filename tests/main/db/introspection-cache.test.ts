import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SchemaGraph, TableDetails } from '../../../src/shared/types'

type Cache = typeof import('../../../src/main/db/introspection-cache')

let cache: Cache

beforeEach(async () => {
  vi.resetModules()
  cache = await import('../../../src/main/db/introspection-cache')
})

function details(name: string): TableDetails {
  return {
    schema: 'public',
    name,
    type: 'table',
    columns: [],
    primaryKey: [],
    indexes: [],
    foreignKeys: [],
    estimatedRows: null
  }
}

function graph(schema: string): SchemaGraph {
  return { schema, tables: [], edges: [] }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
} {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('table details', () => {
  it('shares one introspection between two first callers', async () => {
    // On D1 each introspection is several HTTPS calls, and the grid, the
    // structure tab and the AI context all ask at once when a table opens.
    const pending = deferred<TableDetails>()
    const load = vi.fn(() => pending.promise)

    const first = cache.cachedTableDetails('c1', 'public', 'users', load)
    const second = cache.cachedTableDetails('c1', 'public', 'users', load)
    pending.resolve(details('users'))

    expect(await first).toBe(await second)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('drops a failed load so the next call retries', async () => {
    const load = vi
      .fn<() => Promise<TableDetails>>()
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(details('users'))

    await expect(cache.cachedTableDetails('c1', 'public', 'users', load)).rejects.toThrow(/reset/)
    await expect(cache.cachedTableDetails('c1', 'public', 'users', load)).resolves.toEqual(
      details('users')
    )
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('keys by table, not just connection', async () => {
    const load = vi.fn(async () => details('x'))
    await cache.cachedTableDetails('c1', 'public', 'a', load)
    await cache.cachedTableDetails('c1', 'public', 'b', load)
    await cache.cachedTableDetails('c1', 'other', 'a', load)
    expect(load).toHaveBeenCalledTimes(3)
  })
})

describe('invalidation', () => {
  it('drops table details and schema graphs together, for that connection only', async () => {
    const loadTable = vi.fn(async () => details('users'))
    const loadGraph = vi.fn(async () => graph('public'))
    await cache.cachedTableDetails('c1', 'public', 'users', loadTable)
    await cache.cachedSchemaGraph('c1', 'public', loadGraph)
    await cache.cachedSchemaGraph('c2', 'public', loadGraph)

    cache.invalidateIntrospection('c1')
    await cache.cachedTableDetails('c1', 'public', 'users', loadTable)
    await cache.cachedSchemaGraph('c1', 'public', loadGraph)
    await cache.cachedSchemaGraph('c2', 'public', loadGraph)

    expect(loadTable).toHaveBeenCalledTimes(2)
    expect(loadGraph).toHaveBeenCalledTimes(3)
  })

  it('does not let one id prefix another', async () => {
    const load = vi.fn(async () => graph('public'))
    await cache.cachedSchemaGraph('c10', 'public', load)

    cache.invalidateIntrospection('c1')
    await cache.cachedSchemaGraph('c10', 'public', load)

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('never writes back a load that was in flight when the schema changed', async () => {
    const stale = deferred<SchemaGraph>()
    const load = vi
      .fn<() => Promise<SchemaGraph>>()
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(graph('fresh'))

    const before = cache.cachedSchemaGraph('c1', 'public', load)
    cache.invalidateIntrospection('c1')
    stale.resolve(graph('stale'))
    await before

    expect((await cache.cachedSchemaGraph('c1', 'public', load)).schema).toBe('fresh')
  })
})
