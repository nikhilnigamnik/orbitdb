/**
 * The query editor path: a dedicated session per connection, results read
 * through a cursor so a huge SELECT never lands in memory whole, and the
 * registry that lets a running query be cancelled through pg_cancel_backend.
 */

import { Client, type FieldDef, type QueryResult as PgResult } from 'pg'
import Cursor from 'pg-cursor'
import { recordQuery } from '../../query-log'
import { detectCommand, hasMultipleStatements, isSchemaChanging } from '../../sql-command'
import { invalidateIntrospection } from '../../introspection-cache'
import {
  EditorCancelledError,
  EditorSessions,
  InflightQueries,
  failedQueryResult
} from '../../editor-session'
import {
  MAX_QUERY_RESULT_ROWS,
  type QueryResult,
  type RunQueryOptions
} from '../../../../shared/types'
import { requireConnection } from '../../../store/connections-store'
import { getPool, toClientConfig } from './pool'

/** Severities after which the server has already closed the backend. */
const FATAL_SEVERITIES = new Set(['FATAL', 'PANIC'])

/**
 * A server error carries a severity and leaves the session usable - an aborted
 * transaction is still a transaction the user has to roll back. Anything else is
 * the socket going away, which the client's own 'error' event also reports.
 */
function isFatalPgError(err: unknown): boolean {
  if (!(err instanceof Error)) return true
  const severity = (err as Error & { severity?: unknown }).severity
  if (typeof severity !== 'string') return true
  return FATAL_SEVERITIES.has(severity)
}

export const pgEditorSessions = new EditorSessions<Client>({
  open(connectionId, onLost) {
    const saved = requireConnection(connectionId)
    if (saved.engine !== 'postgres') throw new Error(`Wrong driver for connection ${connectionId}`)
    const client = new Client(toClientConfig(saved))
    // Without a listener an idle session whose server restarts would crash main.
    client.on('error', (err) => {
      console.error(`[pg editor ${connectionId}] error`, err)
      onLost()
    })
    client.on('end', onLost)
    return { connection: client, ready: client.connect().then(() => undefined) }
  },
  close: (client) => client.end(),
  isFatal: isFatalPgError
})

const inflight = new InflightQueries<number>()

interface EditorOutcome {
  rows: Record<string, unknown>[]
  fields: FieldDef[]
  rowCount: number
  command: string | null
  isTruncated: boolean
}

function readCursor(
  cursor: Cursor<Record<string, unknown>>,
  count: number
): Promise<{ rows: Record<string, unknown>[]; result: PgResult }> {
  return new Promise((resolve, reject) => {
    cursor.read(count, (err, rows, result) => (err ? reject(err) : resolve({ rows, result })))
  })
}

/**
 * Reads one row past the cap, which is how a result that is exactly the cap
 * long is told apart from one that was cut. A truncated SELECT never completes,
 * so its row count is what was kept rather than a total nobody counted.
 */
export async function runSingleStatement(
  client: Client,
  sql: string,
  params: unknown[] | undefined
): Promise<EditorOutcome> {
  const cursor = client.query(new Cursor<Record<string, unknown>>(sql, params))
  // Read straight away: an error that arrives before the first read is
  // overwritten by the ready-for-query that follows it, and reads back as no rows.
  const { rows, result } = await readCursor(cursor, MAX_QUERY_RESULT_ROWS + 1)
  // A no-op once the statement completed; it only does work for a portal left
  // suspended at the cap. Not reached on error, where the cursor already synced.
  await cursor.close()
  const isTruncated = rows.length > MAX_QUERY_RESULT_ROWS
  const kept = isTruncated ? rows.slice(0, MAX_QUERY_RESULT_ROWS) : rows
  return {
    rows: kept,
    fields: result.fields ?? [],
    rowCount: isTruncated ? kept.length : (result.rowCount ?? kept.length),
    command: result.command || null,
    isTruncated
  }
}

/**
 * A batch has to take the simple protocol, which has no cursor - so it is read
 * whole and cut afterwards, as every run used to be. Only the last statement's
 * rows are shown, with the affected rows summed across all of them.
 */
async function runBatch(client: Client, sql: string): Promise<EditorOutcome> {
  const res = await client.query<Record<string, unknown>>(sql)
  const results: PgResult<Record<string, unknown>>[] = Array.isArray(res) ? res : [res]
  const primary = results[results.length - 1]
  const allRows = primary.rows ?? []
  const isTruncated = allRows.length > MAX_QUERY_RESULT_ROWS
  return {
    rows: isTruncated ? allRows.slice(0, MAX_QUERY_RESULT_ROWS) : allRows,
    fields: primary.fields ?? [],
    rowCount: results.reduce((sum, r) => sum + (r.rowCount ?? 0), 0),
    command: primary.command || null,
    isTruncated
  }
}

/**
 * The backend pid from the startup handshake, which pg keeps but its types do
 * not declare. Asking the server is the fallback, not the rule: it used to be a
 * round trip on every run.
 */
async function backendPid(client: Client): Promise<number | null> {
  const known: unknown = Reflect.get(client, 'processID')
  if (typeof known === 'number') return known
  const res = await client.query<{ pid: number }>('select pg_backend_pid() as pid')
  return res.rows[0]?.pid ?? null
}

function execute(client: Client, opts: RunQueryOptions): Promise<EditorOutcome> {
  const hasParams = (opts.params?.length ?? 0) > 0
  if (!hasParams && hasMultipleStatements(opts.sql)) return runBatch(client, opts.sql)
  return runSingleStatement(client, opts.sql, opts.params)
}

export async function runQuery(opts: RunQueryOptions): Promise<QueryResult> {
  const started = Date.now()
  inflight.begin(opts.queryId, opts.connectionId)
  try {
    const outcome = await pgEditorSessions.run(opts.connectionId, async (client) => {
      const pid = opts.queryId ? await backendPid(client) : null
      if (!inflight.attach(opts.queryId, pid)) throw new EditorCancelledError()
      return execute(client, opts)
    })
    recordQuery({
      origin: 'user',
      connectionId: opts.connectionId,
      engine: 'postgres',
      sql: opts.sql,
      params: opts.params ?? [],
      durationMs: Date.now() - started,
      rowCount: outcome.rowCount,
      success: true
    })
    if (isSchemaChanging(opts.sql)) invalidateIntrospection(opts.connectionId)
    return {
      success: true,
      rows: outcome.rows,
      fields: outcome.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
      rowCount: outcome.rowCount,
      command: outcome.command ?? detectCommand(opts.sql),
      durationMs: Date.now() - started,
      truncated: outcome.isTruncated
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
    if (isSchemaChanging(opts.sql)) invalidateIntrospection(opts.connectionId)
    return failedQueryResult(message, started)
  } finally {
    inflight.end(opts.queryId)
  }
}

export async function cancelQuery(connectionId: string, queryId: string): Promise<void> {
  const pid = inflight.requestCancel(connectionId, queryId)
  if (pid == null) return
  const pool = await getPool(connectionId)
  try {
    await pool.query('select pg_cancel_backend($1)', [pid])
  } catch (err) {
    console.error('[postgres] cancel failed:', err)
  }
}
