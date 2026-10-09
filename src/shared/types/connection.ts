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
  /** Never sent to the renderer: it receives '' and reads `hasPassword` instead. */
  password: string
  ssl: boolean
  /**
   * Verify the server certificate and host name when `ssl` is on. Optional, and
   * absent reads as false: connections saved before it existed connected
   * without verification, and must keep connecting the same way.
   */
  sslVerify?: boolean
  // D1-only credentials
  accountId?: string
  databaseId?: string
  /** Same rule as `password`; the renderer reads `hasApiToken`. */
  apiToken?: string
}

export interface SavedConnection extends ConnectionInput {
  id: string
  createdAt: string
  updatedAt: string
  /**
   * Set on the copy sent across IPC, where the secrets themselves are blanked.
   * Inside main the secrets are present and these are absent. Saving a blank
   * secret back keeps the stored one.
   */
  hasPassword?: boolean
  hasApiToken?: boolean
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

/**
 * Whether a saved secret may stand in for a blank one in `next`. Only while the
 * connection still points at the same server and account: otherwise an edited
 * host would receive the old password - from a typo, or from a compromised
 * renderer that never held the password in the first place.
 */
export function canReuseStoredSecrets(
  previous: Pick<ConnectionInput, 'engine' | 'host' | 'port' | 'user' | 'accountId' | 'databaseId'>,
  next: Pick<ConnectionInput, 'engine' | 'host' | 'port' | 'user' | 'accountId' | 'databaseId'>
): boolean {
  if (previous.engine !== next.engine) return false
  if (next.engine === 'd1') {
    return (
      (previous.accountId ?? '') === (next.accountId ?? '') &&
      (previous.databaseId ?? '') === (next.databaseId ?? '')
    )
  }
  return (
    previous.host.trim().toLowerCase() === next.host.trim().toLowerCase() &&
    previous.port === next.port &&
    previous.user === next.user
  )
}
