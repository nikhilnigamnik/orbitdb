/**
 * The query editor path, and the abort registry that lets a run be cancelled.
 */

import {
  MAX_QUERY_RESULT_ROWS,
  type QueryResult,
  type RunQueryOptions
} from '../../../../shared/types'
import { detectCommand, isSchemaChanging } from '../../sql-command'
import { callD1, invalidateTableDetailsForConnection, loadSaved } from './client'

const d1Inflight = new Map<string, { controller: AbortController; connectionId: string }>()
export async function runQuery(opts: RunQueryOptions): Promise<QueryResult> {
  const saved = loadSaved(opts.connectionId)
  const started = Date.now()
  const controller = new AbortController()
  if (opts.queryId) {
    d1Inflight.set(opts.queryId, { controller, connectionId: opts.connectionId })
  }
  try {
    const entry = await callD1(saved, opts.sql, opts.params ?? [], controller.signal, 'user')
    const fieldNames = entry.results[0] ? Object.keys(entry.results[0]) : []
    const truncated = entry.results.length > MAX_QUERY_RESULT_ROWS
    const rows = truncated ? entry.results.slice(0, MAX_QUERY_RESULT_ROWS) : entry.results
    if (isSchemaChanging(opts.sql)) invalidateTableDetailsForConnection(opts.connectionId)
    return {
      success: true,
      rows,
      fields: fieldNames.map((name) => ({ name, dataTypeID: 0 })),
      rowCount: entry.results.length > 0 ? entry.results.length : (entry.meta.changes ?? null),
      command: detectCommand(opts.sql),
      durationMs: Date.now() - started,
      truncated
    }
  } catch (err) {
    // A partially-applied DDL batch can still have changed the schema.
    if (isSchemaChanging(opts.sql)) invalidateTableDetailsForConnection(opts.connectionId)
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      rows: [],
      fields: [],
      rowCount: null,
      command: null,
      durationMs: Date.now() - started,
      truncated: false
    }
  } finally {
    if (opts.queryId) d1Inflight.delete(opts.queryId)
  }
}
export async function cancelQuery(connectionId: string, queryId: string): Promise<void> {
  const entry = d1Inflight.get(queryId)
  if (!entry || entry.connectionId !== connectionId) return
  entry.controller.abort()
}
