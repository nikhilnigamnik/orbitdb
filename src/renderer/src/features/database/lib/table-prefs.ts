export interface TableRef {
  schema: string
  table: string
}

const RECENT_LIMIT = 5

function pinnedKey(connectionId: string): string {
  return `orbitdb:pinned-tables:${connectionId}`
}

function recentKey(connectionId: string): string {
  return `orbitdb:recent-tables:${connectionId}`
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota / private mode - silently no-op
  }
}

function sameRef(a: TableRef, b: TableRef): boolean {
  return a.schema === b.schema && a.table === b.table
}

export function loadPinned(connectionId: string): TableRef[] {
  if (!connectionId) return []
  return readJson<TableRef[]>(pinnedKey(connectionId)) ?? []
}

export function savePinned(connectionId: string, pins: TableRef[]): void {
  writeJson(pinnedKey(connectionId), pins)
}

export function togglePinned(connectionId: string, ref: TableRef): TableRef[] {
  const current = loadPinned(connectionId)
  const exists = current.some((p) => sameRef(p, ref))
  const next = exists ? current.filter((p) => !sameRef(p, ref)) : [...current, ref]
  savePinned(connectionId, next)
  return next
}

export function isPinned(connectionId: string, ref: TableRef): boolean {
  return loadPinned(connectionId).some((p) => sameRef(p, ref))
}

export function loadRecent(connectionId: string): TableRef[] {
  if (!connectionId) return []
  return readJson<TableRef[]>(recentKey(connectionId)) ?? []
}

export function pushRecent(connectionId: string, ref: TableRef): TableRef[] {
  const current = loadRecent(connectionId)
  const next = [ref, ...current.filter((r) => !sameRef(r, ref))].slice(0, RECENT_LIMIT)
  writeJson(recentKey(connectionId), next)
  return next
}

/**
 * Follows a rename into the favourites and recents, which are stored by name
 * and would otherwise keep pointing at a table that no longer exists.
 */
export function renameTableRef(connectionId: string, from: TableRef, to: TableRef): void {
  const rename = (refs: TableRef[]): TableRef[] =>
    refs.map((ref) => (sameRef(ref, from) ? to : ref))
  savePinned(connectionId, rename(loadPinned(connectionId)))
  writeJson(recentKey(connectionId), rename(loadRecent(connectionId)))
}

/** Drops a table that is gone from the favourites and recents. */
export function forgetTableRef(connectionId: string, ref: TableRef): void {
  const without = (refs: TableRef[]): TableRef[] => refs.filter((r) => !sameRef(r, ref))
  savePinned(connectionId, without(loadPinned(connectionId)))
  writeJson(recentKey(connectionId), without(loadRecent(connectionId)))
}
