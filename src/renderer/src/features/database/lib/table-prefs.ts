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
    // quota / private mode — silently no-op
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
