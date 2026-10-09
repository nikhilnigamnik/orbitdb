import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionInput, SavedConnection } from '../../../src/shared/types'

const stub = vi.hoisted(() => ({
  userDataDir: '',
  /** Each disconnectPool call: the engine on record when it was made, and its release. */
  closes: [] as { engine: string | undefined; release: () => void }[],
  tested: [] as ConnectionInput[],
  /** Bound per test to the store instance the handlers share. */
  engineOf: (() => undefined) as (id: string) => string | undefined
}))

vi.mock('electron', () => ({
  app: { getPath: () => stub.userDataDir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) => Buffer.from(`sealed:${plain}`, 'utf8'),
    decryptString: (buf: Buffer) => buf.toString('utf8').slice('sealed:'.length)
  }
}))

// Stands in for the manager: it resolves the driver from the saved record at
// call time, exactly as the real one does, and holds the close open until the
// test releases it - the window in which `pool.end()` waits for queries.
vi.mock('../../../src/main/db/manager', () => ({
  disconnectPool: (id: string) =>
    new Promise<void>((resolve) => {
      stub.closes.push({ engine: stub.engineOf(id), release: resolve })
    }),
  testConnection: async (input: ConnectionInput) => {
    stub.tested.push(input)
    return { success: true }
  }
}))

type Handlers = typeof import('../../../src/main/ipc/connections')
type Store = typeof import('../../../src/main/store/connections-store')

const PG: ConnectionInput = {
  name: 'pg',
  engine: 'postgres',
  environment: 'dev',
  host: 'localhost',
  port: 5432,
  database: 'app',
  user: 'me',
  password: 's3cret',
  ssl: true,
  sslVerify: true
}

let handlers: Handlers
let store: Store

beforeEach(async () => {
  stub.userDataDir = mkdtempSync(join(tmpdir(), 'orbitdb-ipc-'))
  stub.closes = []
  stub.tested = []
  vi.resetModules()
  handlers = await import('../../../src/main/ipc/connections')
  store = await import('../../../src/main/store/connections-store')
  stub.engineOf = (id) => store.getConnection(id)?.engine
})

afterEach(() => {
  rmSync(stub.userDataDir, { recursive: true, force: true })
})

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('secrets and the renderer', () => {
  it('returns no secret from list, create or update', async () => {
    const created = handlers.createConnectionForRenderer(PG)
    const updatingPromise = handlers.updateConnectionForRenderer(created.id, {
      ...PG,
      name: 'renamed'
    })
    stub.closes.forEach((c) => c.release())
    const updated = await updatingPromise
    const listed = handlers.listConnectionsForRenderer()

    for (const view of [created, updated, ...listed]) {
      expect(view.password).toBe('')
      expect(view.hasPassword).toBe(true)
    }
    expect(store.requireConnection(created.id).password).toBe('s3cret')
  })

  it('keeps sslVerify, the field the drivers read', () => {
    const created = handlers.createConnectionForRenderer(PG)
    expect(store.requireConnection(created.id).sslVerify).toBe(true)
  })

  it('refuses a malformed input before it reaches the store', () => {
    expect(() => handlers.createConnectionForRenderer({ ...PG, port: 'x' })).toThrow(
      /Invalid connection: port/
    )
    expect(store.listConnections()).toEqual([])
  })
})

describe('testing a saved connection', () => {
  it('fills the password the form never held', async () => {
    const created = handlers.createConnectionForRenderer(PG)
    const view: SavedConnection = handlers.listConnectionsForRenderer()[0]

    await handlers.testConnectionForRenderer(view, created.id)

    expect(stub.tested[0].password).toBe('s3cret')
    expect(stub.tested[0]).not.toHaveProperty('hasPassword')
  })

  it('tests exactly what was typed when there is no id', async () => {
    await handlers.testConnectionForRenderer({ ...PG, password: 'typed' })
    expect(stub.tested[0].password).toBe('typed')
  })
})

describe('editing while the pool is closing', () => {
  it('has saved the new config before the close finishes', async () => {
    const created = handlers.createConnectionForRenderer(PG)
    const editing = handlers.updateConnectionForRenderer(created.id, { ...PG, port: 6543 })

    // The close is still in progress; a query arriving now would rebuild the
    // pool from whatever is saved - which must already be the edit.
    await settle()
    expect(stub.closes).toHaveLength(1)
    expect(store.requireConnection(created.id).port).toBe(6543)

    stub.closes[0].release()
    await expect(editing).resolves.toMatchObject({ port: 6543 })
  })

  it('closes the old engine pool when the engine changes', async () => {
    const created = handlers.createConnectionForRenderer(PG)
    const editing = handlers.updateConnectionForRenderer(created.id, {
      ...PG,
      engine: 'mysql',
      port: 3306
    })
    stub.closes[0].release()
    await editing

    expect(stub.closes[0].engine).toBe('postgres')
  })

  it('still closes the pool of a deleted connection', async () => {
    const created = handlers.createConnectionForRenderer(PG)
    const deleting = handlers.deleteConnectionForRenderer(created.id)

    await settle()
    expect(store.getConnection(created.id)).toBeUndefined()
    expect(stub.closes[0].engine).toBe('postgres')

    stub.closes[0].release()
    await deleting
  })
})
