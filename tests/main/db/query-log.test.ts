import { beforeEach, describe, expect, it } from 'vitest'
import { clearQueryLogs, listQueryLogs, recordQuery } from '../../../src/main/db/query-log'

const base = {
  connectionId: 'c1',
  engine: 'postgres' as const,
  sql: 'select 1',
  durationMs: 1,
  success: true
}

beforeEach(() => {
  clearQueryLogs()
})

describe('origin', () => {
  it('defaults to internal, since most callers are introspection', () => {
    // The drivers log every query they issue; only the query editor is the user.
    recordQuery(base)
    expect(listQueryLogs()[0].origin).toBe('internal')
  })

  it('records what the user ran as theirs', () => {
    recordQuery({ ...base, origin: 'user' })
    expect(listQueryLogs()[0].origin).toBe('user')
  })

  it('keeps the two separable', () => {
    recordQuery({ ...base, origin: 'user', sql: 'select * from users' })
    recordQuery({ ...base, sql: 'pragma table_info("users")' })
    recordQuery({ ...base, sql: 'select count(*) from users' })

    const mine = listQueryLogs().filter((e) => e.origin === 'user')
    expect(mine.map((e) => e.sql)).toEqual(['select * from users'])
  })
})

describe('the buffer', () => {
  it('puts the newest first', () => {
    recordQuery({ ...base, sql: 'first' })
    recordQuery({ ...base, sql: 'second' })
    expect(listQueryLogs().map((e) => e.sql)).toEqual(['second', 'first'])
  })

  it('keeps a bounded history rather than growing forever', () => {
    for (let i = 0; i < 250; i++) recordQuery({ ...base, sql: `q${i}` })
    const logs = listQueryLogs()
    expect(logs).toHaveLength(200)
    // The oldest are the ones dropped.
    expect(logs[0].sql).toBe('q249')
  })

  it('hands out a copy, so a caller cannot mutate the log', () => {
    recordQuery(base)
    listQueryLogs().push({ ...listQueryLogs()[0], sql: 'injected' })
    expect(listQueryLogs()).toHaveLength(1)
  })

  it('records a failure with its error', () => {
    recordQuery({ ...base, success: false, error: 'syntax error' })
    const [entry] = listQueryLogs()
    expect(entry.success).toBe(false)
    expect(entry.error).toBe('syntax error')
  })

  it('defaults the optional fields rather than leaving them undefined', () => {
    recordQuery(base)
    const [entry] = listQueryLogs()
    expect(entry.params).toEqual([])
    expect(entry.rowCount).toBeNull()
    expect(entry.ranAt).toBeTruthy()
  })
})
