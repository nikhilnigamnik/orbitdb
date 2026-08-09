import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { basename } from 'path'
import {
  MAX_EXACT_COUNT_ROWS,
  MAX_QUERY_RESULT_ROWS,
  type ConnectionInput,
  type CountRowsOptions,
  type DdlRequest,
  type DistinctValuesOptions,
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
import { requireConnection } from '../../store/connections-store'
import { buildDdl } from '../ddl'
import { buildFilterSql } from '../filters'
import { recordQuery } from '../query-log'
import { detectCommand, isSchemaChanging } from '../sql-command'
import {
  LIST_BASE_TABLES_SQL,
  LIST_TABLES_SQL,
  SQLITE_SCHEMA,
  quoteIdent,
  sqliteDdlDialect,
  sqliteFilterDialect,
  toColumns,
  toForeignKeys,
  toIndex,
  toPrimaryKey,
  type ForeignKeyRow,
  type IndexInfoRow,
  type IndexListRow,
  type TableInfoRow
} from '../sqlite-shared'
import type { ActiveMeta, DatabaseDriver } from './types'

type Db = Database.Database

const handles = new Map<string, Db>()
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

function requireFilePath(input: ConnectionInput): string {
  const filePath = (input.filePath ?? '').trim()
  if (!filePath) throw new Error('Database file path is required')
  if (!existsSync(filePath)) throw new Error(`No file at ${filePath}`)
  return filePath
}

function openDatabase(filePath: string): Db {
  // fileMustExist so a typo opens nothing rather than silently creating an
  // empty database at the wrong path.
  return new Database(filePath, { fileMustExist: true })
}

function getDb(connectionId: string): Db {
  const existing = handles.get(connectionId)
  if (existing?.open) return existing

  const saved = requireConnection(connectionId)
  if (saved.engine !== 'sqlite') throw new Error(`Wrong driver for connection ${connectionId}`)
  const db = openDatabase(requireFilePath(saved))
  handles.set(connectionId, db)
  return db
}

/**
 * Run a statement and log it. better-sqlite3 is synchronous, so there is no
 * pool and no in-flight tracking — the work is done by the time this returns.
 */
function run<T>(connectionId: string, sql: string, params: unknown[], exec: () => T): T {
  const t0 = Date.now()
  try {
    const result = exec()
    recordQuery({
      connectionId,
      engine: 'sqlite',
      sql,
      params,
      durationMs: Date.now() - t0,
      rowCount: Array.isArray(result) ? result.length : null,
      success: true
    })
    return result
  } catch (err) {
    recordQuery({
      connectionId,
      engine: 'sqlite',
      sql,
      params,
      durationMs: Date.now() - t0,
      success: false,
      error: err instanceof Error ? err.message : String(err)
    })
    throw err
  }
}

function selectAll<T>(connectionId: string, db: Db, sql: string, params: unknown[] = []): T[] {
  return run(connectionId, sql, params, () => db.prepare(sql).all(...params) as T[])
}

async function test(input: ConnectionInput): Promise<TestConnectionResult> {
  let db: Db | null = null
  try {
    db = openDatabase(requireFilePath(input))
    const row = db.prepare('select sqlite_version() as version').get() as { version: string }
    return { success: true, serverVersion: `SQLite ${row.version}` }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    db?.close()
  }
}

async function describeActive(saved: SavedConnection): Promise<ActiveMeta> {
  const db = getDb(saved.id)
  const row = db.prepare('select sqlite_version() as version').get() as { version: string }
  return {
    serverVersion: `SQLite ${row.version}`,
    currentDatabase: saved.name || basename(saved.filePath ?? ''),
    currentUser: 'local'
  }
}

async function disconnectPool(connectionId: string): Promise<void> {
  invalidateTableDetailsForConnection(connectionId)
  const db = handles.get(connectionId)
  handles.delete(connectionId)
  try {
    db?.close()
  } catch (err) {
    console.error(`[sqlite ${connectionId}] close failed`, err)
  }
}

async function disconnectAll(): Promise<void> {
  await Promise.all([...handles.keys()].map((id) => disconnectPool(id)))
}

async function listSchemas(connectionId: string): Promise<SchemaInfo[]> {
  void connectionId
  return [{ name: SQLITE_SCHEMA }]
}

async function listTables(connectionId: string, schema: string): Promise<TableInfo[]> {
  void schema
  const db = getDb(connectionId)
  const rows = selectAll<{ name: string; type: string }>(connectionId, db, LIST_TABLES_SQL)
  return rows.map((r) => ({
    schema: SQLITE_SCHEMA,
    name: String(r.name),
    type: r.type === 'view' ? 'view' : 'table',
    // SQLite keeps no row statistics; the exact count endpoint covers it.
    estimatedRows: null
  }))
}

async function tableDetails(
  connectionId: string,
  schema: string,
  table: string
): Promise<TableDetails> {
  const cacheKey = tableCacheKey(connectionId, schema, table)
  const cached = tableDetailsCache.get(cacheKey)
  if (cached) return cached

  const db = getDb(connectionId)
  const meta = selectAll<{ type: string }>(
    connectionId,
    db,
    `select type from sqlite_master where type in ('table', 'view') and name = ? limit 1`,
    [table]
  )
  if (meta.length === 0) throw new Error(`Table ${table} not found`)
  const type: TableDetails['type'] = meta[0].type === 'view' ? 'view' : 'table'

  // PRAGMAs don't accept bind params; embed the quoted identifier literally.
  const tableIdent = quoteIdent(table)
  const columnRows = selectAll<TableInfoRow>(connectionId, db, `pragma table_info(${tableIdent})`)
  const indexRows = selectAll<IndexListRow>(connectionId, db, `pragma index_list(${tableIdent})`)
  const fkRows = selectAll<ForeignKeyRow>(
    connectionId,
    db,
    `pragma foreign_key_list(${tableIdent})`
  )

  const indexes: IndexInfo[] = indexRows.map((index) =>
    toIndex(
      index,
      selectAll<IndexInfoRow>(
        connectionId,
        db,
        `pragma index_info(${quoteIdent(String(index.name))})`
      )
    )
  )

  const result: TableDetails = {
    schema: SQLITE_SCHEMA,
    name: table,
    type,
    columns: toColumns(columnRows),
    primaryKey: toPrimaryKey(columnRows),
    indexes,
    foreignKeys: toForeignKeys(fkRows),
    estimatedRows: null
  }
  tableDetailsCache.set(cacheKey, result)
  return result
}

async function getRows(opts: GetRowsOptions): Promise<RowsResult> {
  const db = getDb(opts.connectionId)
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  const validColumns = new Set(details.columns.map((c) => c.name))
  const { whereSql, params } = buildFilterSql(opts.filters, validColumns, sqliteFilterDialect)

  let orderSql = ''
  if (opts.orderBy && validColumns.has(opts.orderBy)) {
    orderSql = `order by ${quoteIdent(opts.orderBy)} ${opts.orderDir === 'desc' ? 'desc' : 'asc'}`
  } else if (details.primaryKey.length > 0) {
    orderSql = `order by ${details.primaryKey.map(quoteIdent).join(', ')}`
  }

  const limit = Math.max(1, Math.min(opts.limit ?? 100, 1000))
  const offset = Math.max(0, opts.offset ?? 0)
  const sql = `select * from ${quoteIdent(opts.table)} ${whereSql} ${orderSql} limit ${limit} offset ${offset}`

  return {
    rows: selectAll<Record<string, unknown>>(opts.connectionId, db, sql, params),
    columns: details.columns,
    totalEstimate: null
  }
}

async function countRows(opts: CountRowsOptions): Promise<number | null> {
  const db = getDb(opts.connectionId)
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  const validColumns = new Set(details.columns.map((c) => c.name))
  const { whereSql, params } = buildFilterSql(opts.filters, validColumns, sqliteFilterDialect)

  const sql = `select count(*) as total from ${quoteIdent(opts.table)} ${whereSql}`
  const rows = selectAll<{ total: number }>(opts.connectionId, db, sql, params)
  const total = Number(rows[0]?.total)
  if (!Number.isFinite(total)) return null
  // Counting is exact and local, so it stays honest even on large tables; the
  // ceiling only guards the UI from a number it would have to abbreviate anyway.
  return total > MAX_EXACT_COUNT_ROWS && !whereSql ? null : total
}

function fetchByPk(
  connectionId: string,
  table: string,
  pk: Record<string, unknown>
): Record<string, unknown> {
  const db = getDb(connectionId)
  const keys = Object.keys(pk)
  if (keys.length === 0) return {}
  const where = keys.map((k) => `${quoteIdent(k)} = ?`).join(' and ')
  const sql = `select * from ${quoteIdent(table)} where ${where} limit 1`
  return (
    selectAll<Record<string, unknown>>(
      connectionId,
      db,
      sql,
      keys.map((k) => pk[k])
    )[0] ?? {}
  )
}

function fetchByRowid(
  connectionId: string,
  table: string,
  rowid: number | bigint
): Record<string, unknown> {
  try {
    const db = getDb(connectionId)
    const sql = `select * from ${quoteIdent(table)} where rowid = ? limit 1`
    return selectAll<Record<string, unknown>>(connectionId, db, sql, [rowid])[0] ?? {}
  } catch {
    // WITHOUT ROWID tables have no rowid column — nothing to read back.
    return {}
  }
}

async function insertRow(opts: RowMutation): Promise<Record<string, unknown>> {
  const db = getDb(opts.connectionId)
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  const validColumns = new Set(details.columns.map((c) => c.name))

  const cols: string[] = []
  const values: unknown[] = []
  for (const [key, value] of Object.entries(opts.values)) {
    if (!validColumns.has(key)) continue
    cols.push(quoteIdent(key))
    values.push(value)
  }
  if (cols.length === 0) throw new Error('No valid columns to insert')

  const sql = `insert into ${quoteIdent(opts.table)} (${cols.join(', ')}) values (${cols.map(() => '?').join(', ')})`
  const info = run(opts.connectionId, sql, values, () => db.prepare(sql).run(...values))

  const pk: Record<string, unknown> = {}
  for (const pkCol of details.primaryKey) {
    if (opts.values[pkCol] != null) pk[pkCol] = opts.values[pkCol]
  }
  if (details.primaryKey.length > 0 && Object.keys(pk).length === details.primaryKey.length) {
    return fetchByPk(opts.connectionId, opts.table, pk)
  }

  // The key was assigned by the database. lastInsertRowid is the rowid, which
  // only doubles as the key for an INTEGER PRIMARY KEY alias — read the row back
  // by rowid rather than pretending the rowid is the key.
  return fetchByRowid(opts.connectionId, opts.table, info.lastInsertRowid)
}

async function updateRow(opts: RowUpdate): Promise<Record<string, unknown>> {
  const db = getDb(opts.connectionId)
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  const validColumns = new Set(details.columns.map((c) => c.name))
  if (details.primaryKey.length === 0) {
    throw new Error(`Cannot update rows on ${opts.table}: no primary key`)
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

  const sql = `update ${quoteIdent(opts.table)} set ${setClauses.join(', ')} where ${whereClauses.join(' and ')}`
  const info = run(opts.connectionId, sql, params, () => db.prepare(sql).run(...params))
  if (info.changes === 0) throw new Error('No row matched the primary key')

  const newPk: Record<string, unknown> = {}
  for (const pkCol of details.primaryKey) {
    newPk[pkCol] = opts.values[pkCol] != null ? opts.values[pkCol] : opts.pk[pkCol]
  }
  return fetchByPk(opts.connectionId, opts.table, newPk)
}

async function deleteRow(opts: RowDelete): Promise<{ deleted: number }> {
  const db = getDb(opts.connectionId)
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  if (details.primaryKey.length === 0) {
    throw new Error(`Cannot delete rows on ${opts.table}: no primary key`)
  }

  const params: unknown[] = []
  const whereClauses: string[] = []
  for (const pkCol of details.primaryKey) {
    if (!(pkCol in opts.pk)) throw new Error(`Missing primary key column ${pkCol}`)
    whereClauses.push(`${quoteIdent(pkCol)} = ?`)
    params.push(opts.pk[pkCol])
  }

  const sql = `delete from ${quoteIdent(opts.table)} where ${whereClauses.join(' and ')}`
  const info = run(opts.connectionId, sql, params, () => db.prepare(sql).run(...params))
  return { deleted: info.changes }
}

async function generateDdl(opts: DdlRequest): Promise<string> {
  return buildDdl(opts.operation, opts.schema, opts.table, sqliteDdlDialect)
}

async function executeDdl(opts: DdlRequest): Promise<void> {
  const db = getDb(opts.connectionId)
  const sql = buildDdl(opts.operation, opts.schema, opts.table, sqliteDdlDialect)
  run(opts.connectionId, sql, [], () => db.exec(sql))
  invalidateTableDetailsForConnection(opts.connectionId)
}

async function runQuery(opts: RunQueryOptions): Promise<QueryResult> {
  const db = getDb(opts.connectionId)
  const started = Date.now()
  const params = opts.params ?? []

  try {
    const result = run(opts.connectionId, opts.sql, params, () => {
      // prepare() compiles a single statement; a batch has to go through exec(),
      // which runs everything but returns nothing.
      let statement: Database.Statement
      try {
        statement = db.prepare(opts.sql)
      } catch (err) {
        if (params.length > 0) throw err
        db.exec(opts.sql)
        return { rows: [] as Record<string, unknown>[], changes: null as number | null }
      }
      if (statement.reader) {
        return { rows: statement.all(...params) as Record<string, unknown>[], changes: null }
      }
      const info = statement.run(...params)
      return { rows: [] as Record<string, unknown>[], changes: info.changes }
    })

    if (isSchemaChanging(opts.sql)) invalidateTableDetailsForConnection(opts.connectionId)

    const truncated = result.rows.length > MAX_QUERY_RESULT_ROWS
    const rows = truncated ? result.rows.slice(0, MAX_QUERY_RESULT_ROWS) : result.rows
    return {
      success: true,
      rows,
      fields: (rows[0] ? Object.keys(rows[0]) : []).map((name) => ({ name, dataTypeID: 0 })),
      rowCount: result.rows.length > 0 ? result.rows.length : result.changes,
      command: detectCommand(opts.sql),
      durationMs: Date.now() - started,
      truncated
    }
  } catch (err) {
    if (isSchemaChanging(opts.sql)) invalidateTableDetailsForConnection(opts.connectionId)
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
}

async function cancelQuery(connectionId: string, queryId: string): Promise<void> {
  // better-sqlite3 is synchronous: by the time a cancel could be requested the
  // statement has already returned. Nothing to interrupt.
  void connectionId
  void queryId
}

async function getColumnDistinct(opts: DistinctValuesOptions): Promise<unknown[]> {
  const db = getDb(opts.connectionId)
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  if (!details.columns.some((c) => c.name === opts.column)) {
    throw new Error(`Column ${opts.column} does not exist on ${opts.table}`)
  }

  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500)
  const params: unknown[] = []
  let where = ''
  if (opts.search && opts.search.trim()) {
    params.push(`%${opts.search.trim()}%`)
    where = `where cast(${quoteIdent(opts.column)} as text) like ?`
  }
  const sql = `select distinct ${quoteIdent(opts.column)} as value from ${quoteIdent(opts.table)} ${where} order by 1 limit ${limit}`
  return selectAll<{ value: unknown }>(opts.connectionId, db, sql, params).map((r) => r.value)
}

async function getSchemaGraph(connectionId: string, schema: string): Promise<SchemaGraph> {
  const db = getDb(connectionId)
  const tableNames = selectAll<{ name: string }>(connectionId, db, LIST_BASE_TABLES_SQL).map((r) =>
    String(r.name)
  )

  const tables: SchemaGraphTable[] = []
  const edges: SchemaGraphEdge[] = []

  for (const tableName of tableNames) {
    const ident = quoteIdent(tableName)
    const columnRows = selectAll<TableInfoRow>(connectionId, db, `pragma table_info(${ident})`)
    const fkRows = selectAll<ForeignKeyRow>(connectionId, db, `pragma foreign_key_list(${ident})`)

    tables.push({
      schema,
      name: tableName,
      columns: columnRows.map((c) => ({
        name: String(c.name),
        dataType: String(c.type || 'TEXT'),
        isNullable: Number(c.notnull) === 0,
        isPrimaryKey: Number(c.pk) > 0
      }))
    })

    for (const fk of toForeignKeys(fkRows)) {
      edges.push({
        name: `${tableName}_${fk.name}`,
        from: { schema, table: tableName, columns: fk.columns },
        to: { schema, table: fk.referencedTable, columns: fk.referencedColumns }
      })
    }
  }

  return { schema, tables, edges }
}

export const sqliteDriver: DatabaseDriver = {
  test,
  describeActive,
  disconnectPool,
  disconnectAll,
  listSchemas,
  listTables,
  tableDetails,
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
  getColumnDistinct
}
