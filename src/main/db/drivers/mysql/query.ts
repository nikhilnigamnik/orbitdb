/**
 * The query editor path: a dedicated session per connection, results streamed
 * so a huge SELECT never lands in memory whole, and the registry that lets a
 * running query be killed.
 */

import {
  createConnection,
  Types,
  type Connection,
  type FieldPacket,
  type OkPacket,
  type ResultSetHeader,
  type RowDataPacket
} from 'mysql2'
import { recordQuery } from '../../query-log'
import { detectCommand, isSchemaChanging } from '../../sql-command'
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
import { getPool, toConnectionConfig } from './pool'

/**
 * The renderer reads `dataTypeID` as a Postgres OID, so mysql2's column types
 * are translated to the OIDs that change how a value renders. Everything else
 * is 0 rather than passed through: mysql2's numbers collide with the OIDs, and
 * its BIT is 16, the bool OID, which drew a tick over a byte string.
 */
const PG_OID_BY_MYSQL_TYPE: Record<number, number> = {
  [Types.DATE]: 1082,
  [Types.DATETIME]: 1114,
  [Types.TIMESTAMP]: 1114,
  [Types.JSON]: 114
}

export function toPgTypeId(columnType: unknown): number {
  if (typeof columnType !== 'number') return 0
  return PG_OID_BY_MYSQL_TYPE[columnType] ?? 0
}

/** mysql2 marks the errors after which it has already torn the connection down. */
function isFatalMysqlError(err: unknown): boolean {
  if (!(err instanceof Error)) return true
  return Reflect.get(err, 'fatal') === true
}

export const mysqlEditorSessions = new EditorSessions<Connection>({
  open(connectionId, onLost) {
    const saved = requireConnection(connectionId)
    if (saved.engine !== 'mysql') throw new Error(`Wrong driver for connection ${connectionId}`)
    const connection = createConnection(toConnectionConfig(saved))
    // Without a listener an idle session whose server restarts would crash main.
    connection.on('error', (err) => {
      console.error(`[mysql editor ${connectionId}] error`, err)
      onLost()
    })
    connection.on('end', onLost)
    const ready = new Promise<void>((resolve, reject) => {
      connection.connect((err) => (err ? reject(err) : resolve()))
    })
    return { connection, ready }
  },
  close: (connection) =>
    new Promise<void>((resolve) => {
      connection.end((err) => {
        if (err) connection.destroy()
        resolve()
      })
    }),
  isFatal: isFatalMysqlError
})

const inflight = new InflightQueries<number>()

interface EditorOutcome {
  rows: Record<string, unknown>[]
  fields: FieldPacket[] | null
  header: ResultSetHeader | null
  isTruncated: boolean
}

/**
 * Streams the result instead of buffering it, keeping the first rows up to the
 * cap and dropping the rest as they arrive.
 *
 * The rest still crosses the wire. Stopping the server early means destroying
 * the connection or killing the query, and both would cost the user the session
 * - and with it any transaction they have open - just because a SELECT was big.
 *
 * mysql2 announces each result with a `fields` event: the column list for a row
 * set, `undefined` for an OK packet, which then arrives as the next `result`.
 * The last row set wins, matching what the Postgres path shows for a batch.
 */
export function streamQuery(
  connection: Connection,
  sql: string,
  params: unknown[] | undefined
): Promise<EditorOutcome> {
  return new Promise((resolve, reject) => {
    const outcome: EditorOutcome = { rows: [], fields: null, header: null, isTruncated: false }
    let isHeaderNext = false
    const query = connection.query(sql, params)
    query.on('fields', (fields: FieldPacket[] | undefined) => {
      if (fields === undefined) {
        isHeaderNext = true
        return
      }
      outcome.fields = fields
      outcome.rows = []
      outcome.isTruncated = false
    })
    query.on('result', (packet: RowDataPacket | OkPacket | ResultSetHeader) => {
      if (isHeaderNext) {
        isHeaderNext = false
        outcome.header = packet as ResultSetHeader
        return
      }
      if (outcome.rows.length < MAX_QUERY_RESULT_ROWS) {
        outcome.rows.push(packet as Record<string, unknown>)
      } else {
        outcome.isTruncated = true
      }
    })
    query.on('error', reject)
    query.on('end', () => resolve(outcome))
  })
}

export async function runQuery(opts: RunQueryOptions): Promise<QueryResult> {
  const started = Date.now()
  inflight.begin(opts.queryId, opts.connectionId)
  try {
    const outcome = await mysqlEditorSessions.run(opts.connectionId, (connection) => {
      if (!inflight.attach(opts.queryId, connection.threadId)) throw new EditorCancelledError()
      return streamQuery(connection, opts.sql, opts.params)
    })
    const isRowSet = outcome.fields != null
    const rowCount = isRowSet ? outcome.rows.length : (outcome.header?.affectedRows ?? null)
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
    if (isSchemaChanging(opts.sql)) invalidateIntrospection(opts.connectionId)
    return {
      success: true,
      rows: outcome.rows,
      fields: (outcome.fields ?? []).map((f) => ({
        name: String(f.name),
        dataTypeID: toPgTypeId(f.columnType)
      })),
      rowCount,
      command: detectCommand(opts.sql),
      durationMs: Date.now() - started,
      truncated: outcome.isTruncated
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
    if (isSchemaChanging(opts.sql)) invalidateIntrospection(opts.connectionId)
    return failedQueryResult(message, started)
  } finally {
    inflight.end(opts.queryId)
  }
}

/** Killed from a pooled connection, since the session itself is busy running it. */
export async function cancelQuery(connectionId: string, queryId: string): Promise<void> {
  const threadId = inflight.requestCancel(connectionId, queryId)
  if (threadId == null) return
  const pool = await getPool(connectionId)
  try {
    await pool.query(`KILL QUERY ${Number(threadId)}`)
  } catch (err) {
    console.error('[mysql] cancel failed:', err)
  }
}
