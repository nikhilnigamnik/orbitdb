import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import type { ConnectionInput, SavedConnection } from '../../shared/types'
import { decryptString, encryptString, isEncrypted, isEncryptionAvailable } from './crypto'

const FILE_NAME = 'connections.json'
const SENSITIVE_FIELDS = ['password', 'apiToken'] as const

interface StoreShape {
  version: 1
  connections: SavedConnection[]
}

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
  for (const field of SENSITIVE_FIELDS) {
    const value = out[field]
    if (typeof value === 'string' && value.length > 0) {
      out[field] = decryptString(value)
    }
  }
  return out
}

function hasPlaintextSecrets(conn: SavedConnection): boolean {
  return SENSITIVE_FIELDS.some((field) => {
    const value = conn[field]
    return typeof value === 'string' && value.length > 0 && !isEncrypted(value)
  })
}

function read(): StoreShape {
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

  parsed.connections = parsed.connections.map((c) => ({
    ...c,
    engine: c.engine ?? 'postgres'
  }))

  const needsMigration =
    isEncryptionAvailable() && parsed.connections.some(hasPlaintextSecrets)
  if (needsMigration) {
    console.info(
      '[connections-store] migrating plaintext credentials to encrypted-at-rest'
    )
    writeRaw({ ...parsed, connections: parsed.connections.map(encryptForDisk) })
  }

  return { ...parsed, connections: parsed.connections.map(decryptFromDisk) }
}

function writeRaw(state: StoreShape): void {
  writeFileSync(storePath(), JSON.stringify(state, null, 2), 'utf8')
}

function write(state: StoreShape): void {
  writeRaw({ ...state, connections: state.connections.map(encryptForDisk) })
}

export function listConnections(): SavedConnection[] {
  return read().connections
}

export function getConnection(id: string): SavedConnection | undefined {
  return read().connections.find((c) => c.id === id)
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
  state.connections.push(next)
  write(state)
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
  state.connections[idx] = updated
  write(state)
  return updated
}

export function deleteConnection(id: string): void {
  const state = read()
  state.connections = state.connections.filter((c) => c.id !== id)
  write(state)
}
