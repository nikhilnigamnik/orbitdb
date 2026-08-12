import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedQuery } from '../../../src/shared/types'

const stub = vi.hoisted(() => ({ userDataDir: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`unexpected getPath(${name})`)
      return stub.userDataDir
    }
  }
}))

type Store = typeof import('../../../src/main/store/queries-store')

/** Re-import so the module's in-memory cache starts empty, as on app launch. */
async function freshStore(): Promise<Store> {
  vi.resetModules()
  return import('../../../src/main/store/queries-store')
}

function filePath(): string {
  return join(stub.userDataDir, 'queries.json')
}

function fileOnDisk(): { version: number; queries: SavedQuery[] } {
  return JSON.parse(readFileSync(filePath(), 'utf8'))
}

// Fixed points in time - ordering is asserted, so it must not depend on when the
// suite runs.
const T1 = new Date('2026-08-10T10:00:00Z')
const T2 = new Date('2026-08-10T11:00:00Z')
const T3 = new Date('2026-08-10T12:00:00Z')

let store: Store

beforeEach(async () => {
  stub.userDataDir = mkdtempSync(join(tmpdir(), 'orbitdb-queries-'))
  store = await freshStore()
})

afterEach(() => {
  rmSync(stub.userDataDir, { recursive: true, force: true })
})

function run(sql: string, at = T1, connectionId = 'c1'): SavedQuery {
  return store.recordQueryRun({ connectionId, sql, durationMs: 5, success: true }, at)
}

describe('recording a run', () => {
  it('keeps it, trimmed, against its connection', () => {
    run('  select 1  ')

    const [entry] = store.listQueries('c1')
    expect(entry.sql).toBe('select 1')
    expect(entry.isStarred).toBe(false)
    expect(entry.name).toBeNull()
  })

  it('scopes the list to one connection', () => {
    run('select 1', T1, 'c1')
    run('select 2', T2, 'c2')

    expect(store.listQueries('c1').map((q) => q.sql)).toEqual(['select 1'])
    expect(store.listQueries('c2').map((q) => q.sql)).toEqual(['select 2'])
  })

  it('folds a repeat into the existing entry rather than duplicating it', () => {
    // Iterating on one query would otherwise fill the history with near-identical
    // rows and push the earlier ones off the cap.
    run('select 1', T1)
    run('select 1', T2)

    const list = store.listQueries('c1')
    expect(list).toHaveLength(1)
    expect(list[0].ranAt).toBe(T2.toISOString())
  })

  it('leaves a starred copy alone and starts a fresh history entry', () => {
    const saved = run('select 1', T1)
    store.updateQuery(saved.id, { isStarred: true, name: 'The one' })

    run('select 1', T2)

    const list = store.listQueries('c1')
    expect(list).toHaveLength(2)
    // The kept copy still reads as the run the user kept.
    const kept = list.find((q) => q.isStarred)!
    expect(kept.name).toBe('The one')
    expect(kept.ranAt).toBe(T1.toISOString())
  })

  it('returns newest first', () => {
    run('select 1', T1)
    run('select 2', T2)
    run('select 3', T3)

    expect(store.listQueries('c1').map((q) => q.sql)).toEqual(['select 3', 'select 2', 'select 1'])
  })
})

describe('the history cap', () => {
  it('drops the oldest unstarred entries past it', () => {
    const overCap = store.MAX_HISTORY_PER_CONNECTION + 5
    for (let i = 0; i < overCap; i++) {
      run(`select ${i}`, new Date(T1.getTime() + i * 1000))
    }

    const list = store.listQueries('c1')
    expect(list).toHaveLength(store.MAX_HISTORY_PER_CONNECTION)
    expect(list[0].sql).toBe(`select ${overCap - 1}`)
  })

  it('exempts starred entries, however old', () => {
    const first = run('select keep', T1)
    store.updateQuery(first.id, { isStarred: true })
    for (let i = 0; i < store.MAX_HISTORY_PER_CONNECTION + 5; i++) {
      run(`select ${i}`, new Date(T2.getTime() + i * 1000))
    }

    expect(store.listQueries('c1').some((q) => q.sql === 'select keep')).toBe(true)
  })

  it('counts per connection, so a busy one cannot evict a quiet one', () => {
    run('select quiet', T1, 'c2')
    for (let i = 0; i < store.MAX_HISTORY_PER_CONNECTION + 5; i++) {
      run(`select ${i}`, new Date(T2.getTime() + i * 1000), 'c1')
    }

    expect(store.listQueries('c2')).toHaveLength(1)
  })
})

describe('updating', () => {
  it('trims a name, and treats blank as no name', () => {
    const entry = run('select 1')
    store.updateQuery(entry.id, { isStarred: true, name: '  Daily count  ' })
    expect(store.listQueries('c1')[0].name).toBe('Daily count')

    store.updateQuery(entry.id, { name: '   ' })
    expect(store.listQueries('c1')[0].name).toBeNull()
  })

  it('drops the name when a query is unstarred', () => {
    // A named entry that the history cap can still delete is a promise the store
    // cannot keep.
    const entry = run('select 1')
    store.updateQuery(entry.id, { isStarred: true, name: 'Keeper' })

    const unstarred = store.updateQuery(entry.id, { isStarred: false })

    expect(unstarred.name).toBeNull()
  })

  it('refuses an id it does not have', () => {
    expect(() => store.updateQuery('nope', { isStarred: true })).toThrow(/not found/)
  })
})

describe('clearing history', () => {
  it('keeps the starred ones and leaves other connections untouched', () => {
    const keeper = run('select keep', T1)
    store.updateQuery(keeper.id, { isStarred: true })
    run('select drop', T2)
    run('select other', T2, 'c2')

    store.clearQueryHistory('c1')

    expect(store.listQueries('c1').map((q) => q.sql)).toEqual(['select keep'])
    expect(store.listQueries('c2')).toHaveLength(1)
  })
})

describe('deleting', () => {
  it('removes just that entry', () => {
    const first = run('select 1', T1)
    run('select 2', T2)

    store.deleteQuery(first.id)

    expect(store.listQueries('c1').map((q) => q.sql)).toEqual(['select 2'])
  })
})

describe('a damaged file', () => {
  it('starts empty rather than failing the launch', async () => {
    writeFileSync(filePath(), '{ not json', 'utf8')
    store = await freshStore()

    expect(store.listQueries('c1')).toEqual([])
  })

  it('drops entries missing the fields every reader assumes', async () => {
    // One malformed row would otherwise crash every render that reads `sql`.
    writeFileSync(
      filePath(),
      JSON.stringify({
        version: 1,
        queries: [
          { id: 'a', connectionId: 'c1', sql: 'select 1', ranAt: T1.toISOString() },
          { id: 'b', connectionId: 'c1' }
        ]
      }),
      'utf8'
    )
    store = await freshStore()

    expect(store.listQueries('c1').map((q) => q.id)).toEqual(['a'])
  })
})

describe('what reaches the disk', () => {
  it('is plain JSON - a query names tables, not secrets', () => {
    run('select * from users')

    expect(fileOnDisk().queries[0].sql).toBe('select * from users')
  })
})
