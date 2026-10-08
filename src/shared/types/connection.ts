/**
 * Connections: what one is, how it is reached, and how it is filed.
 */

export type DatabaseEngine = 'postgres' | 'mysql' | 'd1'

export type ConnectionEnvironment = 'dev' | 'stage' | 'prod'

/**
 * Accent a connection can be tagged with. A fixed set rather than free-form
 * hex: the renderer resolves each one to literal Tailwind classes, which only
 * exist if they are written out somewhere the scanner can see them.
 */
export const CONNECTION_COLORS = [
  'slate',
  'blue',
  'violet',
  'cyan',
  'green',
  'amber',
  'orange',
  'rose'
] as const

/**
 * Derived from the list rather than written beside it. The two were separate
 * copies of the same eight names, and only the ones the compiler could relate to
 * each other - the class and label maps - were kept honest by it.
 */
export type ConnectionColor = (typeof CONNECTION_COLORS)[number]

/** Trimmed, and collapsed to '' when there is nothing left - the ungrouped case. */
export function normalizeFolder(raw: string | undefined | null): string {
  return typeof raw === 'string' ? raw.trim() : ''
}

export interface ConnectionInput {
  name: string
  engine: DatabaseEngine
  environment: ConnectionEnvironment
  /**
   * Free-text group this connection is filed under. Empty means ungrouped.
   * A name rather than an id: there is no folder entity to keep in sync, so
   * renaming one is an edit and deleting the last member leaves nothing behind.
   */
  folder?: string
  /** Accent for the card and the sidebar. Absent falls back to the engine tint. */
  color?: ConnectionColor
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean
  // D1-only credentials
  accountId?: string
  databaseId?: string
  apiToken?: string
}

export interface SavedConnection extends ConnectionInput {
  id: string
  createdAt: string
  updatedAt: string
}

export interface TestConnectionResult {
  success: boolean
  error?: string
  serverVersion?: string
}

export interface ActiveConnectionMeta {
  connectionId: string
  serverVersion: string
  currentDatabase: string
  currentUser: string
}
