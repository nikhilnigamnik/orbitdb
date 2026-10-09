import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import {
  canReuseStoredSecrets,
  type ConnectionInput,
  type SavedConnection
} from '../../shared/types'
import { decryptString, encryptString, isEncrypted, isEncryptionAvailable } from './crypto'
import { quarantineJsonFile, readJsonFile, writeJsonFileAtomic } from './json-file'

const FILE_NAME = 'connections.json'
const SENSITIVE_FIELDS = ['password', 'apiToken'] as const
type SensitiveField = (typeof SENSITIVE_FIELDS)[number]

interface StoreShape {
  version: 1
  connections: SavedConnection[]
}

// getConnection runs on every database IPC call, and each read parses the file
// and unseals every secret - a synchronous keychain round-trip per secret. Both
// the on-disk bytes and the decrypted view are cached until we write.
let rawCache: StoreShape | null = null
let decryptedCache: StoreShape | null = null

/** connectionId -> secrets whose ciphertext could not be unsealed on this host. */
const undecryptable = new Map<string, Set<SensitiveField>>()

function storePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, FILE_NAME)
}

function encryptForDisk(conn: SavedConnection): SavedConnection {
  const out: SavedConnection = { ...conn }
  for (const field of SENSITIVE_FIELDS) {
    const value = out[field]
    if (typeof value === 'string' && value.length > 0) {
      out[field] = encryptString(value)
    }
  }
  return out
}

function decryptFromDisk(conn: SavedConnection): SavedConnection {
  const out: SavedConnection = { ...conn }
  const failed = new Set<SensitiveField>()
  for (const field of SENSITIVE_FIELDS) {
    const value = out[field]
    if (typeof value !== 'string' || value.length === 0) continue
    const plain = decryptString(value)
    if (plain === null) {
      failed.add(field)
      out[field] = ''
    } else {
      out[field] = plain
    }
  }
  if (failed.size > 0) {
    undecryptable.set(conn.id, failed)
    console.error(
      `[connections-store] cannot decrypt ${[...failed].join(', ')} for connection ` +
        `"${conn.name}" - the stored value is kept on disk untouched.`
    )
  } else {
    undecryptable.delete(conn.id)
  }
  return out
}

function hasPlaintextSecrets(conn: SavedConnection): boolean {
  return SENSITIVE_FIELDS.some((field) => {
    const value = conn[field]
    return typeof value === 'string' && value.length > 0 && !isEncrypted(value)
  })
}

function parseFile(): StoreShape {
  const path = storePath()
  const parsed = readJsonFile(path) as StoreShape | undefined
  if (parsed === undefined) return { version: 1, connections: [] }
  if (!parsed || !Array.isArray(parsed.connections)) {
    quarantineJsonFile(path, 'no connections list')
    return { version: 1, connections: [] }
  }
  return {
    ...parsed,
    connections: parsed.connections.map((c) => ({
      ...c,
      engine: c.engine ?? 'postgres',
      environment: c.environment ?? 'dev'
    }))
  }
}

function readRaw(): StoreShape {
  if (rawCache) return rawCache
  rawCache = parseFile()
  return rawCache
}

function read(): StoreShape {
  if (decryptedCache) return decryptedCache

  let raw = readRaw()
  if (isEncryptionAvailable() && raw.connections.some(hasPlaintextSecrets)) {
    console.info('[connections-store] migrating plaintext credentials to encrypted-at-rest')
    raw = { ...raw, connections: raw.connections.map(encryptForDisk) }
    writeRaw(raw)
  }

  decryptedCache = { ...raw, connections: raw.connections.map(decryptFromDisk) }
  return decryptedCache
}

function writeRaw(state: StoreShape): void {
  writeJsonFileAtomic(storePath(), state, 2)
  rawCache = state
  decryptedCache = null
}

function write(state: StoreShape): void {
  const onDisk = new Map(readRaw().connections.map((c) => [c.id, c]))
  const connections = state.connections.map((conn) => {
    const failed = undecryptable.get(conn.id)
    if (!failed?.size) return encryptForDisk(conn)
    // A secret we could not unseal reads back as '' - writing that would destroy
    // it. Keep the untouched ciphertext unless the user typed a replacement.
    const stored = onDisk.get(conn.id)
    const merged: SavedConnection = { ...conn }
    for (const field of failed) {
      const ciphertext = stored?.[field]
      if (!merged[field] && ciphertext) merged[field] = ciphertext
    }
    return encryptForDisk(merged)
  })
  writeRaw({ ...state, connections })
}

function clone(conn: SavedConnection): SavedConnection {
  return { ...conn }
}

/**
 * The renderer hands back whatever it was given, so a view flag or an id must
 * not ride along into the stored record and go stale there.
 */
function withoutViewFields(input: ConnectionInput): ConnectionInput {
  const out: ConnectionInput & Partial<SavedConnection> = { ...input }
  delete out.id
  delete out.createdAt
  delete out.updatedAt
  delete out.hasPassword
  delete out.hasApiToken
  return out
}

function unreadableError(name: string, failed: Iterable<SensitiveField>): Error {
  return new Error(
    `Saved ${[...failed].join(' and ')} for "${name}" could not be decrypted on this ` +
      `machine. Open the connection and re-enter it.`
  )
}

export function listConnections(): SavedConnection[] {
  return read().connections.map(clone)
}

/**
 * What the renderer is allowed to see: every secret blanked, and a flag saying
 * whether one is stored. The flag reads the disk, so a secret that exists but
 * cannot be unsealed still shows as saved - re-entering it is how it recovers.
 */
export function toConnectionView(conn: SavedConnection): SavedConnection {
  const stored = readRaw().connections.find((c) => c.id === conn.id) ?? conn
  return {
    ...conn,
    password: '',
    apiToken: '',
    hasPassword: Boolean(stored.password),
    hasApiToken: Boolean(stored.apiToken)
  }
}

export function listConnectionViews(): SavedConnection[] {
  return read().connections.map(toConnectionView)
}

export function getConnection(id: string): SavedConnection | undefined {
  const found = read().connections.find((c) => c.id === id)
  return found ? clone(found) : undefined
}

/**
 * Resolve a connection for driver use, refusing to open one whose credentials
 * could not be decrypted - otherwise the engine reports a bare "authentication
 * failed" and the real cause stays hidden.
 */
export function requireConnection(id: string): SavedConnection {
  const found = read().connections.find((c) => c.id === id)
  if (!found) throw new Error(`Connection ${id} is not saved`)
  const failed = undecryptable.get(id)
  if (failed?.size) throw unreadableError(found.name, failed)
  return clone(found)
}

/**
 * Fill the secrets a form left blank from the saved connection, so a connection
 * can be tested without its password ever having been sent to the renderer.
 * An unknown id fills nothing: the input is tested as typed.
 */
export function fillStoredSecrets(input: ConnectionInput, id: string): ConnectionInput {
  const out = withoutViewFields(input)
  const stored = read().connections.find((c) => c.id === id)
  if (!stored || !canReuseStoredSecrets(stored, out)) return out
  const failed = undecryptable.get(id)
  for (const field of SENSITIVE_FIELDS) {
    if (out[field]) continue
    if (failed?.has(field)) throw unreadableError(stored.name, [field])
    const kept = stored[field]
    if (kept) out[field] = kept
  }
  return out
}

export function createConnection(input: ConnectionInput): SavedConnection {
  const state = read()
  const now = new Date().toISOString()
  const next: SavedConnection = {
    ...withoutViewFields(input),
    id: randomUUID(),
    createdAt: now,
    updatedAt: now
  }
  write({ ...state, connections: [...state.connections, next] })
  return clone(next)
}

/**
 * An empty secret means "unchanged": the renderer never holds the stored one,
 * so it cannot send it back. A secret that could not be unsealed reads as ''
 * here too, and write() then keeps its ciphertext rather than blanking it.
 */
export function updateConnection(id: string, input: ConnectionInput): SavedConnection {
  const state = read()
  const idx = state.connections.findIndex((c) => c.id === id)
  if (idx === -1) throw new Error(`Connection ${id} not found`)
  const previous = state.connections[idx]
  const updated: SavedConnection = {
    ...previous,
    ...withoutViewFields(input),
    id,
    updatedAt: new Date().toISOString()
  }
  // A blank secret keeps the stored one only while the connection still points
  // at the same server; otherwise it is dropped and has to be re-entered.
  const canKeep = canReuseStoredSecrets(previous, updated)
  for (const field of SENSITIVE_FIELDS) {
    const kept = previous[field]
    if (!updated[field] && kept && canKeep) updated[field] = kept
  }
  const connections = [...state.connections]
  connections[idx] = updated
  // write() dropped the decrypted cache; the next read re-derives which secrets
  // are still unreadable, so a re-entered one clears itself.
  write({ ...state, connections })
  return clone(updated)
}

export function deleteConnection(id: string): void {
  const state = read()
  write({ ...state, connections: state.connections.filter((c) => c.id !== id) })
  undecryptable.delete(id)
}
