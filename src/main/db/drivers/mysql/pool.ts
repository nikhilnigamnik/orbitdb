/**
 * Pools, keyed by connection id.
 *
 * `getPool` returns a promise even though building a pool is synchronous, so
 * the many call sites do not depend on how a pool is obtained.
 */

import mysql, {
  type ConnectionOptions,
  type Pool,
  type PoolOptions,
  type RowDataPacket
} from 'mysql2/promise'
import {
  type ConnectionInput,
  type SavedConnection,
  type TestConnectionResult
} from '../../../../shared/types'
import { requireConnection } from '../../../store/connections-store'
import { recordQuery } from '../../query-log'
import { invalidateIntrospection } from '../../introspection-cache'
import { mysqlTlsOptions } from '../../tls'
import type { ActiveMeta } from '.././types'

const pools = new Map<string, Pool>()

/** Exported for the SQL editor's session, which connects with the same settings. */
export function toConnectionConfig(input: ConnectionInput): ConnectionOptions {
  return {
    host: input.host,
    port: input.port,
    database: input.database || undefined,
    user: input.user,
    password: input.password,
    ssl: mysqlTlsOptions(input),
    connectTimeout: 8_000,
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: true
  }
}
function toPoolConfig(input: ConnectionInput): PoolOptions {
  return { ...toConnectionConfig(input), connectionLimit: 5 }
}
export function getPool(connectionId: string): Promise<Pool> {
  const existing = pools.get(connectionId)
  if (existing) return Promise.resolve(existing)
  return Promise.resolve(createPool(connectionId))
}
function createPool(connectionId: string): Pool {
  const saved = requireConnection(connectionId)
  if (saved.engine !== 'mysql') throw new Error(`Wrong driver for connection ${connectionId}`)
  const pool = mysql.createPool(toPoolConfig(saved))
  instrumentMysqlPool(pool, connectionId)
  pools.set(connectionId, pool)
  return pool
}
function instrumentMysqlPool(pool: Pool, connectionId: string): void {
  const original = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>
  ;(pool as unknown as { query: unknown }).query = async function patched(
    ...args: unknown[]
  ): Promise<unknown> {
    const sql = typeof args[0] === 'string' ? (args[0] as string) : ''
    const params = (args[1] as unknown[] | undefined) ?? []
    const t0 = Date.now()
    try {
      const res = (await original(...args)) as unknown
      let rowCount: number | null = null
      if (Array.isArray(res) && res[0] && typeof res[0] === 'object') {
        const head = res[0] as { affectedRows?: number; length?: number }
        rowCount =
          typeof head.affectedRows === 'number'
            ? head.affectedRows
            : typeof head.length === 'number'
              ? head.length
              : null
      }
      recordQuery({
        connectionId,
        engine: 'mysql',
        sql,
        params,
        durationMs: Date.now() - t0,
        rowCount,
        success: true
      })
      return res
    } catch (err) {
      recordQuery({
        connectionId,
        engine: 'mysql',
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
  invalidateIntrospection(connectionId)
  if (!pool) return
  pools.delete(connectionId)
  try {
    await pool.end()
  } catch (err) {
    console.error(`[mysql pool ${connectionId}] end failed`, err)
  }
}
export async function disconnectAll(): Promise<void> {
  const ids = [...pools.keys()]
  await Promise.all(ids.map((id) => disconnectPool(id)))
}
export async function test(input: ConnectionInput): Promise<TestConnectionResult> {
  let pool: Pool | null = null
  try {
    pool = mysql.createPool({ ...toPoolConfig(input), connectionLimit: 1 })
    instrumentMysqlPool(pool, '<test>')
    const [rows] = await pool.query<RowDataPacket[]>('select version() as version')
    return { success: true, serverVersion: String(rows[0]?.version ?? '') }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    if (pool) await pool.end().catch(() => undefined)
  }
}
export async function describeActive(saved: SavedConnection): Promise<ActiveMeta> {
  const pool = await getPool(saved.id)
  const [rows] = await pool.query<RowDataPacket[]>(
    'select version() as version, database() as db, current_user() as user'
  )
  const row = rows[0] ?? {}
  return {
    serverVersion: String(row.version ?? ''),
    currentDatabase: String(row.db ?? saved.database),
    currentUser: String(row.user ?? saved.user)
  }
}
