import { Types } from 'mysql2'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_QUERY_RESULT_ROWS, type SavedConnection } from '../../../src/shared/types'

interface FakeConnectionHandle {
  threadId: number
  isEnded: boolean
  emit: (event: string, ...args: unknown[]) => boolean
}

interface FakeField {
  name: string
  columnType: number
}

/** What a query on the editor session emits, in mysql2's own event order. */
type Script =
  | { kind: 'rows'; count: number; fields?: FakeField[] }
  | { kind: 'ok'; affectedRows: number }

const state = vi.hoisted(() => ({
  poolQueries: [] as { sql: string; params: unknown[] }[],
  poolConfigs: [] as Record<string, unknown>[],
  connections: [] as FakeConnectionHandle[],
  script: { kind: 'rows', count: 0 } as Script,
  queriesStarted: 0,
  queryGate: null as Promise<void> | null
}))

const SAVED: SavedConnection = {
  id: 'my-1',
  name: 'mysql',
  engine: 'mysql',
  environment: 'dev',
  host: 'db.example.com',
  port: 3306,
  database: 'app',
  user: 'app',
  password: 'secret',
  ssl: true,
  sslVerify: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

vi.mock('../../../src/main/store/connections-store', () => ({
  requireConnection: () => SAVED,
  getConnection: () => SAVED
}))

function respond(sql: string): unknown {
  if (sql.includes('information_schema.tables') && sql.includes('limit 1')) {
    return [{ table_type: 'BASE TABLE', estimated_rows: 1 }]
  }
  if (sql.includes("index_name = 'PRIMARY'")) return [{ column_name: 'id' }]
  if (sql.includes('information_schema.columns')) {
    return [
      { name: 'id', data_type: 'int', column_type: 'int', extra: 'auto_increment' },
      { name: 'doc', data_type: 'json', column_type: 'json', extra: '' },
      {
        name: 'total',
        data_type: 'decimal',
        column_type: 'decimal(10,2)',
        extra: 'STORED GENERATED'
      },
      {
        name: 'created_at',
        data_type: 'timestamp',
        column_type: 'timestamp',
        extra: 'DEFAULT_GENERATED'
      },
      {
        name: 'updated_at',
        data_type: 'timestamp',
        column_type: 'timestamp',
        extra: 'on update CURRENT_TIMESTAMP'
      }
    ].map((c, i) => ({
      ...c,
      is_nullable: 'YES',
      default_value: null,
      ordinal_position: i + 1,
      character_maximum_length: null
    }))
  }
  if (sql.startsWith('update ')) return { affectedRows: 1 }
  if (sql.startsWith('select * from')) return [{ id: 1 }]
  return []
}

vi.mock('mysql2/promise', () => ({
  default: {
    createPool: (config: Record<string, unknown>) => {
      state.poolConfigs.push(config)
      return {
        async query(sql: string, params: unknown[] = []) {
          state.poolQueries.push({ sql, params })
          return [respond(sql), []]
        },
        end: () => Promise.resolve()
      }
    }
  }
}))

vi.mock('mysql2', async (importOriginal) => {
  const { EventEmitter } = await import('node:events')
  class Connection extends EventEmitter {
    threadId = 77
    isEnded = false
    connect(cb: (err: Error | null) => void): void {
      setImmediate(() => cb(null))
    }
    query(): InstanceType<typeof EventEmitter> {
      const query = new EventEmitter()
      const script = state.script
      state.queriesStarted += 1
      void (async () => {
        await (state.queryGate ?? Promise.resolve())
        if (script.kind === 'ok') {
          query.emit('fields', undefined)
          query.emit('result', { affectedRows: script.affectedRows })
        } else {
          query.emit('fields', script.fields ?? [{ name: 'id', columnType: 3 }])
          for (let id = 0; id < script.count; id += 1) query.emit('result', { id }, 0)
        }
        query.emit('end')
      })()
      return query
    }
    end(cb: (err: Error | null) => void): void {
      this.isEnded = true
      cb(null)
    }
    destroy(): void {
      this.isEnded = true
    }
  }
  return {
    createConnection: () => {
      const connection = new Connection()
  // The real type constants, so the field mapping is checked against mysql2's
  // own numbers rather than a copy of them.
  const { Types } = await importOriginal<typeof import('mysql2')>()
      state.connections.push(connection)
      return connection
    }
  }
})

type Driver = (typeof import('../../../src/main/db/drivers/mysql'))['mysqlDriver']
let driver: Driver

beforeEach(async () => {
  state.poolQueries = []
  state.poolConfigs = []
  state.connections = []
  state.script = { kind: 'rows', count: 0 }
  state.queriesStarted = 0
  state.queryGate = null
  vi.resetModules()
  driver = (await import('../../../src/main/db/drivers/mysql')).mysqlDriver
})

describe('TLS', () => {
  it('checks the chain and the host name when the connection asks for it', async () => {
    await driver.listSchemas(SAVED.id)
    expect(state.poolConfigs[0].ssl).toEqual({ rejectUnauthorized: true, verifyIdentity: true })
  })
})

describe('editor results', () => {
  it('keeps the rows up to the cap and drops the rest as they stream in', async () => {
    state.script = { kind: 'rows', count: MAX_QUERY_RESULT_ROWS + 25 }

    const result = await driver.runQuery({ connectionId: SAVED.id, sql: 'select * from big' })
    Types,

    expect(result.rows).toHaveLength(MAX_QUERY_RESULT_ROWS)
    expect(result.truncated).toBe(true)
    // An integer has no rendering of its own, so its type id is dropped.
    expect(result.fields).toEqual([{ name: 'id', dataTypeID: 0 }])
  })

  it('reports field types as the Postgres OIDs the renderer reads, not mysql2 numbers', async () => {
    // mysql2's own ids collide with the OIDs: BIT is 16, the bool OID, so a
    // bit column was drawn with a tick over its bytes.
    expect(Types.BIT).toBe(16)
    state.script = {
      kind: 'rows',
      count: 1,
      fields: [
        { name: 'flags', columnType: Types.BIT },
        { name: 'born', columnType: Types.DATE },
        { name: 'seen', columnType: Types.DATETIME },
        { name: 'at', columnType: Types.TIMESTAMP },
        { name: 'doc', columnType: Types.JSON },
        { name: 'n', columnType: Types.LONG }
      ]
    }

    const result = await driver.runQuery({ connectionId: SAVED.id, sql: 'select * from t' })

    expect(result.fields).toEqual([
      { name: 'flags', dataTypeID: 0 },
      { name: 'born', dataTypeID: 1082 },
      { name: 'seen', dataTypeID: 1114 },
      { name: 'at', dataTypeID: 1114 },
      { name: 'doc', dataTypeID: 114 },
      { name: 'n', dataTypeID: 0 }
    ])
  })

  it('reports a result exactly at the cap as complete', async () => {
    state.script = { kind: 'rows', count: MAX_QUERY_RESULT_ROWS }

    const result = await driver.runQuery({ connectionId: SAVED.id, sql: 'select * from t' })

    expect(result.truncated).toBe(false)
    expect(result.rowCount).toBe(MAX_QUERY_RESULT_ROWS)
  })

  it('reports affected rows and no fields for a statement without a row set', async () => {
    state.script = { kind: 'ok', affectedRows: 4 }

    const result = await driver.runQuery({ connectionId: SAVED.id, sql: 'update t set a = 1' })

    expect(result).toMatchObject({ success: true, rowCount: 4, fields: [], command: 'UPDATE' })
  })

  it('runs on one dedicated connection, reused across runs and closed on disconnect', async () => {
    await driver.runQuery({ connectionId: SAVED.id, sql: 'start transaction' })
    await driver.runQuery({ connectionId: SAVED.id, sql: 'select 1' })
    expect(state.connections).toHaveLength(1)
    expect(state.poolQueries).toEqual([])

    await driver.disconnectPool(SAVED.id)
    expect(state.connections[0].isEnded).toBe(true)
  })

  it('kills the running query by the session thread id', async () => {
    let finish = (): void => undefined
    state.queryGate = new Promise<void>((resolve) => {
      finish = resolve
    })
    state.script = { kind: 'rows', count: 1 }
    const running = driver.runQuery({ connectionId: SAVED.id, sql: 'select 1', queryId: 'q1' })
    await vi.waitFor(() => expect(state.queriesStarted).toBe(1))

    await driver.cancelQuery(SAVED.id, 'q1')
    finish()
    await running

    expect(state.poolQueries.map((q) => q.sql)).toContain('KILL QUERY 77')
  })
})

describe('writing JSON columns', () => {
  it('serialises an object headed for a json column instead of sending [object Object]', async () => {
    await driver.updateRow({
      connectionId: SAVED.id,
      schema: 'app',
      table: 'docs',
      values: { doc: { a: [1, 2] } },
      pk: { id: 1 }
    })

    const update = state.poolQueries.find((q) => q.sql.startsWith('update '))
    expect(update?.params).toEqual(['{"a":[1,2]}', 1])
  })
})
describe('introspection', () => {
  it('reads `extra` to report the columns the database supplies itself', async () => {
    // auto_increment never appears in column_default, which is where the seed
    // feature looked - so the model invented ids and INSERT IGNORE dropped
    // every duplicate as "Added 0 rows". A column that only updates itself
    // (`on update CURRENT_TIMESTAMP` with no default) still needs a value.
    const details = await driver.tableDetails(SAVED.id, 'app', 'docs')

    const flags = Object.fromEntries(details.columns.map((c) => [c.name, c.isAutoGenerated]))
    expect(flags).toEqual({
      id: true,
      doc: false,
      total: true,
      created_at: true,
      updated_at: false
    })
    const columnsQuery = state.poolQueries.find((q) => q.sql.includes('information_schema.columns'))
    expect(columnsQuery?.sql).toMatch(/\bextra\b/)
  })
})

