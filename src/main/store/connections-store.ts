import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import type { ConnectionInput, SavedConnection } from '../../shared/types'

const FILE_NAME = 'connections.json'

interface StoreShape {
  version: 1
  connections: SavedConnection[]
}

function storePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, FILE_NAME)
}

function read(): StoreShape {
  const path = storePath()
  if (!existsSync(path)) {
    return { version: 1, connections: [] }
  }
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as StoreShape
    if (!parsed || !Array.isArray(parsed.connections)) {
      return { version: 1, connections: [] }
    }
    parsed.connections = parsed.connections.map((c) => ({
      ...c,
      engine: c.engine ?? 'postgres'
    }))
    return parsed
  } catch {
    return { version: 1, connections: [] }
  }
}

function write(state: StoreShape): void {
  writeFileSync(storePath(), JSON.stringify(state, null, 2), 'utf8')
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
