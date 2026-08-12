import { app } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import type { RecordQueryRun, SavedQuery, SavedQueryPatch } from '../../shared/types'

const FILE_NAME = 'queries.json'

/**
 * Unstarred entries kept per connection. Starred ones are exempt: the cap exists
 * so history does not grow forever, and a query the user kept is not history.
 */
export const MAX_HISTORY_PER_CONNECTION = 100

interface StoreShape {
  version: 1
  queries: SavedQuery[]
}

// Plain JSON, no encryption - same reasoning as usage-store. A query can name a
// table but holds no credential, and crypto.ts costs a keychain round-trip per
// read on a file that is read on every query-page mount.
let cache: StoreShape | null = null

function emptyState(): StoreShape {
  return { version: 1, queries: [] }
}

function storePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, FILE_NAME)
}

function isQuery(value: unknown): value is SavedQuery {
  const q = value as Partial<SavedQuery> | null
  return (
    !!q &&
    typeof q.id === 'string' &&
    typeof q.connectionId === 'string' &&
    typeof q.sql === 'string' &&
    typeof q.ranAt === 'string'
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
    // otherwise crash every render that reads `sql`.
    cache = { version: 1, queries: (parsed?.queries ?? []).filter(isQuery) }
  } catch {
    // A corrupt history file is not worth failing a launch over.
    cache = emptyState()
  }
  return cache
}

function write(queries: SavedQuery[]): void {
  const state: StoreShape = { version: 1, queries }
  writeFileSync(storePath(), JSON.stringify(state), 'utf8')
  cache = state
}

function newestFirst(a: SavedQuery, b: SavedQuery): number {
  return b.ranAt.localeCompare(a.ranAt)
}

/** Drops the oldest unstarred entries once a connection is over the cap. */
function prune(queries: SavedQuery[]): SavedQuery[] {
  const seen = new Map<string, number>()
  const kept: SavedQuery[] = []
  for (const query of [...queries].sort(newestFirst)) {
    if (query.isStarred) {
      kept.push(query)
      continue
    }
    const count = seen.get(query.connectionId) ?? 0
    if (count >= MAX_HISTORY_PER_CONNECTION) continue
    seen.set(query.connectionId, count + 1)
    kept.push(query)
  }
  return kept
}

export function listQueries(connectionId?: string): SavedQuery[] {
  const { queries } = read()
  const scoped = connectionId ? queries.filter((q) => q.connectionId === connectionId) : queries
  return [...scoped].sort(newestFirst)
}

/**
 * Records a run. Re-running the same SQL updates the existing entry in place
 * instead of adding a duplicate - iterating on one query would otherwise fill
 * the history with near-identical rows and push the earlier ones off the cap.
 * Only the newest unstarred match is folded into; a starred entry is the user's
 * copy and keeps the timing of the run they kept.
 */
export function recordQueryRun(input: RecordQueryRun, now = new Date()): SavedQuery {
  const { queries } = read()
  const sql = input.sql.trim()
  const ranAt = now.toISOString()

  const existing = queries
    .filter((q) => q.connectionId === input.connectionId && !q.isStarred && q.sql === sql)
    .sort(newestFirst)[0]

  const entry: SavedQuery = existing
    ? { ...existing, ranAt, durationMs: input.durationMs, success: input.success }
    : {
        id: randomUUID(),
        connectionId: input.connectionId,
        sql,
        name: null,
        isStarred: false,
        ranAt,
        durationMs: input.durationMs,
        success: input.success
      }

  write(prune([entry, ...queries.filter((q) => q.id !== entry.id)]))
  return entry
}

export function updateQuery(id: string, patch: SavedQueryPatch): SavedQuery {
  const { queries } = read()
  const existing = queries.find((q) => q.id === id)
  if (!existing) throw new Error(`Query ${id} not found`)

  const next: SavedQuery = {
    ...existing,
    ...(patch.sql !== undefined ? { sql: patch.sql } : {}),
    ...(patch.isStarred !== undefined ? { isStarred: patch.isStarred } : {}),
    ...(patch.name !== undefined ? { name: patch.name?.trim() ? patch.name.trim() : null } : {})
  }
  // A name only survives on a kept query - unstarring would otherwise leave a
  // named entry that the history cap can delete without warning.
  if (!next.isStarred) next.name = null

  write(prune(queries.map((q) => (q.id === id ? next : q))))
  return next
}

export function deleteQuery(id: string): void {
  const { queries } = read()
  write(queries.filter((q) => q.id !== id))
}

/** Clears one connection's history. Starred entries survive - they were kept on purpose. */
export function clearQueryHistory(connectionId: string): void {
  const { queries } = read()
  write(queries.filter((q) => q.connectionId !== connectionId || q.isStarred))
}

/** Test seam - drops the cache so a fresh file is re-read. */
export function resetQueriesCache(): void {
  cache = null
}
