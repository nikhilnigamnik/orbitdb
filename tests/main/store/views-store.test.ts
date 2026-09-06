import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedTableView, TableViewState } from '../../../src/shared/types'

const stub = vi.hoisted(() => ({ userDataDir: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`unexpected getPath(${name})`)
      return stub.userDataDir
    }
  }
}))

type Store = typeof import('../../../src/main/store/views-store')

/** Re-import so the module's in-memory cache starts empty, as on app launch. */
async function freshStore(): Promise<Store> {
  vi.resetModules()
  return import('../../../src/main/store/views-store')
}

function filePath(): string {
  return join(stub.userDataDir, 'views.json')
}

function fileOnDisk(): { version: number; views: SavedTableView[] } {
  return JSON.parse(readFileSync(filePath(), 'utf8'))
}

const T1 = new Date('2026-08-10T10:00:00Z')
const T2 = new Date('2026-08-10T11:00:00Z')

const users = { connectionId: 'c1', schema: 'public', table: 'users' }
const orders = { connectionId: 'c1', schema: 'public', table: 'orders' }

function state(overrides: Partial<TableViewState> = {}): TableViewState {
  return {
    filters: [{ column: 'status', operator: '=', value: 'active' }],
    filterJoin: 'and',
    orderBy: 'created_at',
    orderDir: 'desc',
    hiddenColumns: [],
    frozenColumns: [],
    pageSize: 50,
    ...overrides
  }
}

let store: Store

beforeEach(async () => {
  stub.userDataDir = mkdtempSync(join(tmpdir(), 'orbitdb-views-'))
  store = await freshStore()
})

afterEach(() => {
  rmSync(stub.userDataDir, { recursive: true, force: true })
})

describe('saving', () => {
  it('keeps a view against its table, with the name trimmed', () => {
    const saved = store.saveTableView({ ...users, name: '  Active  ', view: state() }, T1)

    expect(saved.name).toBe('Active')
    expect(store.listTableViews(users)).toHaveLength(1)
    expect(fileOnDisk().views).toHaveLength(1)
  })

  it('refuses a name that is only whitespace', () => {
    expect(() => store.saveTableView({ ...users, name: '   ', view: state() })).toThrow(
      /needs a name/
    )
  })

  it('replaces a view of the same name rather than adding a second', () => {
    const first = store.saveTableView({ ...users, name: 'Active', view: state() }, T1)
    const again = store.saveTableView(
      { ...users, name: 'Active', view: state({ pageSize: 100 }) },
      T2
    )

    expect(again.id).toBe(first.id)
    expect(again.createdAt).toBe(T1.toISOString())
    expect(again.updatedAt).toBe(T2.toISOString())
    expect(store.listTableViews(users)).toHaveLength(1)
    expect(store.listTableViews(users)[0].view.pageSize).toBe(100)
  })

  it('treats a differently-cased name as the same view', () => {
    const first = store.saveTableView({ ...users, name: 'Active users', view: state() }, T1)
    const again = store.saveTableView({ ...users, name: 'active USERS', view: state() }, T2)

    expect(again.id).toBe(first.id)
    // The new spelling wins - it is what the user just typed.
    expect(again.name).toBe('active USERS')
  })

  it('keeps the same name on two different tables apart', () => {
    store.saveTableView({ ...users, name: 'Recent', view: state() }, T1)
    store.saveTableView({ ...orders, name: 'Recent', view: state() }, T2)

    expect(store.listTableViews(users)).toHaveLength(1)
    expect(store.listTableViews(orders)).toHaveLength(1)
  })
})

describe('listing', () => {
  it('is scoped to one table and ordered by name', () => {
    store.saveTableView({ ...users, name: 'Zebra', view: state() }, T1)
    store.saveTableView({ ...users, name: 'Alpha', view: state() }, T1)
    store.saveTableView({ ...orders, name: 'Mid', view: state() }, T1)

    expect(store.listTableViews(users).map((v) => v.name)).toEqual(['Alpha', 'Zebra'])
  })

  it('drops malformed entries rather than handing back something unreadable', async () => {
    writeFileSync(
      filePath(),
      JSON.stringify({
        version: 1,
        views: [
          { id: 'x', connectionId: 'c1', schema: 'public', table: 'users' },
          {
            id: 'y',
            connectionId: 'c1',
            schema: 'public',
            table: 'users',
            name: 'Fine',
            view: state(),
            createdAt: T1.toISOString(),
            updatedAt: T1.toISOString()
          }
        ]
      }),
      'utf8'
    )
    store = await freshStore()

    expect(store.listTableViews(users).map((v) => v.name)).toEqual(['Fine'])
  })
})

describe('updating', () => {
  it('renames without touching what the view holds', () => {
    const saved = store.saveTableView({ ...users, name: 'Active', view: state() }, T1)
    const renamed = store.updateTableView(saved.id, { name: 'Live' }, T2)

    expect(renamed.name).toBe('Live')
    expect(renamed.view).toEqual(saved.view)
  })

  it('overwrites the view without touching the name', () => {
    const saved = store.saveTableView({ ...users, name: 'Active', view: state() }, T1)
    const updated = store.updateTableView(saved.id, { view: state({ pageSize: 250 }) }, T2)

    expect(updated.name).toBe('Active')
    expect(updated.view.pageSize).toBe(250)
  })

  it('refuses a rename onto a name the table already uses', () => {
    store.saveTableView({ ...users, name: 'Active', view: state() }, T1)
    const other = store.saveTableView({ ...users, name: 'Archived', view: state() }, T1)

    // Not folded into the existing one: saving is how a view is replaced, and
    // renaming onto a name would silently destroy the view that held it.
    expect(() => store.updateTableView(other.id, { name: 'active' })).toThrow(/already has a view/)
  })

  it('allows a rename that only changes the casing of its own name', () => {
    const saved = store.saveTableView({ ...users, name: 'Active', view: state() }, T1)
    expect(store.updateTableView(saved.id, { name: 'ACTIVE' }, T2).name).toBe('ACTIVE')
  })
})

describe('deleting', () => {
  it('removes one view', () => {
    const saved = store.saveTableView({ ...users, name: 'Active', view: state() }, T1)
    store.deleteTableView(saved.id)

    expect(store.listTableViews(users)).toEqual([])
  })

  it('takes the views of a deleted connection with it, and leaves the others', () => {
    store.saveTableView({ ...users, name: 'Active', view: state() }, T1)
    store.saveTableView({ ...orders, name: 'Recent', view: state() }, T1)
    store.saveTableView(
      { connectionId: 'c2', schema: 'public', table: 'users', name: 'Kept', view: state() },
      T1
    )

    store.deleteViewsForConnection('c1')

    expect(store.listTableViews(users)).toEqual([])
    expect(store.listTableViews(orders)).toEqual([])
    expect(
      store.listTableViews({ connectionId: 'c2', schema: 'public', table: 'users' })
    ).toHaveLength(1)
  })
})
