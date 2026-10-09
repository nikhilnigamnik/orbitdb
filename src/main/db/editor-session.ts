/**
 * The SQL editor's own connection, one per saved connection, kept apart from
 * the pool the grid, cascade and introspection share.
 *
 * The editor runs whatever the user types. On a pooled client a `BEGIN`, an
 * aborted transaction, `SET ROLE` or a changed `search_path` outlived the run
 * and leaked into whichever grid read drew that client next. A dedicated session
 * keeps that state where the user put it, which is also what makes a
 * transaction spread across several runs behave the way it would in any other
 * SQL client.
 *
 * Runs on one session are serialised here rather than left to the driver's own
 * queue, so that the connection a run is cancelled through is always the one
 * running it: with two runs queued on one backend, cancelling the second would
 * otherwise interrupt the first.
 */

import type { QueryResult } from '../../shared/types'

const QUERY_CANCELLED_MESSAGE = 'Query cancelled'

interface Session<T> {
  connection: T
  ready: Promise<void>
}

export interface SessionAdapter<T> {
  /** Starts connecting. `onLost` fires if the connection dies on its own. */
  open(connectionId: string, onLost: () => void): Session<T>
  close(connection: T): Promise<void>
  /** Whether an error from a run means the connection can no longer be used. */
  isFatal(err: unknown): boolean
}

export class EditorSessions<T> {
  private readonly sessions = new Map<string, Session<T>>()
  private readonly queues = new Map<string, Promise<void>>()
  private readonly adapter: SessionAdapter<T>

  constructor(adapter: SessionAdapter<T>) {
    this.adapter = adapter
  }

  async run<R>(connectionId: string, work: (connection: T) => Promise<R>): Promise<R> {
    const previous = this.queues.get(connectionId) ?? Promise.resolve()
    let release = (): void => undefined
    const turn = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => turn)
    this.queues.set(connectionId, tail)
    await previous
    try {
      const session = this.acquire(connectionId)
      await session.ready
      try {
        return await work(session.connection)
      } catch (err) {
        if (this.adapter.isFatal(err)) await this.discard(connectionId, session)
        throw err
      }
    } finally {
      release()
      if (this.queues.get(connectionId) === tail) this.queues.delete(connectionId)
    }
  }

  async close(connectionId: string): Promise<void> {
    const session = this.sessions.get(connectionId)
    if (session) await this.discard(connectionId, session)
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)))
  }

  private acquire(connectionId: string): Session<T> {
    const existing = this.sessions.get(connectionId)
    if (existing) return existing
    let session: Session<T> | null = null
    const opened = this.adapter.open(connectionId, () => {
      if (session) void this.discard(connectionId, session)
    })
    session = opened
    this.sessions.set(connectionId, opened)
    opened.ready.catch(() => this.discard(connectionId, opened))
    return opened
  }

  private async discard(connectionId: string, session: Session<T>): Promise<void> {
    if (this.sessions.get(connectionId) !== session) return
    this.sessions.delete(connectionId)
    try {
      await this.adapter.close(session.connection)
    } catch (err) {
      console.error(`[editor session ${connectionId}] close failed`, err)
    }
  }
}

interface InflightEntry<H> {
  connectionId: string
  handle: H | null
  isCancelRequested: boolean
}

/**
 * Running editor queries by id, and what to cancel each one through.
 *
 * A query is registered before it has a connection, because a cancel can
 * arrive while it is still waiting for one - the session connecting, or an
 * earlier run ahead of it. That cancel is parked on the entry and honoured the
 * moment the run gets its connection, instead of being dropped because there
 * was nothing to signal yet.
 */
export class InflightQueries<H> {
  private readonly entries = new Map<string, InflightEntry<H>>()

  begin(queryId: string | undefined, connectionId: string): void {
    if (!queryId) return
    this.entries.set(queryId, { connectionId, handle: null, isCancelRequested: false })
  }

  /** False when a cancel arrived first, in which case the run must not start. */
  attach(queryId: string | undefined, handle: H | null): boolean {
    if (!queryId) return true
    const entry = this.entries.get(queryId)
    if (!entry) return true
    if (entry.isCancelRequested) return false
    entry.handle = handle
    return true
  }

  end(queryId: string | undefined): void {
    if (queryId) this.entries.delete(queryId)
  }

  /** The handle to signal now, or null when there is nothing running to signal yet. */
  requestCancel(connectionId: string, queryId: string): H | null {
    const entry = this.entries.get(queryId)
    if (!entry || entry.connectionId !== connectionId) return null
    if (entry.handle == null) {
      entry.isCancelRequested = true
      return null
    }
    return entry.handle
  }
}

export class EditorCancelledError extends Error {
  constructor() {
    super(QUERY_CANCELLED_MESSAGE)
    this.name = 'EditorCancelledError'
  }
}

export function failedQueryResult(error: string, startedAt: number): QueryResult {
  return {
    success: false,
    error,
    rows: [],
    fields: [],
    rowCount: null,
    command: null,
    durationMs: Date.now() - startedAt,
    truncated: false
  }
}
