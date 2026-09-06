/**
 * Pools, and the tunnel one may ride over.
 *
 * `getPool` is async because a connection can have to open an SSH tunnel
 * first, and it keeps a pending-promise map so two queries arriving on a cold
 * connection do not each build a pool and leak the loser.
 */

import mysql, { type Pool, type PoolOptions, type RowDataPacket } from 'mysql2/promise'
import {
  type ConnectionInput,
  type SavedConnection,
  type TableDetails,
  type TestConnectionResult
} from '../../../../shared/types'
import { requireConnection, setSshHostKeyFingerprint } from '../../../store/connections-store'
import {
  addTunnelPoolEvictor,
  closeTunnel,
  isSshEnabled,
  openEphemeralTunnel,
  openTunnel,
  type EphemeralTunnel,
  type TunnelEndpoint
} from '../../ssh-tunnel'
import { recordQuery } from '../../query-log'
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
function toPoolConfig(input: ConnectionInput, tunnel?: TunnelEndpoint): PoolOptions {
  return {
    // Over a tunnel the driver dials the local forward; the real host is only
    // resolved on the far side of the bastion.
    host: tunnel?.host ?? input.host,
    port: tunnel?.port ?? input.port,
    database: input.database || undefined,
    user: input.user,
    password: input.password,
    ssl: input.ssl ? { rejectUnauthorized: false } : undefined,
    connectionLimit: 5,
    connectTimeout: 8_000,
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: true
  }
}
/** Two queries on a cold connection would otherwise each build a pool. */
const pendingPools = new Map<string, Promise<Pool>>()
export function getPool(connectionId: string): Promise<Pool> {
  const existing = pools.get(connectionId)
  if (existing) return Promise.resolve(existing)
  const inFlight = pendingPools.get(connectionId)
  if (inFlight) return inFlight
  const promise = createPool(connectionId).finally(() => pendingPools.delete(connectionId))
  pendingPools.set(connectionId, promise)
  return promise
}
async function createPool(connectionId: string): Promise<Pool> {
  const saved = requireConnection(connectionId)
  if (saved.engine !== 'mysql') throw new Error(`Wrong driver for connection ${connectionId}`)
  let tunnel: TunnelEndpoint | undefined
  if (isSshEnabled(saved)) {
    tunnel = await openTunnel(saved)
    if (tunnel.learnedFingerprint) {
      setSshHostKeyFingerprint(saved.id, tunnel.learnedFingerprint)
    }
  }
  const pool = mysql.createPool(toPoolConfig(saved, tunnel))
  instrumentMysqlPool(pool, connectionId)
  pools.set(connectionId, pool)
  return pool
}

// When the bastion drops, the forwarded port stops working but the pool would
// happily keep handing out sockets to it. Dropping it here means the next call
// rebuilds both.
addTunnelPoolEvictor((connectionId) => {
  const pool = pools.get(connectionId)
  if (!pool) return
  pools.delete(connectionId)
  invalidateTableDetailsForConnection(connectionId)
  pool.end().catch(() => undefined)
})
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
  // An SSH handshake takes seconds, so disconnecting mid-connect is realistic.
  // Let the in-flight one land first: neither the pool nor the tunnel is
  // registered yet, so closing now would close nothing and leave both standing
  // once it resolved.
  const inFlight = pendingPools.get(connectionId)
  if (inFlight) await inFlight.catch(() => undefined)

  const pool = pools.get(connectionId)
  invalidateTableDetailsForConnection(connectionId)
  // The tunnel and the pool have the same lifetime, so it goes even when there
  // was no pool - a failed first connect can leave one standing.
  closeTunnel(connectionId)
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
  let tunnel: EphemeralTunnel | undefined
  let pool: Pool | null = null
  try {
    if (isSshEnabled(input)) {
      tunnel = await openEphemeralTunnel(input)
    }
    pool = mysql.createPool({ ...toPoolConfig(input, tunnel), connectionLimit: 1 })
    instrumentMysqlPool(pool, '<test>')
    const [rows] = await pool.query<RowDataPacket[]>('select version() as version')
    return {
      success: true,
      serverVersion: String(rows[0]?.version ?? ''),
      sshHostKeyFingerprint: tunnel?.learnedFingerprint
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    if (pool) await pool.end().catch(() => undefined)
    if (tunnel) closeTunnel(tunnel.key)
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
