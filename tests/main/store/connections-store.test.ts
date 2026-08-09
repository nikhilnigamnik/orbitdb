import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionInput, SavedConnection } from '../../../src/shared/types'

// Mutable stand-in for Electron's per-OS credential vault. `sealed:` marks a
// value as having gone through it, so a test can assert on what hit the disk.
const stub = vi.hoisted(() => ({
  userDataDir: '',
  isEncryptionAvailable: true,
  failDecrypt: false
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`unexpected getPath(${name})`)
      return stub.userDataDir
    }
  },
  safeStorage: {
    isEncryptionAvailable: () => stub.isEncryptionAvailable,
    encryptString: (plain: string) => Buffer.from(`sealed:${plain}`, 'utf8'),
    decryptString: (buf: Buffer) => {
      if (stub.failDecrypt) throw new Error('sealed under a different keychain')
      return buf.toString('utf8').slice('sealed:'.length)
    }
  }
}))

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
  ssl: false
}

const D1: ConnectionInput = {
  name: 'd1',
  engine: 'd1',
  environment: 'prod',
  host: '',
  port: 0,
  database: '',
  user: '',
  password: '',
  ssl: false,
  accountId: 'acc',
  databaseId: 'dbid',
  apiToken: 'tok3n'
}

function sealed(plain: string): string {
  return `enc:v1:${Buffer.from(`sealed:${plain}`, 'utf8').toString('base64')}`
}

/** Re-import so the module's in-memory cache starts empty, as on app launch. */
async function freshStore(): Promise<Store> {
  vi.resetModules()
  return import('../../../src/main/store/connections-store')
}

function onDisk(): SavedConnection[] {
  const raw = readFileSync(join(stub.userDataDir, 'connections.json'), 'utf8')
  return JSON.parse(raw).connections as SavedConnection[]
}

let store: Store

beforeEach(async () => {
  stub.userDataDir = mkdtempSync(join(tmpdir(), 'orbitdb-store-'))
  stub.isEncryptionAvailable = true
  stub.failDecrypt = false
  store = await freshStore()
})

afterEach(() => {
  rmSync(stub.userDataDir, { recursive: true, force: true })
})

describe('encryption at rest', () => {
  it('seals passwords and API tokens, and reads them back', () => {
    const pg = store.createConnection(PG)
    store.createConnection(D1)

    expect(onDisk()[0].password).toBe(sealed('s3cret'))
    expect(onDisk()[1].apiToken).toBe(sealed('tok3n'))
    expect(store.getConnection(pg.id)?.password).toBe('s3cret')
    expect(store.requireConnection(pg.id).password).toBe('s3cret')
  })

  it('falls back to plaintext when the OS has no keychain', async () => {
    stub.isEncryptionAvailable = false
    store = await freshStore()

    const pg = store.createConnection(PG)
    expect(onDisk()[0].password).toBe('s3cret')
    expect(store.getConnection(pg.id)?.password).toBe('s3cret')
  })

  it('migrates a plaintext file to sealed on first read', async () => {
    stub.isEncryptionAvailable = false
    store = await freshStore()
    const pg = store.createConnection(PG)
    expect(onDisk()[0].password).toBe('s3cret')

    stub.isEncryptionAvailable = true
    store = await freshStore()
    expect(store.getConnection(pg.id)?.password).toBe('s3cret')
    expect(onDisk()[0].password).toBe(sealed('s3cret'))
  })

  it('hands out copies, so a caller cannot corrupt the cache', () => {
    const pg = store.createConnection(PG)
    const copy = store.getConnection(pg.id)!
    copy.password = 'mutated'
    expect(store.getConnection(pg.id)?.password).toBe('s3cret')
  })
})

describe('when a stored secret cannot be decrypted', () => {
  let pgId: string

  beforeEach(async () => {
    pgId = store.createConnection(PG).id
    store.createConnection(D1)
    stub.failDecrypt = true
    store = await freshStore()
  })

  it('reads the secret as empty rather than garbage', () => {
    expect(store.getConnection(pgId)?.password).toBe('')
  })

  it('refuses to open the connection, naming the real cause', () => {
    expect(() => store.requireConnection(pgId)).toThrow(/could not be decrypted/)
  })

  it('keeps the untouched ciphertext when another connection is added', () => {
    const before = onDisk()
    store.createConnection({ ...PG, name: 'another', password: 'fresh' })

    const after = onDisk()
    expect(after).toHaveLength(3)
    expect(after[0].password).toBe(before[0].password)
    expect(after[1].apiToken).toBe(before[1].apiToken)
  })

  it('keeps the ciphertext when the same connection is edited without a new secret', () => {
    const before = onDisk()
    store.updateConnection(pgId, { ...PG, name: 'renamed', password: '' })

    expect(onDisk()[0].name).toBe('renamed')
    expect(onDisk()[0].password).toBe(before[0].password)
  })

  it('keeps the ciphertext when an unrelated connection is deleted', () => {
    const before = onDisk()
    const other = store.createConnection({ ...PG, name: 'temp', password: 'x' })
    store.deleteConnection(other.id)

    expect(onDisk()[0].password).toBe(before[0].password)
  })

  it('replaces the secret once the user re-enters it', async () => {
    store.updateConnection(pgId, { ...PG, password: 'renewed' })
    expect(onDisk()[0].password).toBe(sealed('renewed'))

    stub.failDecrypt = false
    store = await freshStore()
    expect(store.requireConnection(pgId).password).toBe('renewed')
  })
})

describe('crud', () => {
  it('lists, updates and deletes', () => {
    const pg = store.createConnection(PG)
    store.createConnection(D1)
    expect(store.listConnections().map((c) => c.name)).toEqual(['pg', 'd1'])

    const updated = store.updateConnection(pg.id, { ...PG, name: 'renamed', port: 5433 })
    expect(updated.name).toBe('renamed')
    expect(updated.port).toBe(5433)
    expect(updated.createdAt).toBe(pg.createdAt)

    store.deleteConnection(pg.id)
    expect(store.listConnections().map((c) => c.name)).toEqual(['d1'])
    expect(store.getConnection(pg.id)).toBeUndefined()
  })

  it('throws on an unknown connection', () => {
    expect(() => store.updateConnection('nope', PG)).toThrow(/not found/)
    expect(() => store.requireConnection('nope')).toThrow(/not saved/)
  })

  it('survives a missing or corrupt file', async () => {
    rmSync(join(stub.userDataDir, 'connections.json'), { force: true })
    store = await freshStore()
    expect(store.listConnections()).toEqual([])
  })
})
