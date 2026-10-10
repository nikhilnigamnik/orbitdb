import { randomUUID } from 'node:crypto'
import type { DatabaseEngine, QueryLogEntry, QueryOrigin } from '../../shared/types'
import { describeError } from './describe-error'

const MAX_ENTRIES = 200

const buffer: QueryLogEntry[] = []

/** What a call is, before it has run. */
export interface QueryCall {
  /** Defaults to internal: most callers are the app's own introspection. */
  origin?: QueryOrigin
  connectionId: string
  engine: DatabaseEngine
  sql: string
  params?: unknown[]
}

interface RecordOptions extends QueryCall {
  durationMs: number
  rowCount?: number | null
  success: boolean
  error?: string
}

/**
 * Runs one query and records it, succeed or fail.
 *
 * The pools patch `pool.query` with this. A client checked out of a pool - the
 * cascade's transaction - is not covered by that patch, so it calls this around
 * each statement instead. It is a wrapper rather than a patch on the client
 * because the client goes back to the pool, where `pool.query` running on it
 * would then record every statement twice.
 */
export async function recordedQuery<T>(
  call: QueryCall,
  run: () => Promise<T>,
  rowCountOf: (result: T) => number | null
): Promise<T> {
  const t0 = Date.now()
  try {
    const result = await run()
    recordQuery({
      ...call,
      durationMs: Date.now() - t0,
      rowCount: rowCountOf(result),
      success: true
    })
    return result
  } catch (err) {
    recordQuery({ ...call, durationMs: Date.now() - t0, success: false, error: describeError(err) })
    throw err
  }
}

export function recordQuery(opts: RecordOptions): void {
  const entry: QueryLogEntry = {
    id: randomUUID(),
    origin: opts.origin ?? 'internal',
    connectionId: opts.connectionId,
    engine: opts.engine,
    sql: opts.sql,
    params: opts.params ?? [],
    durationMs: opts.durationMs,
    rowCount: opts.rowCount ?? null,
    success: opts.success,
    error: opts.error,
    ranAt: new Date().toISOString()
  }
  buffer.unshift(entry)
  if (buffer.length > MAX_ENTRIES) buffer.length = MAX_ENTRIES
}

export function listQueryLogs(): QueryLogEntry[] {
  return buffer.slice()
}

export function clearQueryLogs(): void {
  buffer.length = 0
}
