/**
 * Connections: what one is, how it is reached, and how it is filed.
 */

export type DatabaseEngine = 'postgres' | 'mysql' | 'd1'

export type ConnectionEnvironment = 'dev' | 'stage' | 'prod'

export type SshAuthMethod = 'password' | 'key' | 'agent'

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

export const SSH_DEFAULT_PORT = 22

/**
 * Whether a connection actually rides a tunnel. Shared rather than duplicated
 * because the renderer badges it and the main process acts on it: D1 speaks
 * over the REST API, so a `sshEnabled` left set by switching engine must not
 * read as "tunnelled" on one side and be ignored on the other.
 */
export function usesSshTunnel(input: Pick<ConnectionInput, 'engine' | 'sshEnabled'>): boolean {
  return input.engine !== 'd1' && input.sshEnabled === true
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
  // SSH tunnel - flat like the D1 fields above, because connections-store seals
  // secrets by top-level key name and a nested block would not reach that list.
  sshEnabled?: boolean
  sshHost?: string
  sshPort?: number
  sshUser?: string
  sshAuthMethod?: SshAuthMethod
  sshPassword?: string
  sshPrivateKey?: string
  sshPassphrase?: string
  /** SHA-256 host key fingerprint pinned on first connect. Empty means trust-on-first-use. */
  sshHostKeyFingerprint?: string
}

/** What the SSH key file picker hands back: contents to seal, path to display. */
export interface SshKeyPick {
  path: string
  contents: string
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
  /** Fingerprint the tunnel saw, so the form can pin it on save. */
  sshHostKeyFingerprint?: string
}

export interface ActiveConnectionMeta {
  connectionId: string
  serverVersion: string
  currentDatabase: string
  currentUser: string
}
