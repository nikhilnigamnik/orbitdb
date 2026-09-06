/**
 * The query editor path, and the registry that lets a running query be killed.
 */

import type { ResultSetHeader } from 'mysql2/promise'
import {
  MAX_QUERY_RESULT_ROWS,
  type QueryResult,
  type RunQueryOptions
} from '../../../../shared/types'
import { recordQuery } from '../../query-log'
import { detectCommand, isSchemaChanging } from '../../sql-command'
import { getPool, invalidateTableDetailsForConnection } from './pool'

interface MysqlInflight {
  threadId: number
  connectionId: string
}
const mysqlInflight = new Map<string, MysqlInflight>()
export async function runQuery(opts: RunQueryOptions): Promise<QueryResult> {
  const pool = await getPool(opts.connectionId)
  const started = Date.now()
  // Runs on a dedicated connection (so the thread id is stable for KILL QUERY),
  // which bypasses the instrumented pool.query - log it explicitly.
  const conn = await pool.getConnection()
  try {
    if (opts.queryId) {
      const threadId = conn.threadId
      if (typeof threadId === 'number') {
        mysqlInflight.set(opts.queryId, { threadId, connectionId: opts.connectionId })
      }
    }
    try {
      const [result, fields] = await conn.query(opts.sql, opts.params)
      const command = detectCommand(opts.sql)
      const isRowSet = Array.isArray(result)
      const allRows = isRowSet ? (result as unknown as Record<string, unknown>[]) : []
      const header = isRowSet ? null : (result as ResultSetHeader)
      const rowCount = isRowSet ? allRows.length : (header?.affectedRows ?? null)
      recordQuery({
        origin: 'user',
        connectionId: opts.connectionId,
        engine: 'mysql',
        sql: opts.sql,
        params: opts.params ?? [],
        durationMs: Date.now() - started,
        rowCount,
        success: true
      })
      if (isSchemaChanging(opts.sql)) invalidateTableDetailsForConnection(opts.connectionId)
      const truncated = allRows.length > MAX_QUERY_RESULT_ROWS
      return {
        success: true,
        rows: truncated ? allRows.slice(0, MAX_QUERY_RESULT_ROWS) : allRows,
        fields: isRowSet
          ? (fields ?? []).map((f) => ({
              name: String(f.name),
              dataTypeID: typeof f.columnType === 'number' ? f.columnType : 0
            }))
          : [],
        rowCount,
        command,
        durationMs: Date.now() - started,
        truncated
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      recordQuery({
        origin: 'user',
        connectionId: opts.connectionId,
        engine: 'mysql',
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
    if (opts.queryId) mysqlInflight.delete(opts.queryId)
    conn.release()
  }
}
export async function cancelQuery(connectionId: string, queryId: string): Promise<void> {
  const entry = mysqlInflight.get(queryId)
  if (!entry || entry.connectionId !== connectionId) return
  const pool = await getPool(connectionId)
  try {
    await pool.query(`KILL QUERY ${entry.threadId}`)
  } catch (err) {
    console.error('[mysql] cancel failed:', err)
  }
}
