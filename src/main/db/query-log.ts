import { randomUUID } from 'node:crypto'
import type { DatabaseEngine, QueryLogEntry, QueryOrigin } from '../../shared/types'

const MAX_ENTRIES = 200

const buffer: QueryLogEntry[] = []

interface RecordOptions {
  /** Defaults to internal: most callers are the app's own introspection. */
  origin?: QueryOrigin
  connectionId: string
  engine: DatabaseEngine
  sql: string
  params?: unknown[]
  durationMs: number
  rowCount?: number | null
  success: boolean
  error?: string
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
