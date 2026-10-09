import { z } from 'zod'
import {
  CONNECTION_COLORS,
  type ConnectionInput,
  type SavedConnection,
  type TestConnectionResult
} from '../../shared/types'
import {
  createConnection,
  deleteConnection,
  fillStoredSecrets,
  listConnectionViews,
  toConnectionView,
  updateConnection
} from '../store/connections-store'
import { disconnectPool, testConnection } from '../db/manager'

// Older files and older renderers can carry a null where a field is now simply
// absent; reading that as absent beats refusing a connection the user saved.
const optionalString = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)

const connectionInputSchema: z.ZodType<ConnectionInput, z.ZodTypeDef, unknown> = z.object({
  name: z.string(),
  engine: z.enum(['postgres', 'mysql', 'd1']),
  environment: z.enum(['dev', 'stage', 'prod']),
  folder: optionalString,
  color: z
    .enum(CONNECTION_COLORS)
    .nullish()
    .transform((value) => value ?? undefined),
  host: z.string(),
  port: z.number().int().min(0).max(65535),
  database: z.string(),
  user: z.string(),
  password: z.string(),
  ssl: z.boolean(),
  sslVerify: z.boolean().optional(),
  accountId: optionalString,
  databaseId: optionalString,
  apiToken: optionalString
})

/** Unknown keys are dropped, which also keeps the renderer's view flags off disk. */
function parseInput(raw: unknown): ConnectionInput {
  const result = connectionInputSchema.safeParse(raw)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  throw new Error(`Invalid connection: ${issue.path.join('.') || 'input'} - ${issue.message}`)
}

export function listConnectionsForRenderer(): SavedConnection[] {
  return listConnectionViews()
}

export function createConnectionForRenderer(raw: unknown): SavedConnection {
  return toConnectionView(createConnection(parseInput(raw)))
}

/**
 * `disconnectPool` resolves the driver from the record as it stands when the
 * call is made, and drops the pool before its first await. So it is started
 * before the save - an engine change still closes the old engine's pool - and
 * the save lands in the same tick. Awaiting the close first, as this used to,
 * let a query arriving during `pool.end()` rebuild the pool from the old config.
 */
export async function updateConnectionForRenderer(
  id: string,
  raw: unknown
): Promise<SavedConnection> {
  const input = parseInput(raw)
  const closing = disconnectPool(id)
  try {
    return toConnectionView(updateConnection(id, input))
  } finally {
    await closing
  }
}

/** Same ordering as an edit: after the delete nothing can rebuild the pool. */
export async function deleteConnectionForRenderer(id: string): Promise<void> {
  const closing = disconnectPool(id)
  try {
    deleteConnection(id)
  } finally {
    await closing
  }
}

/**
 * With an id, blank secrets are filled from the saved connection - the form no
 * longer holds them, and a health check never did.
 */
export async function testConnectionForRenderer(
  raw: unknown,
  connectionId?: string
): Promise<TestConnectionResult> {
  const input = parseInput(raw)
  let resolved: ConnectionInput
  try {
    resolved = connectionId ? fillStoredSecrets(input, connectionId) : input
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
  return testConnection(resolved)
}
