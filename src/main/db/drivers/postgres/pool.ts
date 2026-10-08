/**
 * Pools, keyed by connection id.
 *
 * `getPool` returns a promise even though building a pool is synchronous, so
 * the many call sites do not depend on how a pool is obtained.
 */

import { Pool, type PoolConfig } from 'pg'
import { recordQuery } from '../../query-log'
import {
  type ConnectionInput,
  type SavedConnection,
  type TableDetails,
  type TestConnectionResult
} from '../../../../shared/types'
import { requireConnection } from '../../../store/connections-store'
import type { ActiveMeta } from '.././types'

const pools = new Map<string, Pool>()
export const tableDetailsCache = new Map<string, TableDetails>()
export function tableCacheKey(connectionId: string, schema: string, table: string): string {
  return `${connectionId} ${schema} ${table}`
}
export function invalidateTableDetailsForConnection(connectionId: string): void {
  const prefix = `${connectionId} `
  for (const key of tableDetailsCache.keys()) {
    if (key.startsWith(prefix)) tableDetailsCache.delete(key)
  }
}
function toPoolConfig(input: ConnectionInput): PoolConfig {
  return {
    host: input.host,
    port: input.port,
    database: input.database,
    user: input.user,
    password: input.password,
    ssl: input.ssl ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000
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
function instrumentPgPool(pool: Pool, connectionId: string): void {
  const original = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>
  ;(pool as unknown as { query: unknown }).query = async function patched(
    ...args: unknown[]
  ): Promise<unknown> {
    const first = args[0] as string | { text?: string; values?: unknown[] }
    const sql = typeof first === 'string' ? first : (first?.text ?? '')
    const params =
      typeof first === 'string'
        ? ((args[1] as unknown[] | undefined) ?? [])
        : ((first?.values as unknown[] | undefined) ?? [])
    const t0 = Date.now()
    try {
      const res = (await original(...args)) as { rowCount?: number | null }
      recordQuery({
        connectionId,
        engine: 'postgres',
        sql,
        params,
        durationMs: Date.now() - t0,
        rowCount: res?.rowCount ?? null,
        success: true
      })
      return res
    } catch (err) {
      recordQuery({
        connectionId,
        engine: 'postgres',
        sql,
        params,
        durationMs: Date.now() - t0,
        success: false,
        error: err instanceof Error ? err.message : String(err)
      })
      throw err
    }
  }
}
export async function disconnectPool(connectionId: string): Promise<void> {
  const pool = pools.get(connectionId)
  invalidateTableDetailsForConnection(connectionId)
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
    return { success: false, error: err instanceof Error ? err.message : String(err) }
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
