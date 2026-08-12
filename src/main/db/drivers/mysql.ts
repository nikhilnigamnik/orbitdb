import mysql, {
  type Pool,
  type PoolOptions,
  type RowDataPacket,
  type ResultSetHeader
} from 'mysql2/promise'
import {
  MAX_EXACT_COUNT_ROWS,
  MAX_QUERY_RESULT_ROWS,
  OVERVIEW_TABLE_LIMIT,
  type ConnectionOverview,
  type CountRowsOptions,
  type ColumnInfo,
  type ConnectionInput,
  type DdlRequest,
  type DistinctValuesOptions,
  type ForeignKeyInfo,
  type GetRowsOptions,
  type IndexInfo,
  type QueryResult,
  type ReferencingKeyInfo,
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
  type TestConnectionResult,
  ValueSearchOptions,
  ValueSearchResult,
  CheckReferencesOptions,
  CheckReferencesResult
} from '../../../shared/types'
import { requireConnection } from '../../store/connections-store'
import { buildDdl, type DdlDialect } from '../ddl'
import { toCount } from '../coerce'
import { buildOrderBySql } from '../order-by'
import { buildFilterSql, type FilterDialect } from '../filters'
import { sweepTables, type ValueSearchDialect } from '../value-search'
import { sweepReferences } from '../broken-refs'
import { isSweepCancelled } from '../sweep-cancel'
import { recordQuery } from '../query-log'
import { detectCommand, isSchemaChanging } from '../sql-command'
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
  const saved = requireConnection(connectionId)
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

/** Exported for testing - pure, and now relied on by both introspection paths. */
export function normalizeUdtName(dataType: string, columnType: string): string {
  const dt = dataType.toLowerCase()
  if (dt === 'json') return 'json'
  if (dt === 'tinyint' && columnType.toLowerCase() === 'tinyint(1)') return 'bool'
  if (['int', 'bigint', 'smallint', 'mediumint', 'tinyint'].includes(dt)) return 'int4'
  if (['decimal', 'numeric'].includes(dt)) return 'numeric'
  if (['float', 'double', 'real'].includes(dt)) return 'float8'
  return dt
}

/** Exported for testing - the quote-escaping rules have real edge cases. */
export function parseEnumValues(columnType: string): string[] | null {
  const match = /^enum\((.*)\)$/i.exec(columnType)
  if (!match) return null
  // Labels are single-quoted; a literal quote inside a label is doubled ('').
  const labels: string[] = []
  const labelRe = /'((?:[^']|'')*)'/g
  let m: RegExpExecArray | null
  while ((m = labelRe.exec(match[1])) != null) {
    labels.push(m[1].replace(/''/g, "'"))
  }
  return labels.length > 0 ? labels : null
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
      r.character_maximum_length == null ? null : Number(r.character_maximum_length),
    enumValues: parseEnumValues(String(r.column_type))
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

async function getOverview(connectionId: string): Promise<ConnectionOverview> {
  const pool = getPool(connectionId)
  const excluded = [...SYSTEM_SCHEMAS]
  const placeholders = excluded.map(() => '?').join(', ')

  const [meta, counts, tables] = await Promise.all([
    pool.query<RowDataPacket[]>('select version() as version, database() as db'),
    pool.query<RowDataPacket[]>(
      `select count(distinct table_schema) as schemas,
              sum(table_type = 'BASE TABLE') as tables,
              sum(table_type = 'VIEW') as views,
              sum(coalesce(data_length, 0) + coalesce(index_length, 0)) as bytes
         from information_schema.tables
        where table_schema not in (${placeholders})`,
      excluded
    ),
    pool.query<RowDataPacket[]>(
      // data_length and index_length are the engine's own estimates, refreshed
      // on ANALYZE rather than continuously. Good enough to rank by.
      `select table_schema as \`schema\`,
              table_name as name,
              coalesce(data_length, 0) + coalesce(index_length, 0) as bytes,
              table_rows as estimated_rows
         from information_schema.tables
        where table_schema not in (${placeholders})
          and table_type = 'BASE TABLE'
        order by bytes desc
        limit ${OVERVIEW_TABLE_LIMIT}`,
      excluded
    )
  ])

  const metaRow = meta[0][0] ?? {}
  const countRow = counts[0][0] ?? {}
  return {
    databaseName: String(metaRow.db ?? ''),
    serverVersion: String(metaRow.version ?? ''),
    schemaCount: toCount(countRow.schemas),
    tableCount: toCount(countRow.tables),
    viewCount: toCount(countRow.views),
    totalBytes: countRow.bytes == null ? null : toCount(countRow.bytes),
    largestTables: tables[0].map((t) => ({
      schema: String(t.schema),
      name: String(t.name),
      bytes: toCount(t.bytes),
      estimatedRows: t.estimated_rows == null ? null : toCount(t.estimated_rows)
    }))
  }
}

/** The `tableDetails` FK query filtered on the referenced side - see the Postgres note. */
async function referencingKeys(
  connectionId: string,
  schema: string,
  table: string
): Promise<ReferencingKeyInfo[]> {
  const pool = getPool(connectionId)
  const [rows] = await pool.query<RowDataPacket[]>(
    `select kcu.constraint_name as name,
            kcu.table_schema as child_schema,
            kcu.table_name as child_table,
            group_concat(kcu.column_name order by kcu.ordinal_position separator ',') as columns,
            group_concat(kcu.referenced_column_name order by kcu.ordinal_position separator ',') as referenced_columns,
            rc.delete_rule as on_delete,
            rc.update_rule as on_update
       from information_schema.key_column_usage kcu
       join information_schema.referential_constraints rc
         on rc.constraint_schema = kcu.constraint_schema
        and rc.constraint_name = kcu.constraint_name
      where kcu.referenced_table_schema = ?
        and kcu.referenced_table_name = ?
      group by kcu.constraint_name, kcu.table_schema, kcu.table_name,
               rc.delete_rule, rc.update_rule
      order by kcu.table_schema, kcu.table_name, kcu.constraint_name`,
    [schema, table]
  )
  return rows.map((r) => ({
    name: String(r.name),
    schema: String(r.child_schema),
    table: String(r.child_table),
    columns: String(r.columns ?? '')
      .split(',')
      .filter(Boolean),
    referencedSchema: schema,
    referencedTable: table,
    referencedColumns: String(r.referenced_columns ?? '')
      .split(',')
      .filter(Boolean),
    onDelete: String(r.on_delete ?? 'NO ACTION'),
    onUpdate: String(r.on_update ?? 'NO ACTION')
  }))
}

function quoteIdent(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`'
}

function qualifiedTable(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`
}

const filterDialect: FilterDialect = {
  quoteIdent,
  placeholder: () => '?',
  supportsIlike: false
}

const searchDialect: ValueSearchDialect = {
  ...filterDialect,
  qualifiedTable,
  // MySQL has no `text` cast target; `char` is the portable one.
  castText: (expr) => `cast(${expr} as char)`
}

async function searchValue(opts: ValueSearchOptions): Promise<ValueSearchResult> {
  const pool = getPool(opts.connectionId)
  return sweepTables(opts.schema, opts.term, opts.mode, {
    dialect: searchDialect,
    listTables: () => listTables(opts.connectionId, opts.schema),
    columnsFor: async (table) =>
      (await tableDetails(opts.connectionId, opts.schema, table)).columns,
    run: async (sql, params) => {
      const [rows] = await pool.query<RowDataPacket[]>(sql, params)
      return rows[0] as Record<string, unknown> | undefined
    },
    isCancelled: () => isSweepCancelled(opts.searchId)
  })
}

async function getRows(opts: GetRowsOptions): Promise<RowsResult> {
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  const validColumns = new Set(details.columns.map((c) => c.name))

  const { whereSql, params } = buildFilterSql(
    opts.filters,
    validColumns,
    filterDialect,
    opts.filterJoin
  )

  const orderSql = buildOrderBySql(opts.orderBy, opts.orderDir, details.primaryKey, validColumns, {
    quoteIdent
  })

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

async function countRows(opts: CountRowsOptions): Promise<number | null> {
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  const validColumns = new Set(details.columns.map((c) => c.name))
  const { whereSql, params } = buildFilterSql(
    opts.filters,
    validColumns,
    filterDialect,
    opts.filterJoin
  )

  // Unfiltered counts on a huge table buy precision nobody asked for at a price
  // the UI would feel; the estimate already covers that case.
  if (!whereSql && (details.estimatedRows ?? 0) > MAX_EXACT_COUNT_ROWS) return null

  const pool = getPool(opts.connectionId)
  const [rows] = await pool.query<RowDataPacket[]>(
    `select count(*) as total from ${qualifiedTable(opts.schema, opts.table)} ${whereSql}`,
    params
  )
  const total = Number(rows[0]?.total)
  return Number.isFinite(total) ? total : null
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

  // Fetch updated row - use new PK values if they were part of the update set
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

const ddlDialect: DdlDialect = {
  quoteIdent,
  qualifiedTable,
  dropIndex: (schema, table, name) =>
    `DROP INDEX ${quoteIdent(name)} ON ${qualifiedTable(schema, table)}`,
  truncate: (schema, table) => `TRUNCATE TABLE ${qualifiedTable(schema, table)}`
}

async function generateDdl(opts: DdlRequest): Promise<string> {
  return buildDdl(opts.operation, opts.schema, opts.table, ddlDialect)
}

async function executeDdl(opts: DdlRequest): Promise<void> {
  const sql = buildDdl(opts.operation, opts.schema, opts.table, ddlDialect)
  const pool = getPool(opts.connectionId)
  await pool.query(sql)
  invalidateTableDetailsForConnection(opts.connectionId)
}

interface MysqlInflight {
  threadId: number
  connectionId: string
}
const mysqlInflight = new Map<string, MysqlInflight>()

async function runQuery(opts: RunQueryOptions): Promise<QueryResult> {
  const pool = getPool(opts.connectionId)
  const started = Date.now()
  // Runs on a dedicated connection (so the thread id is stable for KILL QUERY),
  // which bypasses the instrumented pool.query - log it explicitly.
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
      const isRowSet = Array.isArray(result)
      const allRows = isRowSet ? (result as unknown as Record<string, unknown>[]) : []
      const header = isRowSet ? null : (result as ResultSetHeader)
      const rowCount = isRowSet ? allRows.length : (header?.affectedRows ?? null)
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
      if (isSchemaChanging(opts.sql)) invalidateTableDetailsForConnection(opts.connectionId)
      const truncated = allRows.length > MAX_QUERY_RESULT_ROWS
      return {
        success: true,
        rows: truncated ? allRows.slice(0, MAX_QUERY_RESULT_ROWS) : allRows,
        fields: isRowSet
          ? (fields ?? []).map((f) => ({
              name: String(f.name),
              dataTypeID: typeof f.columnType === 'number' ? f.columnType : 0
            }))
          : [],
        rowCount,
        command,
        durationMs: Date.now() - started,
        truncated
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
      if (isSchemaChanging(opts.sql)) invalidateTableDetailsForConnection(opts.connectionId)
      return {
        success: false,
        error: message,
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

async function checkReferences(opts: CheckReferencesOptions): Promise<CheckReferencesResult> {
  const pool = getPool(opts.connectionId)
  return sweepReferences(opts.schema, {
    dialect: searchDialect,
    loadTables: async () => {
      const tables = await listTables(opts.connectionId, opts.schema)
      const details: TableDetails[] = []
      for (const table of tables) {
        if (table.type !== 'table') continue
        details.push(await tableDetails(opts.connectionId, opts.schema, table.name))
      }
      return details
    },
    run: async (sql) => {
      const [rows] = await pool.query<RowDataPacket[]>(sql)
      return rows[0] as Record<string, unknown> | undefined
    },
    isCancelled: () => isSweepCancelled(opts.sweepId)
  })
}

async function getColumnDistinct(opts: DistinctValuesOptions): Promise<unknown[]> {
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  if (!details.columns.some((c) => c.name === opts.column)) {
    throw new Error(`Column ${opts.column} does not exist on ${opts.schema}.${opts.table}`)
  }
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
            column_type,
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
    // column_type carries the enum's members; data_type is just "enum".
    const columnType = String(row.column_type ?? row.data_type)
    list.push({
      name: String(row.name),
      dataType: columnType,
      udtName: normalizeUdtName(String(row.data_type), columnType),
      isNullable: String(row.is_nullable).toUpperCase() === 'YES',
      isPrimaryKey: String(row.column_key) === 'PRI',
      enumValues: parseEnumValues(columnType)
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
  referencingKeys,
  getSchemaGraph,
  getRows,
  countRows,
  insertRow,
  updateRow,
  deleteRow,
  generateDdl,
  executeDdl,
  runQuery,
  cancelQuery,
  getColumnDistinct,
  searchValue,
  checkReferences,
  getOverview
}
