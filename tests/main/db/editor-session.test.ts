import { describe, expect, it } from 'vitest'
import {
  EditorSessions,
  InflightQueries,
  type SessionAdapter
} from '../../../src/main/db/editor-session'

interface FakeConnection {
  id: number
  isClosed: boolean
  lose: () => void
}

function fakeAdapter(overrides: Partial<SessionAdapter<FakeConnection>> = {}) {
  const opened: FakeConnection[] = []
  const adapter: SessionAdapter<FakeConnection> = {
    open: (_connectionId, onLost) => {
      const connection: FakeConnection = { id: opened.length + 1, isClosed: false, lose: onLost }
      opened.push(connection)
      return { connection, ready: Promise.resolve() }
    },
    close: async (connection) => {
      connection.isClosed = true
    },
    isFatal: (err) => err instanceof Error && err.message === 'fatal',
    ...overrides
  }
  return { adapter, opened }
}

describe('the editor session', () => {
  it('opens lazily and is reused across runs', async () => {
    const { adapter, opened } = fakeAdapter()
    const sessions = new EditorSessions(adapter)
    expect(opened).toHaveLength(0)

    const first = await sessions.run('c1', async (c) => c.id)
    const second = await sessions.run('c1', async (c) => c.id)

    expect([first, second]).toEqual([1, 1])
    expect(opened).toHaveLength(1)
  })

  it('keeps one session per saved connection', async () => {
    const { adapter, opened } = fakeAdapter()
    const sessions = new EditorSessions(adapter)

    await sessions.run('c1', async () => undefined)
    await sessions.run('c2', async () => undefined)

    expect(opened).toHaveLength(2)
  })

  it('runs one at a time, so a cancel always reaches the run it was meant for', async () => {
    const { adapter } = fakeAdapter()
    const sessions = new EditorSessions(adapter)
    const order: string[] = []
    let releaseFirst = (): void => undefined
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = sessions.run('c1', async () => {
      order.push('first:start')
      await firstBlocked
      order.push('first:end')
    })
    const second = sessions.run('c1', async () => {
      order.push('second:start')
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(order).toEqual(['first:start'])

    releaseFirst()
    await Promise.all([first, second])
    expect(order).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('keeps the session after an ordinary error, such as a failed statement', async () => {
    // An aborted transaction is still the user's transaction to roll back.
    const { adapter, opened } = fakeAdapter()
    const sessions = new EditorSessions(adapter)

    await expect(
      sessions.run('c1', async () => {
        throw new Error('syntax error')
      })
    ).rejects.toThrow(/syntax/)
    await sessions.run('c1', async () => undefined)

    expect(opened).toHaveLength(1)
    expect(opened[0].isClosed).toBe(false)
  })

  it('drops the session after a fatal error, so the next run reconnects', async () => {
    const { adapter, opened } = fakeAdapter()
    const sessions = new EditorSessions(adapter)

    await expect(
      sessions.run('c1', async () => {
        throw new Error('fatal')
      })
    ).rejects.toThrow()
    await sessions.run('c1', async () => undefined)

    expect(opened).toHaveLength(2)
    expect(opened[0].isClosed).toBe(true)
  })

  it('drops a session whose connection is lost while idle', async () => {
    const { adapter, opened } = fakeAdapter()
    const sessions = new EditorSessions(adapter)
    await sessions.run('c1', async () => undefined)

    opened[0].lose()
    await sessions.run('c1', async () => undefined)

    expect(opened).toHaveLength(2)
  })

  it('reconnects after a failed connect instead of replaying the failure', async () => {
    let attempts = 0
    const { adapter } = fakeAdapter({
      open: () => {
        attempts += 1
        const ready = attempts === 1 ? Promise.reject(new Error('refused')) : Promise.resolve()
        return { connection: { id: attempts, isClosed: false, lose: () => undefined }, ready }
      }
    })
    const sessions = new EditorSessions(adapter)

    await expect(sessions.run('c1', async () => undefined)).rejects.toThrow(/refused/)
    await expect(sessions.run('c1', async (c) => c.id)).resolves.toBe(2)
  })

  it('closes on disconnect, and the next run opens a fresh one', async () => {
    const { adapter, opened } = fakeAdapter()
    const sessions = new EditorSessions(adapter)
    await sessions.run('c1', async () => undefined)
    await sessions.run('c2', async () => undefined)

    await sessions.close('c1')
    expect(opened[0].isClosed).toBe(true)
    expect(opened[1].isClosed).toBe(false)

    await sessions.closeAll()
    expect(opened[1].isClosed).toBe(true)

    await sessions.run('c1', async () => undefined)
    expect(opened).toHaveLength(3)
  })
})

describe('the in-flight registry', () => {
  it('parks a cancel that arrives before the run has a connection', () => {
    const inflight = new InflightQueries<number>()
    inflight.begin('q1', 'c1')

    expect(inflight.requestCancel('c1', 'q1')).toBeNull()
    expect(inflight.attach('q1', 42), 'the run must not start').toBe(false)
  })

  it('hands back the handle once the run is attached', () => {
    const inflight = new InflightQueries<number>()
    inflight.begin('q1', 'c1')

    expect(inflight.attach('q1', 42)).toBe(true)
    expect(inflight.requestCancel('c1', 'q1')).toBe(42)
  })

  it('ignores a cancel for another connection or an unknown id', () => {
    const inflight = new InflightQueries<number>()
    inflight.begin('q1', 'c1')
    inflight.attach('q1', 42)

    expect(inflight.requestCancel('c2', 'q1')).toBeNull()
    expect(inflight.requestCancel('c1', 'nope')).toBeNull()
  })

  it('forgets a run once it ends', () => {
    const inflight = new InflightQueries<number>()
    inflight.begin('q1', 'c1')
    inflight.attach('q1', 42)
    inflight.end('q1')

    expect(inflight.requestCancel('c1', 'q1')).toBeNull()
  })

  it('lets a run without an id through', () => {
    const inflight = new InflightQueries<number>()
    expect(inflight.attach(undefined, 42)).toBe(true)
  })
})
