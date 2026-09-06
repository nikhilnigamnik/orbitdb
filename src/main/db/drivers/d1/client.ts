/**
 * Talking to the D1 REST API, and the connection lifecycle around it.
 *
 * D1 has no socket to hold open, so "connect" is only ever a request. The
 * concurrency cap and the request timeout live here because every other module
 * in this driver reaches the database through `callD1`.
 */

import {
  type ConnectionInput,
  type QueryOrigin,
  type SavedConnection,
  type TestConnectionResult
} from '../../../../shared/types'
import type { TableDetails } from '../../../../shared/types'
import { requireConnection } from '../../../store/connections-store'
import { quoteIdent, sqliteFilterDialect } from '../../sqlite-shared'
import { type ValueSearchDialect } from '../../value-search'
import { recordQuery } from '../../query-log'
import type { ActiveMeta } from '.././types'

const CF_API = 'https://api.cloudflare.com/client/v4'
interface D1QueryMeta {
  duration?: number
  changes?: number
  last_row_id?: number
  rows_read?: number
  rows_written?: number
  served_by?: string
}
interface D1QueryResultEntry<TRow = Record<string, unknown>> {
  results: TRow[]
  success: boolean
  meta: D1QueryMeta
}
interface D1Envelope<TRow = Record<string, unknown>> {
  success: boolean
  errors: { code: number; message: string }[]
  messages: { code: number; message: string }[]
  result?: D1QueryResultEntry<TRow>[]
}
function requireD1Credentials(input: ConnectionInput): {
  accountId: string
  databaseId: string
  apiToken: string
} {
  const accountId = (input.accountId ?? '').trim()
  const databaseId = (input.databaseId ?? '').trim()
  const apiToken = (input.apiToken ?? '').trim()
  if (!accountId) throw new Error('Cloudflare account ID is required')
  if (!databaseId) throw new Error('D1 database ID is required')
  if (!apiToken) throw new Error('Cloudflare API token is required')
  return { accountId, databaseId, apiToken }
}
export async function callD1<TRow = Record<string, unknown>>(
  input: ConnectionInput,
  sql: string,
  params: unknown[] = [],
  signal?: AbortSignal,
  origin: QueryOrigin = 'internal'
): Promise<D1QueryResultEntry<TRow>> {
  const connectionId = 'id' in input ? (input as SavedConnection).id : '<test>'
  const t0 = Date.now()
  try {
    const entry = await callD1Raw<TRow>(input, sql, params, signal)
    recordQuery({
      connectionId,
      engine: 'd1',
      sql,
      params,
      durationMs: Date.now() - t0,
      rowCount: entry.results?.length ?? null,
      success: true,
      origin
    })
    return entry
  } catch (err) {
    recordQuery({
      connectionId,
      engine: 'd1',
      sql,
      params,
      durationMs: Date.now() - t0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      origin
    })
    throw err
  }
}
/** D1 is HTTP-only; without this a stalled request hangs the UI forever. */
const D1_REQUEST_TIMEOUT_MS = 30_000
async function callD1Raw<TRow = Record<string, unknown>>(
  input: ConnectionInput,
  sql: string,
  params: unknown[],
  signal?: AbortSignal
): Promise<D1QueryResultEntry<TRow>> {
  const { accountId, databaseId, apiToken } = requireD1Credentials(input)
  const url = `${CF_API}/accounts/${accountId}/d1/database/${databaseId}/query`

  const timeout = AbortSignal.timeout(D1_REQUEST_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql, params }),
      signal: combined
    })
  } catch (err) {
    // A user-initiated cancel is not a network failure - report it as itself.
    if (signal?.aborted) throw new QueryCancelledError()
    if (timeout.aborted) {
      throw new Error(`Cloudflare API did not respond within ${D1_REQUEST_TIMEOUT_MS / 1000}s`)
    }
    throw new Error(
      `Failed to reach Cloudflare API: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  let envelope: D1Envelope<TRow>
  try {
    envelope = (await res.json()) as D1Envelope<TRow>
  } catch {
    throw new Error(`Cloudflare API returned a non-JSON response (HTTP ${res.status})`)
  }

  if (!res.ok || !envelope.success) {
    const message = envelope.errors?.map((e) => e.message).join('; ')
    throw new Error(message || `Cloudflare API error (HTTP ${res.status})`)
  }

  const entry = envelope.result?.[0]
  if (!entry) {
    return { results: [], success: true, meta: {} }
  }
  if (!entry.success) {
    const message = envelope.errors?.map((e) => e.message).join('; ')
    throw new Error(message || 'D1 query failed')
  }
  // D1 omits `results` for some statements - normalize once so every caller can
  // index it safely.
  return { ...entry, results: entry.results ?? [], meta: entry.meta ?? {} }
}
/**
 * Cloudflare rate-limits the D1 query API, so introspection that fans out over
 * every table (or every index) runs a few at a time rather than all at once.
 */
export const D1_MAX_CONCURRENT_REQUESTS = 6
export async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  fn: (item: TItem) => Promise<TResult>,
  limit = D1_MAX_CONCURRENT_REQUESTS
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}
export async function test(input: ConnectionInput): Promise<TestConnectionResult> {
  try {
    await callD1<{ ok: number }>(input, 'select 1 as ok')
    return { success: true, serverVersion: 'Cloudflare D1' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
export async function describeActive(saved: SavedConnection): Promise<ActiveMeta> {
  await callD1<{ ok: number }>(saved, 'select 1 as ok')
  return {
    serverVersion: 'Cloudflare D1',
    currentDatabase: saved.name || (saved.databaseId ?? ''),
    currentUser: 'D1'
  }
}
export async function disconnectPool(connectionId: string): Promise<void> {
  // D1 is stateless HTTP - nothing to close, but still flush cached schema.
  invalidateTableDetailsForConnection(connectionId)
}
export async function disconnectAll(): Promise<void> {
  // Same - no-op.
}
export function loadSaved(connectionId: string): SavedConnection {
  const saved = requireConnection(connectionId)
  if (saved.engine !== 'd1') throw new Error(`Wrong driver for connection ${connectionId}`)
  return saved
}
export const searchDialect: ValueSearchDialect = {
  ...sqliteFilterDialect,
  // SQLite has no schemas, so the qualified name is just the table.
  qualifiedTable: (_schema, table) => quoteIdent(table),
  castText: (expr) => `cast(${expr} as text)`
}

/**
 * The table-details cache, beside the transport rather than in introspect - the
 * same place `pool.ts` keeps it for the other two drivers, and the reason this
 * module can stay a leaf that nothing in the driver imports back into.
 */
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

export class QueryCancelledError extends Error {
  constructor() {
    super('Query cancelled')
    this.name = 'QueryCancelledError'
  }
}
