/**
 * Pools, keyed by connection id.
 *
 * `getPool` returns a promise even though building a pool is synchronous, so
 * the many call sites do not depend on how a pool is obtained.
 */

import { Pool, type ClientConfig, type PoolClient, type PoolConfig, type QueryResult } from 'pg'
import { recordedQuery } from '../../query-log'
import { invalidateIntrospection } from '../../introspection-cache'
import { pgTlsOptions } from '../../tls'
import { describeError } from '../../describe-error'
import {
  type ConnectionInput,
  type SavedConnection,
  type TestConnectionResult
} from '../../../../shared/types'
import { requireConnection } from '../../../store/connections-store'
import type { ActiveMeta } from '.././types'

const pools = new Map<string, Pool>()

/** Exported for the SQL editor's session, which connects with the same settings. */
export function toClientConfig(input: ConnectionInput): ClientConfig {
  return {
    host: input.host,
    port: input.port,
    database: input.database,
    user: input.user,
    password: input.password,
    ssl: pgTlsOptions(input),
    connectionTimeoutMillis: 8_000
  }
}
function toPoolConfig(input: ConnectionInput): PoolConfig {
  return {
    ...toClientConfig(input),
    max: 5,
    idleTimeoutMillis: 30_000
  }
}
export function getPool(connectionId: string): Promise<Pool> {
  const existing = pools.get(connectionId)
  if (existing) return Promise.resolve(existing)
  return Promise.resolve(createPool(connectionId))
}
function createPool(connectionId: string): Pool {
  const saved = requireConnection(connectionId)
  if (saved.engine !== 'postgres') throw new Error(`Wrong driver for connection ${connectionId}`)
  const pool = new Pool(toPoolConfig(saved))
  pool.on('error', (err) => {
    console.error(`[pg pool ${connectionId}] error`, err)
  })
  instrumentPgPool(pool, connectionId)
  pools.set(connectionId, pool)
  return pool
}
function rowCountOf(res: { rowCount?: number | null } | undefined): number | null {
  return res?.rowCount ?? null
}
function instrumentPgPool(pool: Pool, connectionId: string): void {
  const original = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>
  ;(pool as unknown as { query: unknown }).query = function patched(
    ...args: unknown[]
  ): Promise<unknown> {
    const first = args[0] as string | { text?: string; values?: unknown[] }
    const sql = typeof first === 'string' ? first : (first?.text ?? '')
    const params =
      typeof first === 'string'
        ? ((args[1] as unknown[] | undefined) ?? [])
        : ((first?.values as unknown[] | undefined) ?? [])
    return recordedQuery(
      { connectionId, engine: 'postgres', sql, params },
      () => original(...args) as Promise<{ rowCount?: number | null }>,
      rowCountOf
    )
  }
}
/**
 * `query` for a client checked out of the pool, recorded the way the pool's
 * own calls are. The patch above covers `pool.query` only; a transaction has
 * to hold one client, and nothing it ran there reached the log. Handed back as
 * a function rather than patched onto the client, which returns to the pool.
 */
export function loggedQuery(
  client: Pick<PoolClient, 'query'>,
  connectionId: string
): (sql: string, params?: unknown[]) => Promise<QueryResult<Record<string, unknown>>> {
  return (sql, params = []) =>
    recordedQuery(
      { connectionId, engine: 'postgres', sql, params },
      () => client.query<Record<string, unknown>>(sql, params),
      rowCountOf
    )
}
export async function disconnectPool(connectionId: string): Promise<void> {
  const pool = pools.get(connectionId)
  invalidateIntrospection(connectionId)
  if (!pool) return
  pools.delete(connectionId)
  try {
    await pool.end()
  } catch (err) {
    console.error(`[pg pool ${connectionId}] end failed`, err)
  }
}
export async function disconnectAll(): Promise<void> {
  const ids = [...pools.keys()]
  await Promise.all(ids.map((id) => disconnectPool(id)))
}
export async function test(input: ConnectionInput): Promise<TestConnectionResult> {
  let pool: Pool | null = null
  try {
    pool = new Pool({ ...toPoolConfig(input), max: 1 })
    instrumentPgPool(pool, '<test>')
    const res = await pool.query<{ version: string }>('select version() as version')
    return { success: true, serverVersion: res.rows[0]?.version }
  } catch (err) {
    return { success: false, error: describeError(err) }
  } finally {
    if (pool) await pool.end().catch(() => undefined)
  }
}
export async function describeActive(saved: SavedConnection): Promise<ActiveMeta> {
  const pool = await getPool(saved.id)
  const res = await pool.query<{ version: string; database: string; user: string }>(
    'select version() as version, current_database() as database, current_user as user'
  )
  const row = res.rows[0]
  return {
    serverVersion: row?.version ?? '',
    currentDatabase: row?.database ?? saved.database,
    currentUser: row?.user ?? saved.user
  }
}
