import { app } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import type {
  SaveTableViewInput,
  SavedTableView,
  SavedTableViewPatch,
  TableViewScope
} from '../../shared/types'

const FILE_NAME = 'views.json'

interface StoreShape {
  version: 1
  views: SavedTableView[]
}

// Plain JSON, no encryption - same reasoning as queries-store. A view names
// columns and the values you filtered on, which is the same class of thing as a
// saved query, and crypto.ts costs a keychain round-trip on every read.
let cache: StoreShape | null = null

function emptyState(): StoreShape {
  return { version: 1, views: [] }
}

function storePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, FILE_NAME)
}

function isView(value: unknown): value is SavedTableView {
  const v = value as Partial<SavedTableView> | null
  return (
    !!v &&
    typeof v.id === 'string' &&
    typeof v.connectionId === 'string' &&
    typeof v.schema === 'string' &&
    typeof v.table === 'string' &&
    typeof v.name === 'string' &&
    !!v.view &&
    Array.isArray(v.view.filters)
  )
}

function read(): StoreShape {
  if (cache) return cache
  const path = storePath()
  if (!existsSync(path)) {
    cache = emptyState()
    return cache
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<StoreShape>
    // Filtering rather than trusting the file: one malformed entry would
    // otherwise crash every render that reads `view.filters`.
    cache = { version: 1, views: (parsed?.views ?? []).filter(isView) }
  } catch {
    // A corrupt views file is not worth failing a table open over.
    cache = emptyState()
  }
  return cache
}

function write(views: SavedTableView[]): void {
  const state: StoreShape = { version: 1, views }
  writeFileSync(storePath(), JSON.stringify(state), 'utf8')
  cache = state
}

function inScope(view: SavedTableView, scope: TableViewScope): boolean {
  return (
    view.connectionId === scope.connectionId &&
    view.schema === scope.schema &&
    view.table === scope.table
  )
}

function byName(a: SavedTableView, b: SavedTableView): number {
  return a.name.localeCompare(b.name)
}

/**
 * Every view here was named by hand, so there is no cap and no pruning. That is
 * the same rule starred queries follow: the history cap in queries-store exists
 * because runs are recorded for you, and nothing is recorded for you here.
 */
export function listTableViews(scope: TableViewScope): SavedTableView[] {
  return read()
    .views.filter((v) => inScope(v, scope))
    .sort(byName)
}

/**
 * Saves under a name, replacing a view of that name on the same table rather
 * than adding a second one. Re-saving is how a view is updated, and two entries
 * reading "Active users" would leave no way to tell which one a click applies.
 * Matched case-insensitively, since "active users" is not a different view.
 */
export function saveTableView(input: SaveTableViewInput, now = new Date()): SavedTableView {
  const { views } = read()
  const name = input.name.trim()
  if (!name) throw new Error('A view needs a name')

  const scope: TableViewScope = {
    connectionId: input.connectionId,
    schema: input.schema,
    table: input.table
  }
  const existing = views.find(
    (v) => inScope(v, scope) && v.name.toLowerCase() === name.toLowerCase()
  )
  const stamp = now.toISOString()

  const entry: SavedTableView = existing
    ? { ...existing, name, view: input.view, updatedAt: stamp }
    : {
        id: randomUUID(),
        ...scope,
        name,
        view: input.view,
        createdAt: stamp,
        updatedAt: stamp
      }

  write([entry, ...views.filter((v) => v.id !== entry.id)])
  return entry
}

export function updateTableView(
  id: string,
  patch: SavedTableViewPatch,
  now = new Date()
): SavedTableView {
  const { views } = read()
  const existing = views.find((v) => v.id === id)
  if (!existing) throw new Error(`View ${id} not found`)

  const name = patch.name === undefined ? existing.name : patch.name.trim()
  if (!name) throw new Error('A view needs a name')

  const clash = views.find(
    (v) => v.id !== id && inScope(v, existing) && v.name.toLowerCase() === name.toLowerCase()
  )
  if (clash) throw new Error(`This table already has a view called "${clash.name}"`)

  const next: SavedTableView = {
    ...existing,
    name,
    ...(patch.view !== undefined ? { view: patch.view } : {}),
    updatedAt: now.toISOString()
  }
  write(views.map((v) => (v.id === id ? next : v)))
  return next
}

export function deleteTableView(id: string): void {
  const { views } = read()
  write(views.filter((v) => v.id !== id))
}

/**
 * Drops every view belonging to a connection. Called when the connection itself
 * is deleted - the views name tables that are no longer reachable, and nothing
 * would ever list them again.
 */
export function deleteViewsForConnection(connectionId: string): void {
  const { views } = read()
  const kept = views.filter((v) => v.connectionId !== connectionId)
  if (kept.length !== views.length) write(kept)
}

/** Test seam - drops the cache so a fresh file is re-read. */
export function resetViewsCache(): void {
  cache = null
}
