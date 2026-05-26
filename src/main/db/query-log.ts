import { randomUUID } from 'node:crypto'
import type { DatabaseEngine, QueryLogEntry } from '../../shared/types'

const MAX_ENTRIES = 200

const buffer: QueryLogEntry[] = []

interface RecordOptions {
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

export async function trackQuery<T>(
  meta: { connectionId: string; engine: DatabaseEngine; sql: string; params?: unknown[] },
  fn: () => Promise<T>,
  rowCountFrom?: (result: T) => number | null
): Promise<T> {
  const t0 = Date.now()
  try {
    const res = await fn()
    recordQuery({
      ...meta,
      durationMs: Date.now() - t0,
      rowCount: rowCountFrom ? (rowCountFrom(res) ?? null) : null,
      success: true
    })
    return res
  } catch (err) {
    recordQuery({
      ...meta,
      durationMs: Date.now() - t0,
      success: false,
      error: err instanceof Error ? err.message : String(err)
    })
    throw err
  }
}
