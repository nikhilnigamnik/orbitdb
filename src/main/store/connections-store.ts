import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import type { ConnectionInput, SavedConnection } from '../../shared/types'
import { decryptString, encryptString, isEncrypted, isEncryptionAvailable } from './crypto'

const FILE_NAME = 'connections.json'
const SENSITIVE_FIELDS = [
  'password',
  'apiToken',
  'sshPassword',
  'sshPrivateKey',
  'sshPassphrase'
] as const
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
  if (!existsSync(path)) {
    return { version: 1, connections: [] }
  }
  let parsed: StoreShape
  try {
    const raw = readFileSync(path, 'utf8')
    parsed = JSON.parse(raw) as StoreShape
    if (!parsed || !Array.isArray(parsed.connections)) {
      return { version: 1, connections: [] }
    }
  } catch {
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
  writeFileSync(storePath(), JSON.stringify(state, null, 2), 'utf8')
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

export function listConnections(): SavedConnection[] {
  return read().connections.map(clone)
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
  if (failed?.size) {
    throw new Error(
      `Saved ${[...failed].join(' and ')} for "${found.name}" could not be decrypted on this ` +
        `machine. Open the connection and re-enter it.`
    )
  }
  return clone(found)
}

export function createConnection(input: ConnectionInput): SavedConnection {
  const state = read()
  const now = new Date().toISOString()
  const next: SavedConnection = {
    ...input,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now
  }
  write({ ...state, connections: [...state.connections, next] })
  return next
}

export function updateConnection(id: string, input: ConnectionInput): SavedConnection {
  const state = read()
  const idx = state.connections.findIndex((c) => c.id === id)
  if (idx === -1) throw new Error(`Connection ${id} not found`)
  const updated: SavedConnection = {
    ...state.connections[idx],
    ...input,
    updatedAt: new Date().toISOString()
  }
  const connections = [...state.connections]
  connections[idx] = updated
  // write() dropped the decrypted cache; the next read re-derives which secrets
  // are still unreadable, so a re-entered one clears itself.
  write({ ...state, connections })
  return updated
}

/**
 * Pin the bastion's host key on first successful connect. Kept separate from
 * updateConnection because it is written by the tunnel rather than by the user,
 * and must never look like an edit that could clear a secret.
 */
export function setSshHostKeyFingerprint(id: string, fingerprint: string): void {
  if (!fingerprint) return
  const state = read()
  const idx = state.connections.findIndex((c) => c.id === id)
  if (idx === -1) return
  if (state.connections[idx].sshHostKeyFingerprint === fingerprint) return
  const connections = [...state.connections]
  connections[idx] = { ...connections[idx], sshHostKeyFingerprint: fingerprint }
  write({ ...state, connections })
}

export function deleteConnection(id: string): void {
  const state = read()
  write({ ...state, connections: state.connections.filter((c) => c.id !== id) })
  undecryptable.delete(id)
}
