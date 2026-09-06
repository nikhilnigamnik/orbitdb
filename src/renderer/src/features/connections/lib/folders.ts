import { normalizeFolder } from '@renderer/config/site'
import type { SavedConnection } from '@renderer/types'

/** One heading on the connections page and the connections filed under it. */
export interface ConnectionGroup {
  /** Empty for the connections that were never filed anywhere. */
  folder: string
  connections: SavedConnection[]
}

export function folderOf(connection: Pick<SavedConnection, 'folder'>): string {
  return normalizeFolder(connection.folder)
}

/**
 * Every folder in use, for the form's suggestions and the page's headings.
 *
 * Matched case-insensitively, so typing "work" into the form files a connection
 * under the existing "Work" instead of opening a second group that looks the
 * same on screen. The heading is then the spelling most of them use - a single
 * stray "work" must not rename the folder three others agreed on - and locale
 * order breaks a tie, which keeps the heading independent of the page's sort.
 */
export function folderNames(connections: Pick<SavedConnection, 'folder'>[]): string[] {
  const spellings = new Map<string, Map<string, number>>()
  for (const connection of connections) {
    const folder = folderOf(connection)
    if (!folder) continue
    const key = folder.toLowerCase()
    const counts = spellings.get(key) ?? new Map<string, number>()
    counts.set(folder, (counts.get(folder) ?? 0) + 1)
    spellings.set(key, counts)
  }
  return [...spellings.values()]
    .map(
      (counts) =>
        [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
    )
    .sort((a, b) => a.localeCompare(b))
}

/**
 * Splits connections into their folders, preserving the order they arrive in
 * within each group - the page has already applied the user's sort, and a
 * folder must not quietly re-sort what it holds.
 *
 * Folders are ordered by name whatever that sort is, because a folder list is a
 * directory rather than a result set. Ungrouped goes last: it is the leftovers,
 * and putting it first buries every named folder below a pile.
 */
export function groupByFolder(connections: SavedConnection[]): ConnectionGroup[] {
  const canonical = new Map(folderNames(connections).map((name) => [name.toLowerCase(), name]))
  const groups = new Map<string, ConnectionGroup>()

  for (const connection of connections) {
    const folder = folderOf(connection)
    const name = folder ? (canonical.get(folder.toLowerCase()) ?? folder) : ''
    const group = groups.get(name)
    if (group) group.connections.push(connection)
    else groups.set(name, { folder: name, connections: [connection] })
  }

  return [...groups.values()].sort((a, b) => {
    if (!a.folder) return 1
    if (!b.folder) return -1
    return a.folder.localeCompare(b.folder)
  })
}

const COLLAPSED_KEY = 'orbitdb:collapsed-folders'

/**
 * Which folders are collapsed, in localStorage. Pure view state, like the grid's
 * column widths - losing it costs one click, so it does not belong in userData
 * next to the connections themselves.
 */
export function loadCollapsedFolders(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((f): f is string => typeof f === 'string') : []
  } catch {
    return []
  }
}

export function saveCollapsedFolders(folders: string[]): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(folders))
  } catch {
    // quota / private mode - the folders just won't stay collapsed
  }
}
