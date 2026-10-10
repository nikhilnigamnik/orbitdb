import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_QUERY_RESULT_ROWS, type SavedConnection } from '../../../src/shared/types'

interface Gate {
  promise: Promise<void>
  open: () => void
}

interface FakeClientHandle {
  processID: number
  isEnded: boolean
  textQueries: string[]
  emit: (event: string, ...args: unknown[]) => boolean
}

const state = vi.hoisted(() => ({
  poolQueries: [] as { sql: string; params: unknown[] }[],
  /** What ran on a client checked out with `pool.connect()`. */
  clientQueries: [] as { sql: string; params: unknown[] }[],
  connects: 0,
  releases: 0,
  poolConfigs: [] as Record<string, unknown>[],
  clients: [] as FakeClientHandle[],
  cursors: [] as { sql: string; params: unknown[] | undefined }[],
  cursorReads: [] as number[],
  cursorCloses: 0,
  cursorRowCount: 0,
  connectGate: null as Gate | null,
  readGate: null as Gate | null
}))

function gate(): Gate {
  let open = (): void => undefined
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })
  return { promise, open }
}

const SAVED: SavedConnection = {
  id: 'pg-1',
  name: 'pg',
  engine: 'postgres',
  environment: 'dev',
  host: 'db.example.com',
  port: 5432,
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

/** Canned catalogue answers, matched on a fragment of each query. */
function respond(sql: string): Record<string, unknown>[] {
  if (sql.includes('select c.relname as name')) return [{ name: 'users' }]
  if (sql.includes('c.relkind::text as kind')) return [{ kind: 'r', estimated_rows: '10' }]
  if (sql.includes('c.relname as table, a.attname as column')) return []
  if (sql.includes('a.attname as column')) return [{ column: 'id' }]
  if (sql.includes('information_schema.columns') && sql.includes('table_name = $2')) {
    const pgCatalog = { udt_schema: 'pg_catalog', is_identity: 'NO', is_generated: 'NEVER' }
    return [
      { ...pgCatalog, name: 'id', data_type: 'integer', udt_name: 'int4', is_identity: 'YES' },
      { ...pgCatalog, name: 'doc', data_type: 'jsonb', udt_name: 'jsonb' },
      { ...pgCatalog, name: 'tags', data_type: 'json', udt_name: 'json' },
      {
        ...pgCatalog,
        name: 'tag_count',
        data_type: 'integer',
        udt_name: 'int4',
        is_generated: 'ALWAYS'
      }
    ].map((c, i) => ({
      ...c,
      is_nullable: 'YES',
      default_value: null,
      ordinal_position: i + 1,
      character_maximum_length: null
    }))
  }
  if (sql.startsWith('update ') || sql.startsWith('insert ')) return [{ id: 1 }]
  return []
}

vi.mock('pg', async () => {
  const { EventEmitter } = await import('node:events')
  class Pool {
    constructor(config: Record<string, unknown>) {
      state.poolConfigs.push(config)
    }
    on(): this {
      return this
    }
    async query(sql: string, params: unknown[] = []) {
      state.poolQueries.push({ sql, params })
      const rows = respond(sql)
      return { rows, rowCount: rows.length }
    }
    async connect() {
      state.connects += 1
      return {
        async query(sql: string, params: unknown[] = []) {
          state.clientQueries.push({ sql, params })
          const rows = respond(sql)
          return { rows, rowCount: rows.length }
        },
        release(): void {
          state.releases += 1
        }
      }
    }
    end(): Promise<void> {
      return Promise.resolve()
    }
  }
  class Client extends EventEmitter {
    processID = 4242
    isEnded = false
    textQueries: string[] = []
    constructor() {
      super()
      state.clients.push(this)
    }
    async connect(): Promise<void> {
      if (state.connectGate) await state.connectGate.promise
    }
    query(arg: unknown) {
      if (typeof arg !== 'string') return arg
      this.textQueries.push(arg)
      return Promise.resolve([
        { rows: [], fields: [], rowCount: 2, command: 'INSERT' },
        {
          rows: [{ n: 1 }],
          fields: [{ name: 'n', dataTypeID: 23 }],
          rowCount: 1,
          command: 'SELECT'
        }
      ])
    }
    async end(): Promise<void> {
      this.isEnded = true
      this.emit('end')
    }
  }
  return { Pool, Client }
})

vi.mock('pg-cursor', () => ({
  default: class Cursor {
    constructor(sql: string, params?: unknown[]) {
      state.cursors.push({ sql, params })
    }
    read(
      count: number,
      cb: (err: Error | undefined, rows: unknown[], result: Record<string, unknown>) => void
    ): void {
      state.cursorReads.push(count)
      void (async () => {
        if (state.readGate) await state.readGate.promise
        const total = state.cursorRowCount
        const rows = Array.from({ length: Math.min(count, total) }, (_, id) => ({ id }))
        const isComplete = total < count
        cb(undefined, rows, {
          fields: [{ name: 'id', dataTypeID: 23 }],
          rowCount: isComplete ? total : null,
          command: isComplete ? 'SELECT' : ''
        })
      })()
    }
    async close(): Promise<void> {
      state.cursorCloses += 1
    }
  }
}))

type Driver = (typeof import('../../../src/main/db/drivers/postgres'))['postgresDriver']
let driver: Driver

beforeEach(async () => {
  state.poolQueries = []
  state.clientQueries = []
  state.connects = 0
  state.releases = 0
  state.poolConfigs = []
  state.clients = []
  state.cursors = []
  state.cursorReads = []
  state.cursorCloses = 0
  state.cursorRowCount = 0
  state.connectGate = null
  state.readGate = null
  vi.resetModules()
  driver = (await import('../../../src/main/db/drivers/postgres')).postgresDriver
})

function countPool(fragment: string): number {
  return state.poolQueries.filter((q) => q.sql.includes(fragment)).length
}

describe('TLS', () => {
  it('verifies the certificate when the connection asks for it', async () => {
    await driver.listSchemas(SAVED.id)
    expect(state.poolConfigs[0].ssl).toEqual({
      rejectUnauthorized: true,
      servername: 'db.example.com'
    })
  })
})

describe('editor results', () => {
  it('reads one row past the cap and no further', async () => {
    state.cursorRowCount = MAX_QUERY_RESULT_ROWS + 50

    const result = await driver.runQuery({ connectionId: SAVED.id, sql: 'select * from big' })

    expect(state.cursorReads).toEqual([MAX_QUERY_RESULT_ROWS + 1])
    expect(result.rows).toHaveLength(MAX_QUERY_RESULT_ROWS)
    expect(result.truncated).toBe(true)
    expect(result.rowCount).toBe(MAX_QUERY_RESULT_ROWS)
    expect(result.command).toBe('SELECT')
    expect(state.cursorCloses, 'the suspended portal is closed').toBe(1)
  })

  it('reports a result exactly at the cap as complete', async () => {
    state.cursorRowCount = MAX_QUERY_RESULT_ROWS

    const result = await driver.runQuery({ connectionId: SAVED.id, sql: 'select * from t' })

    expect(result.truncated).toBe(false)
    expect(result.rows).toHaveLength(MAX_QUERY_RESULT_ROWS)
  })

  it('keeps the result shape for a small query', async () => {
    state.cursorRowCount = 3

    const result = await driver.runQuery({ connectionId: SAVED.id, sql: 'select id from t' })

    expect(result).toMatchObject({
      success: true,
      rowCount: 3,
      command: 'SELECT',
      truncated: false,
      fields: [{ name: 'id', dataTypeID: 23 }]
    })
  })

  it('sends a batch over the simple protocol, which a cursor cannot carry', async () => {
    const result = await driver.runQuery({
      connectionId: SAVED.id,
      sql: 'insert into t values (1), (2); select 1 as n'
    })

    expect(state.cursors).toHaveLength(0)
    expect(result).toMatchObject({
      success: true,
      rowCount: 3,
      command: 'SELECT',
      rows: [{ n: 1 }]
    })
  })

  it('no longer asks the server for its pid on every run', async () => {
    await driver.runQuery({ connectionId: SAVED.id, sql: 'select 1', queryId: 'q1' })

    expect(state.clients[0].textQueries.some((q) => q.includes('pg_backend_pid'))).toBe(false)
  })
})

describe('the editor session', () => {
  it('runs on its own connection rather than the pool, reused across runs', async () => {
    await driver.runQuery({ connectionId: SAVED.id, sql: 'begin' })
    await driver.runQuery({ connectionId: SAVED.id, sql: 'set search_path = audit' })

    expect(state.clients).toHaveLength(1)
    expect(state.poolQueries, 'nothing the user typed touched the pool').toEqual([])
  })

  it('is closed on disconnect, and the next run reconnects', async () => {
    await driver.runQuery({ connectionId: SAVED.id, sql: 'select 1' })
    await driver.disconnectPool(SAVED.id)
    expect(state.clients[0].isEnded).toBe(true)

    await driver.runQuery({ connectionId: SAVED.id, sql: 'select 1' })
    expect(state.clients).toHaveLength(2)
  })

  it('is dropped when its connection fails, and the next run reconnects', async () => {
    await driver.runQuery({ connectionId: SAVED.id, sql: 'select 1' })
    state.clients[0].emit('error', new Error('Connection terminated unexpectedly'))

    await driver.runQuery({ connectionId: SAVED.id, sql: 'select 1' })
    expect(state.clients).toHaveLength(2)
  })
})

describe('cancelling', () => {
  it('honours a cancel that arrives before the session has connected', async () => {
    state.connectGate = gate()
    const running = driver.runQuery({ connectionId: SAVED.id, sql: 'select 1', queryId: 'q1' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    await driver.cancelQuery(SAVED.id, 'q1')
    state.connectGate.open()
    const result = await running

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/cancelled/i)
    expect(state.cursors, 'the query never started').toHaveLength(0)
    expect(countPool('pg_cancel_backend')).toBe(0)
  })

  it('keeps the session when the cancel lands before the run attached', async () => {
    // The cancel is raised by this app before anything reached the socket. It
    // carries no severity, which used to read as fatal and end the session -
    // rolling back whatever transaction the user had open on it.
    state.connectGate = gate()
    const running = driver.runQuery({ connectionId: SAVED.id, sql: 'select 1', queryId: 'q1' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await driver.cancelQuery(SAVED.id, 'q1')
    state.connectGate.open()
    await running

    expect(state.clients).toHaveLength(1)
    expect(state.clients[0].isEnded, 'the session survives its own cancel').toBe(false)

    await driver.runQuery({ connectionId: SAVED.id, sql: 'select 2' })
    expect(state.clients, 'the next run reuses the session').toHaveLength(1)
  })

  it('signals the session backend once the query is running', async () => {
    state.readGate = gate()
    const running = driver.runQuery({ connectionId: SAVED.id, sql: 'select 1', queryId: 'q1' })
    await vi.waitFor(() => expect(state.cursorReads).toHaveLength(1))

    await driver.cancelQuery(SAVED.id, 'q1')
    state.readGate.open()
    await running

    const cancel = state.poolQueries.find((q) => q.sql.includes('pg_cancel_backend'))
    expect(cancel?.params).toEqual([4242])
  })
})

describe('introspection', () => {
  it("reports identity and generated columns as the database's own", async () => {
    // An identity column has no column_default, so the seed feature's
    // default-expression check never saw it: GENERATED ALWAYS rejected every
    // row the model supplied an id for.
    const details = await driver.tableDetails(SAVED.id, 'public', 'users')

    const flags = Object.fromEntries(details.columns.map((c) => [c.name, c.isAutoGenerated]))
    expect(flags).toEqual({ id: true, doc: false, tags: false, tag_count: true })
    const columnsQuery = state.poolQueries.find(
      (q) => q.sql.includes('information_schema.columns') && q.sql.includes('table_name = $2')
    )
    expect(columnsQuery?.sql).toContain('is_identity')
    expect(columnsQuery?.sql).toContain('is_generated')
  })
})

describe('introspection caching', () => {
  it('runs one introspection for two concurrent first callers', async () => {
    const [a, b] = await Promise.all([
      driver.tableDetails(SAVED.id, 'public', 'users'),
      driver.tableDetails(SAVED.id, 'public', 'users')
    ])

    expect(a).toBe(b)
    expect(countPool('c.relkind::text as kind')).toBe(1)
  })

  it('caches the schema graph until something may have changed the schema', async () => {
    const loads = (): number => countPool('select c.relname as name')
    await driver.getSchemaGraph(SAVED.id, 'public')
    await driver.getSchemaGraph(SAVED.id, 'public')
    expect(loads()).toBe(1)

    await driver.runQuery({ connectionId: SAVED.id, sql: 'select 1' })
    await driver.getSchemaGraph(SAVED.id, 'public')
    expect(loads(), 'a read leaves it').toBe(1)

    await driver.runQuery({ connectionId: SAVED.id, sql: 'create table t (id int)' })
    await driver.getSchemaGraph(SAVED.id, 'public')
    expect(loads(), 'DDL in the editor drops it').toBe(2)

    await driver.runQuery({ connectionId: SAVED.id, sql: 'commit' })
    await driver.getSchemaGraph(SAVED.id, 'public')
    expect(loads(), 'so does the commit that publishes it').toBe(3)

    await driver.executeDdl({
      connectionId: SAVED.id,
      schema: 'public',
      table: 'users',
      operation: { kind: 'drop-column', name: 'doc' }
    })
    await driver.getSchemaGraph(SAVED.id, 'public')
    expect(loads(), 'and the structure editor').toBe(4)

    await driver.disconnectPool(SAVED.id)
    await driver.getSchemaGraph(SAVED.id, 'public')
    expect(loads(), 'and disconnecting').toBe(5)
  })
})

describe('cascade delete', () => {
  it('logs every statement of the transaction, once, from the checked-out client', async () => {
    // Same registry as the driver's own import: both follow the resetModules above.
    const { listQueryLogs } = await import('../../../src/main/db/query-log')

    await driver.cascadeDelete({
      connectionId: SAVED.id,
      schema: 'public',
      table: 'users',
      pks: [{ id: 1 }]
    })

    const ran = state.clientQueries.map((q) => q.sql)
    expect(ran[0]).toBe('begin')
    expect(ran.at(-1)).toBe('commit')
    expect(ran.some((sql) => sql.includes('for update'))).toBe(true)
    expect(ran.filter((sql) => sql.startsWith('delete from'))).toHaveLength(1)
    expect(
      state.poolQueries.some((q) => q.sql.startsWith('delete from')),
      'the pool never saw the delete'
    ).toBe(false)

    // Oldest first, and exactly what the client ran: nothing missing, nothing twice.
    const logged = listQueryLogs()
      .filter((entry) => ran.includes(entry.sql))
      .map((entry) => entry.sql)
      .reverse()
    expect(logged).toEqual(ran)
    expect(listQueryLogs().filter((entry) => entry.sql.startsWith('delete from'))).toHaveLength(1)
    expect(state.releases, 'the client went back to the pool').toBe(1)
  })

  it('refuses an all-NULL key before taking a client, rather than locking on an empty IN', async () => {
    await expect(
      driver.cascadeDelete({
        connectionId: SAVED.id,
        schema: 'public',
        table: 'users',
        pks: [{ id: null }]
      })
    ).rejects.toThrow(/no primary key values to start from/)

    expect(state.connects).toBe(0)
  })
})

describe('writing JSON columns', () => {
  it('serialises an object or array headed for json/jsonb before binding it', async () => {
    // What an undo sends back: the value exactly as node-pg parsed it.
    await driver.updateRow({
      connectionId: SAVED.id,
      schema: 'public',
      table: 'users',
      values: { doc: { a: 1 }, tags: [1, 2] },
      pk: { id: 1 }
    })

    const update = state.poolQueries.find((q) => q.sql.startsWith('update '))
    expect(update?.params).toEqual(['{"a":1}', '[1,2]', 1])
  })

  it('does the same on insert, which is how a deleted row comes back', async () => {
    await driver.insertRow({
      connectionId: SAVED.id,
      schema: 'public',
      table: 'users',
      values: { id: 7, doc: [{ nested: true }] }
    })

    const insert = state.poolQueries.find((q) => q.sql.startsWith('insert '))
    expect(insert?.params).toEqual([7, '[{"nested":true}]'])
  })
})
