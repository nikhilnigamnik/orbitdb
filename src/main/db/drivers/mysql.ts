import mysql, {
  type Pool,
  type PoolOptions,
  type RowDataPacket,
  type ResultSetHeader
} from 'mysql2/promise'
import {
  MAX_QUERY_RESULT_ROWS,
  type ColumnInfo,
  type ConnectionInput,
  type DistinctValuesOptions,
  type ForeignKeyInfo,
  type GetRowsOptions,
  type IndexInfo,
  type QueryResult,
  type RowDelete,
  type RowMutation,
  type RowUpdate,
  type RowsResult,
  type RunQueryOptions,
  type SavedConnection,
  type SchemaGraph,
  type SchemaGraphEdge,
  type SchemaGraphTable,
  type SchemaInfo,
  type TableDetails,
  type TableInfo,
  type TestConnectionResult
} from '../../../shared/types'
import { getConnection } from '../../store/connections-store'
import { recordQuery } from '../query-log'
import type { ActiveMeta, DatabaseDriver } from './types'

const pools = new Map<string, Pool>()
const tableDetailsCache = new Map<string, TableDetails>()

function tableCacheKey(connectionId: string, schema: string, table: string): string {
  return `${connectionId} ${schema} ${table}`
}

function invalidateTableDetailsForConnection(connectionId: string): void {
  const prefix = `${connectionId} `
  for (const key of tableDetailsCache.keys()) {
    if (key.startsWith(prefix)) tableDetailsCache.delete(key)
  }
}

function toPoolConfig(input: ConnectionInput): PoolOptions {
  return {
    host: input.host,
    port: input.port,
    database: input.database || undefined,
    user: input.user,
    password: input.password,
    ssl: input.ssl ? { rejectUnauthorized: false } : undefined,
    connectionLimit: 5,
    connectTimeout: 8_000,
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: true
  }
}

function getPool(connectionId: string): Pool {
  const existing = pools.get(connectionId)
  if (existing) return existing
  const saved = getConnection(connectionId)
  if (!saved) throw new Error(`Connection ${connectionId} is not saved`)
  if (saved.engine !== 'mysql') throw new Error(`Wrong driver for connection ${connectionId}`)
  const pool = mysql.createPool(toPoolConfig(saved))
  instrumentMysqlPool(pool, connectionId)
  pools.set(connectionId, pool)
  return pool
}

function instrumentMysqlPool(pool: Pool, connectionId: string): void {
  const original = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>
  ;(pool as unknown as { query: unknown }).query = async function patched(
    ...args: unknown[]
  ): Promise<unknown> {
    const sql = typeof args[0] === 'string' ? (args[0] as string) : ''
    const params = (args[1] as unknown[] | undefined) ?? []
    const t0 = Date.now()
    try {
      const res = (await original(...args)) as unknown
      let rowCount: number | null = null
      if (Array.isArray(res) && res[0] && typeof res[0] === 'object') {
        const head = res[0] as { affectedRows?: number; length?: number }
        rowCount =
          typeof head.affectedRows === 'number'
            ? head.affectedRows
            : typeof head.length === 'number'
              ? head.length
              : null
      }
      recordQuery({
        connectionId,
        engine: 'mysql',
        sql,
        params,
        durationMs: Date.now() - t0,
        rowCount,
        success: true
      })
      return res
    } catch (err) {
      recordQuery({
        connectionId,
        engine: 'mysql',
        sql,
        params,
        durationMs: Date.now() - t0,
        success: false,
        error: err instanceof Error ? err.message : String(err)
      })
      throw err
    }
  }
}

async function disconnectPool(connectionId: string): Promise<void> {
  const pool = pools.get(connectionId)
  invalidateTableDetailsForConnection(connectionId)
  if (!pool) return
  pools.delete(connectionId)
  try {
    await pool.end()
  } catch (err) {
    console.error(`[mysql pool ${connectionId}] end failed`, err)
  }
}

async function disconnectAll(): Promise<void> {
  const ids = [...pools.keys()]
  await Promise.all(ids.map((id) => disconnectPool(id)))
}

async function test(input: ConnectionInput): Promise<TestConnectionResult> {
  let pool: Pool | null = null
  try {
    pool = mysql.createPool({ ...toPoolConfig(input), connectionLimit: 1 })
    instrumentMysqlPool(pool, '<test>')
    const [rows] = await pool.query<RowDataPacket[]>('select version() as version')
    return { success: true, serverVersion: String(rows[0]?.version ?? '') }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    if (pool) await pool.end().catch(() => undefined)
  }
}

async function describeActive(saved: SavedConnection): Promise<ActiveMeta> {
  const pool = getPool(saved.id)
  const [rows] = await pool.query<RowDataPacket[]>(
    'select version() as version, database() as db, current_user() as user'
  )
  const row = rows[0] ?? {}
  return {
    serverVersion: String(row.version ?? ''),
    currentDatabase: String(row.db ?? saved.database),
    currentUser: String(row.user ?? saved.user)
  }
}

const SYSTEM_SCHEMAS = new Set(['mysql', 'information_schema', 'performance_schema', 'sys'])

async function listSchemas(connectionId: string): Promise<SchemaInfo[]> {
  const pool = getPool(connectionId)
  const [rows] = await pool.query<RowDataPacket[]>(
    'select schema_name as name from information_schema.schemata order by schema_name'
  )
  return rows.map((r) => ({ name: String(r.name) })).filter((r) => !SYSTEM_SCHEMAS.has(r.name))
}

async function listTables(connectionId: string, schema: string): Promise<TableInfo[]> {
  const pool = getPool(connectionId)
  const [rows] = await pool.query<RowDataPacket[]>(
    `select table_schema as \`schema\`,
            table_name as name,
            table_type as table_type,
            table_rows as estimated_rows
       from information_schema.tables
      where table_schema = ?
      order by table_name`,
    [schema]
  )
  return rows.map((r) => {
    const type: TableInfo['type'] = r.table_type === 'VIEW' ? 'view' : 'table'
    const est = r.estimated_rows == null ? null : Number(r.estimated_rows)
    return {
      schema: String(r.schema),
      name: String(r.name),
      type,
      estimatedRows: Number.isFinite(est ?? NaN) ? est : null
    }
  })
}

function normalizeUdtName(dataType: string, columnType: string): string {
  const dt = dataType.toLowerCase()
  if (dt === 'json') return 'json'
  if (dt === 'tinyint' && columnType.toLowerCase() === 'tinyint(1)') return 'bool'
  if (['int', 'bigint', 'smallint', 'mediumint', 'tinyint'].includes(dt)) return 'int4'
  if (['decimal', 'numeric'].includes(dt)) return 'numeric'
  if (['float', 'double', 'real'].includes(dt)) return 'float8'
  return dt
}

async function tableDetails(
  connectionId: string,
  schema: string,
  table: string
): Promise<TableDetails> {
  const cacheKey = tableCacheKey(connectionId, schema, table)
  const cached = tableDetailsCache.get(cacheKey)
  if (cached) return cached

  const pool = getPool(connectionId)

  const [tableMeta] = await pool.query<RowDataPacket[]>(
    `select table_type as table_type, table_rows as estimated_rows
       from information_schema.tables
      where table_schema = ? and table_name = ?
      limit 1`,
    [schema, table]
  )
  if (tableMeta.length === 0) {
    throw new Error(`Table ${schema}.${table} not found`)
  }
  const type: TableDetails['type'] = tableMeta[0].table_type === 'VIEW' ? 'view' : 'table'
  const estimatedRows =
    tableMeta[0].estimated_rows == null ? null : Number(tableMeta[0].estimated_rows)

  const [pkRows] = await pool.query<RowDataPacket[]>(
    `select column_name as column_name
       from information_schema.statistics
      where table_schema = ? and table_name = ? and index_name = 'PRIMARY'
      order by seq_in_index`,
    [schema, table]
  )
  const primaryKey = pkRows.map((r) => String(r.column_name))

  const [colRows] = await pool.query<RowDataPacket[]>(
    `select column_name as name,
            data_type as data_type,
            column_type as column_type,
            is_nullable as is_nullable,
            column_default as default_value,
            ordinal_position as ordinal_position,
            character_maximum_length as character_maximum_length
       from information_schema.columns
      where table_schema = ? and table_name = ?
      order by ordinal_position`,
    [schema, table]
  )
  const pkSet = new Set(primaryKey)
  const columns: ColumnInfo[] = colRows.map((r) => ({
    name: String(r.name),
    dataType: String(r.column_type),
    udtName: normalizeUdtName(String(r.data_type), String(r.column_type)),
    isNullable: r.is_nullable === 'YES',
    isPrimaryKey: pkSet.has(String(r.name)),
    defaultValue: r.default_value == null ? null : String(r.default_value),
    ordinalPosition: Number(r.ordinal_position),
    characterMaximumLength:
      r.character_maximum_length == null ? null : Number(r.character_maximum_length)
  }))

  const [idxRows] = await pool.query<RowDataPacket[]>(
    `select index_name as name,
            max(non_unique) as non_unique,
            group_concat(column_name order by seq_in_index separator ',') as columns
       from information_schema.statistics
      where table_schema = ? and table_name = ?
      group by index_name
      order by index_name`,
    [schema, table]
  )
  const indexes: IndexInfo[] = idxRows.map((r) => {
    const name = String(r.name)
    const cols = String(r.columns ?? '')
      .split(',')
      .filter(Boolean)
    return {
      name,
      isUnique: Number(r.non_unique) === 0,
      isPrimary: name === 'PRIMARY',
      columns: cols,
      definition: ''
    }
  })

  const [fkRows] = await pool.query<RowDataPacket[]>(
    `select kcu.constraint_name as name,
            group_concat(kcu.column_name order by kcu.ordinal_position separator ',') as columns,
            kcu.referenced_table_schema as referenced_schema,
            kcu.referenced_table_name as referenced_table,
            group_concat(kcu.referenced_column_name order by kcu.ordinal_position separator ',') as referenced_columns,
            rc.delete_rule as on_delete,
            rc.update_rule as on_update
       from information_schema.key_column_usage kcu
       join information_schema.referential_constraints rc
         on rc.constraint_schema = kcu.constraint_schema
        and rc.constraint_name = kcu.constraint_name
      where kcu.table_schema = ?
        and kcu.table_name = ?
        and kcu.referenced_table_name is not null
      group by kcu.constraint_name,
               kcu.referenced_table_schema,
               kcu.referenced_table_name,
               rc.delete_rule,
               rc.update_rule
      order by kcu.constraint_name`,
    [schema, table]
  )
  const foreignKeys: ForeignKeyInfo[] = fkRows.map((r) => ({
    name: String(r.name),
    columns: String(r.columns ?? '')
      .split(',')
      .filter(Boolean),
    referencedSchema: String(r.referenced_schema),
    referencedTable: String(r.referenced_table),
    referencedColumns: String(r.referenced_columns ?? '')
      .split(',')
      .filter(Boolean),
    onDelete: String(r.on_delete ?? 'NO ACTION'),
    onUpdate: String(r.on_update ?? 'NO ACTION')
  }))

  const result: TableDetails = {
    schema,
    name: table,
    type,
    columns,
    primaryKey,
    indexes,
    foreignKeys,
    estimatedRows: Number.isFinite(estimatedRows ?? NaN) ? estimatedRows : null
  }
  tableDetailsCache.set(cacheKey, result)
  return result
}

function quoteIdent(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`'
}

function qualifiedTable(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`
}

const ALLOWED_OPERATORS = new Set([
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'like',
  'ilike',
  'is null',
  'is not null'
])

async function getRows(opts: GetRowsOptions): Promise<RowsResult> {
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  const validColumns = new Set(details.columns.map((c) => c.name))

  const params: unknown[] = []
  const whereClauses: string[] = []
  for (const filter of opts.filters ?? []) {
    if (!validColumns.has(filter.column)) continue
    if (!ALLOWED_OPERATORS.has(filter.operator)) continue
    if (filter.operator === 'is null') {
      whereClauses.push(`${quoteIdent(filter.column)} is null`)
    } else if (filter.operator === 'is not null') {
      whereClauses.push(`${quoteIdent(filter.column)} is not null`)
    } else if (filter.value != null) {
      const op = filter.operator === 'ilike' ? 'like' : filter.operator
      params.push(filter.value)
      whereClauses.push(`${quoteIdent(filter.column)} ${op} ?`)
    }
  }
  const whereSql = whereClauses.length > 0 ? `where ${whereClauses.join(' and ')}` : ''

  let orderSql = ''
  if (opts.orderBy && validColumns.has(opts.orderBy)) {
    const dir = opts.orderDir === 'desc' ? 'desc' : 'asc'
    orderSql = `order by ${quoteIdent(opts.orderBy)} ${dir}`
  } else if (details.primaryKey.length > 0) {
    orderSql = `order by ${details.primaryKey.map(quoteIdent).join(', ')}`
  }

  const limit = Math.max(1, Math.min(opts.limit ?? 100, 1000))
  const offset = Math.max(0, opts.offset ?? 0)

  const pool = getPool(opts.connectionId)
  const sql = `select * from ${qualifiedTable(opts.schema, opts.table)} ${whereSql} ${orderSql} limit ${limit} offset ${offset}`
  const [rows] = await pool.query<RowDataPacket[]>(sql, params)

  return {
    rows: rows as unknown as Record<string, unknown>[],
    columns: details.columns,
    totalEstimate: details.estimatedRows
  }
}

async function fetchByPk(
  connectionId: string,
  schema: string,
  table: string,
  pk: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const pool = getPool(connectionId)
  const keys = Object.keys(pk)
  if (keys.length === 0) throw new Error('Cannot fetch row without primary key')
  const where = keys.map((k) => `${quoteIdent(k)} = ?`).join(' and ')
  const sql = `select * from ${qualifiedTable(schema, table)} where ${where} limit 1`
  const [rows] = await pool.query<RowDataPacket[]>(
    sql,
    keys.map((k) => pk[k])
  )
  return (rows[0] ?? {}) as Record<string, unknown>
}

async function insertRow(opts: RowMutation): Promise<Record<string, unknown>> {
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  const validColumns = new Map(details.columns.map((c) => [c.name, c]))

  const cols: string[] = []
  const values: unknown[] = []
  for (const [key, value] of Object.entries(opts.values)) {
    if (!validColumns.has(key)) continue
    cols.push(quoteIdent(key))
    values.push(value)
  }
  if (cols.length === 0) throw new Error('No valid columns to insert')

  const pool = getPool(opts.connectionId)
  const sql = `insert into ${qualifiedTable(opts.schema, opts.table)} (${cols.join(', ')}) values (${cols.map(() => '?').join(', ')})`
  const [result] = await pool.query<ResultSetHeader>(sql, values)

  // Resolve PK to fetch the inserted row back
  const pk: Record<string, unknown> = {}
  if (details.primaryKey.length === 1) {
    const pkCol = details.primaryKey[0]
    if (opts.values[pkCol] != null) {
      pk[pkCol] = opts.values[pkCol]
    } else if (result.insertId) {
      pk[pkCol] = result.insertId
    }
  } else {
    for (const pkCol of details.primaryKey) {
      if (opts.values[pkCol] != null) pk[pkCol] = opts.values[pkCol]
    }
  }
  if (Object.keys(pk).length === details.primaryKey.length && details.primaryKey.length > 0) {
    return fetchByPk(opts.connectionId, opts.schema, opts.table, pk)
  }
  return {}
}

async function updateRow(opts: RowUpdate): Promise<Record<string, unknown>> {
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  const validColumns = new Set(details.columns.map((c) => c.name))
  if (details.primaryKey.length === 0) {
    throw new Error(`Cannot update rows on ${opts.schema}.${opts.table}: no primary key`)
  }

  const setClauses: string[] = []
  const params: unknown[] = []
  for (const [key, value] of Object.entries(opts.values)) {
    if (!validColumns.has(key)) continue
    setClauses.push(`${quoteIdent(key)} = ?`)
    params.push(value)
  }
  if (setClauses.length === 0) throw new Error('No columns to update')

  const whereClauses: string[] = []
  for (const pkCol of details.primaryKey) {
    if (!(pkCol in opts.pk)) throw new Error(`Missing primary key column ${pkCol}`)
    whereClauses.push(`${quoteIdent(pkCol)} = ?`)
    params.push(opts.pk[pkCol])
  }

  const pool = getPool(opts.connectionId)
  const sql = `update ${qualifiedTable(opts.schema, opts.table)} set ${setClauses.join(', ')} where ${whereClauses.join(' and ')}`
  const [result] = await pool.query<ResultSetHeader>(sql, params)
  if (result.affectedRows === 0) throw new Error('No row matched the primary key')

  // Fetch updated row — use new PK values if they were part of the update set
  const newPk: Record<string, unknown> = {}
  for (const pkCol of details.primaryKey) {
    newPk[pkCol] = opts.values[pkCol] != null ? opts.values[pkCol] : opts.pk[pkCol]
  }
  return fetchByPk(opts.connectionId, opts.schema, opts.table, newPk)
}

async function deleteRow(opts: RowDelete): Promise<{ deleted: number }> {
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  if (details.primaryKey.length === 0) {
    throw new Error(`Cannot delete rows on ${opts.schema}.${opts.table}: no primary key`)
  }
  const params: unknown[] = []
  const whereClauses: string[] = []
  for (const pkCol of details.primaryKey) {
    if (!(pkCol in opts.pk)) throw new Error(`Missing primary key column ${pkCol}`)
    whereClauses.push(`${quoteIdent(pkCol)} = ?`)
    params.push(opts.pk[pkCol])
  }
  const pool = getPool(opts.connectionId)
  const sql = `delete from ${qualifiedTable(opts.schema, opts.table)} where ${whereClauses.join(' and ')}`
  const [result] = await pool.query<ResultSetHeader>(sql, params)
  return { deleted: result.affectedRows ?? 0 }
}

function detectCommand(sql: string): string | null {
  const trimmed = sql.trim().split(/\s+/)[0]
  return trimmed ? trimmed.toUpperCase() : null
}

interface MysqlInflight {
  threadId: number
  connectionId: string
}
const mysqlInflight = new Map<string, MysqlInflight>()

async function runQuery(opts: RunQueryOptions): Promise<QueryResult> {
  const pool = getPool(opts.connectionId)
  const started = Date.now()
  const conn = await pool.getConnection()
  try {
    if (opts.queryId) {
      const threadId = conn.threadId
      if (typeof threadId === 'number') {
        mysqlInflight.set(opts.queryId, { threadId, connectionId: opts.connectionId })
      }
    }
    try {
      const [result, fields] = await conn.query(opts.sql, opts.params)
      const command = detectCommand(opts.sql)
      if (Array.isArray(result)) {
        const allRows = result as unknown as Record<string, unknown>[]
        const truncated = allRows.length > MAX_QUERY_RESULT_ROWS
        const rows = truncated ? allRows.slice(0, MAX_QUERY_RESULT_ROWS) : allRows
        return {
          success: true,
          rows,
          fields: (fields ?? []).map((f) => ({
            name: String(f.name),
            dataTypeID: typeof f.columnType === 'number' ? f.columnType : 0
          })),
          rowCount: allRows.length,
          command,
          durationMs: Date.now() - started,
          truncated
        }
      }
      const header = result as ResultSetHeader
      return {
        success: true,
        rows: [],
        fields: [],
        rowCount: header.affectedRows ?? null,
        command,
        durationMs: Date.now() - started,
        truncated: false
      }
    } catch (err) {
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
    }
  } finally {
    if (opts.queryId) mysqlInflight.delete(opts.queryId)
    conn.release()
  }
}

async function cancelQuery(connectionId: string, queryId: string): Promise<void> {
  const entry = mysqlInflight.get(queryId)
  if (!entry || entry.connectionId !== connectionId) return
  const pool = getPool(connectionId)
  try {
    await pool.query(`KILL QUERY ${entry.threadId}`)
  } catch (err) {
    console.error('[mysql] cancel failed:', err)
  }
}

async function getColumnDistinct(opts: DistinctValuesOptions): Promise<unknown[]> {
  const pool = getPool(opts.connectionId)
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500)
  const params: unknown[] = []
  let where = ''
  if (opts.search && opts.search.trim()) {
    params.push(`%${opts.search.trim()}%`)
    where = `where cast(${quoteIdent(opts.column)} as char) like ?`
  }
  const sql = `select distinct ${quoteIdent(opts.column)} as value from ${qualifiedTable(opts.schema, opts.table)} ${where} order by 1 limit ${limit}`
  const [rows] = await pool.query<RowDataPacket[]>(sql, params)
  return (rows as Array<{ value: unknown }>).map((r) => r.value)
}

async function getSchemaGraph(connectionId: string, schema: string): Promise<SchemaGraph> {
  const pool = getPool(connectionId)

  const tablesPromise = pool.query<RowDataPacket[]>(
    `select table_name as name
       from information_schema.tables
      where table_schema = ? and table_type = 'BASE TABLE'
      order by table_name`,
    [schema]
  )

  const columnsPromise = pool.query<RowDataPacket[]>(
    `select table_name as ` +
      '`table`' +
      `,
            column_name as name,
            data_type,
            is_nullable,
            column_key
       from information_schema.columns
      where table_schema = ?
      order by table_name, ordinal_position`,
    [schema]
  )

  const edgesPromise = pool.query<RowDataPacket[]>(
    `select kcu.constraint_name as name,
            kcu.table_name as from_table,
            group_concat(kcu.column_name order by kcu.ordinal_position separator ',') as from_columns,
            kcu.referenced_table_schema as to_schema,
            kcu.referenced_table_name as to_table,
            group_concat(kcu.referenced_column_name order by kcu.ordinal_position separator ',') as to_columns
       from information_schema.key_column_usage kcu
      where kcu.table_schema = ?
        and kcu.referenced_table_name is not null
      group by kcu.constraint_name,
               kcu.table_name,
               kcu.referenced_table_schema,
               kcu.referenced_table_name
      order by kcu.table_name, kcu.constraint_name`,
    [schema]
  )

  const [[tablesRows], [columnsRows], [edgesRows]] = await Promise.all([
    tablesPromise,
    columnsPromise,
    edgesPromise
  ])

  const columnsByTable = new Map<string, SchemaGraphTable['columns']>()
  for (const row of columnsRows) {
    const tableName = String(row.table)
    const list = columnsByTable.get(tableName) ?? []
    list.push({
      name: String(row.name),
      dataType: String(row.data_type),
      isNullable: String(row.is_nullable).toUpperCase() === 'YES',
      isPrimaryKey: String(row.column_key) === 'PRI'
    })
    columnsByTable.set(tableName, list)
  }

  const tables: SchemaGraphTable[] = tablesRows.map((t) => ({
    schema,
    name: String(t.name),
    columns: columnsByTable.get(String(t.name)) ?? []
  }))

  const edges: SchemaGraphEdge[] = edgesRows.map((e) => ({
    name: String(e.name),
    from: {
      schema,
      table: String(e.from_table),
      columns: String(e.from_columns ?? '')
        .split(',')
        .filter(Boolean)
    },
    to: {
      schema: String(e.to_schema),
      table: String(e.to_table),
      columns: String(e.to_columns ?? '')
        .split(',')
        .filter(Boolean)
    }
  }))

  return { schema, tables, edges }
}

export const mysqlDriver: DatabaseDriver = {
  test,
  describeActive,
  disconnectPool,
  disconnectAll,
  listSchemas,
  listTables,
  tableDetails,
  getSchemaGraph,
  getRows,
  insertRow,
  updateRow,
  deleteRow,
  runQuery,
  cancelQuery,
  getColumnDistinct
}
