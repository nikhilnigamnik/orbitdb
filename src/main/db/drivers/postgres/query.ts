/**
 * The query editor path, and the registry that lets a running query be cancelled
 * through pg_cancel_backend.
 */

import { recordQuery } from '../../query-log'
import { detectCommand, isSchemaChanging } from '../../sql-command'
import {
  MAX_QUERY_RESULT_ROWS,
  type QueryResult,
  type RunQueryOptions
} from '../../../../shared/types'
import { getPool, invalidateTableDetailsForConnection } from './pool'

interface PgInflightQuery {
  pid: number
  connectionId: string
}
const pgInflight = new Map<string, PgInflightQuery>()
export async function runQuery(opts: RunQueryOptions): Promise<QueryResult> {
  const pool = await getPool(opts.connectionId)
  const started = Date.now()
  // Runs on a dedicated client (so the backend PID is stable for cancellation),
  // which bypasses the instrumented pool.query - log it explicitly.
  const client = await pool.connect()
  try {
    let pid: number | null = null
    if (opts.queryId) {
      const pidRes = await client.query<{ pid: number }>('select pg_backend_pid() as pid')
      pid = pidRes.rows[0]?.pid ?? null
      if (pid != null) {
        pgInflight.set(opts.queryId, { pid, connectionId: opts.connectionId })
      }
    }
    try {
      const res = await client.query<Record<string, unknown>>(opts.sql, opts.params)
      // A multi-statement query (e.g. several INSERTs) makes pg return an array of
      // results - show the last statement's rows/columns and the total affected rows.
      const results = Array.isArray(res) ? res : [res]
      const primary = results[results.length - 1]
      const allRows = primary.rows ?? []
      const truncated = allRows.length > MAX_QUERY_RESULT_ROWS
      const rows = truncated ? allRows.slice(0, MAX_QUERY_RESULT_ROWS) : allRows
      const rowCount = results.reduce((sum, r) => sum + (r.rowCount ?? 0), 0)
      recordQuery({
        origin: 'user',
        connectionId: opts.connectionId,
        engine: 'postgres',
        sql: opts.sql,
        params: opts.params ?? [],
        durationMs: Date.now() - started,
        rowCount,
        success: true
      })
      if (isSchemaChanging(opts.sql)) invalidateTableDetailsForConnection(opts.connectionId)
      return {
        success: true,
        rows,
        fields: (primary.fields ?? []).map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
        rowCount,
        command: primary.command ?? detectCommand(opts.sql),
        durationMs: Date.now() - started,
        truncated
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      recordQuery({
        origin: 'user',
        connectionId: opts.connectionId,
        engine: 'postgres',
        sql: opts.sql,
        params: opts.params ?? [],
        durationMs: Date.now() - started,
        success: false,
        error: message
      })
      // A partially-applied DDL batch can still have changed the schema.
      if (isSchemaChanging(opts.sql)) invalidateTableDetailsForConnection(opts.connectionId)
      return {
        success: false,
        error: message,
        rows: [],
        fields: [],
        rowCount: null,
        command: null,
        durationMs: Date.now() - started,
        truncated: false
      }
    }
  } finally {
    if (opts.queryId) pgInflight.delete(opts.queryId)
    client.release()
  }
}
export async function cancelQuery(connectionId: string, queryId: string): Promise<void> {
  const entry = pgInflight.get(queryId)
  if (!entry || entry.connectionId !== connectionId) return
  const pool = await getPool(connectionId)
  try {
    await pool.query('select pg_cancel_backend($1)', [entry.pid])
  } catch (err) {
    console.error('[postgres] cancel failed:', err)
  }
}
