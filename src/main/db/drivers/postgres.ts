import { Pool, type PoolConfig } from 'pg'
import { recordQuery } from '../query-log'
import { detectCommand, isSchemaChanging } from '../sql-command'
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
  type TestConnectionResult
} from '../../../shared/types'
import { requireConnection } from '../../store/connections-store'
import { buildDdl, type DdlDialect } from '../ddl'
import { toCount } from '../coerce'
import { buildOrderBySql } from '../order-by'
import { buildFilterSql, type FilterDialect } from '../filters'
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

function toPoolConfig(input: ConnectionInput): PoolConfig {
  return {
    host: input.host,
    port: input.port,
    database: input.database,
    user: input.user,
    password: input.password,
    ssl: input.ssl ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000
  }
}

function getPool(connectionId: string): Pool {
  const existing = pools.get(connectionId)
  if (existing) return existing
  const saved = requireConnection(connectionId)
  if (saved.engine !== 'postgres') throw new Error(`Wrong driver for connection ${connectionId}`)
  const pool = new Pool(toPoolConfig(saved))
  pool.on('error', (err) => {
    console.error(`[pg pool ${connectionId}] error`, err)
  })
  instrumentPgPool(pool, connectionId)
  pools.set(connectionId, pool)
  return pool
}

function instrumentPgPool(pool: Pool, connectionId: string): void {
  const original = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>
  ;(pool as unknown as { query: unknown }).query = async function patched(
    ...args: unknown[]
  ): Promise<unknown> {
    const first = args[0] as string | { text?: string; values?: unknown[] }
    const sql = typeof first === 'string' ? first : (first?.text ?? '')
    const params =
      typeof first === 'string'
        ? ((args[1] as unknown[] | undefined) ?? [])
        : ((first?.values as unknown[] | undefined) ?? [])
    const t0 = Date.now()
    try {
      const res = (await original(...args)) as { rowCount?: number | null }
      recordQuery({
        connectionId,
        engine: 'postgres',
        sql,
        params,
        durationMs: Date.now() - t0,
        rowCount: res?.rowCount ?? null,
        success: true
      })
      return res
    } catch (err) {
      recordQuery({
        connectionId,
        engine: 'postgres',
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
    console.error(`[pg pool ${connectionId}] end failed`, err)
  }
}

async function disconnectAll(): Promise<void> {
  const ids = [...pools.keys()]
  await Promise.all(ids.map((id) => disconnectPool(id)))
}

async function test(input: ConnectionInput): Promise<TestConnectionResult> {
  const pool = new Pool({ ...toPoolConfig(input), max: 1 })
  instrumentPgPool(pool, '<test>')
  try {
    const res = await pool.query<{ version: string }>('select version() as version')
    return { success: true, serverVersion: res.rows[0]?.version }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    await pool.end().catch(() => undefined)
  }
}

async function describeActive(saved: SavedConnection): Promise<ActiveMeta> {
  const pool = getPool(saved.id)
  const res = await pool.query<{ version: string; database: string; user: string }>(
    'select version() as version, current_database() as database, current_user as user'
  )
  const row = res.rows[0]
  return {
    serverVersion: row?.version ?? '',
    currentDatabase: row?.database ?? saved.database,
    currentUser: row?.user ?? saved.user
  }
}

const SYSTEM_SCHEMAS = ['pg_catalog', 'information_schema', 'pg_toast']

async function listSchemas(connectionId: string): Promise<SchemaInfo[]> {
  const pool = getPool(connectionId)
  const res = await pool.query<{ name: string }>(
    `select nspname as name
       from pg_namespace
      where nspname not in (${SYSTEM_SCHEMAS.map((_, i) => `$${i + 1}`).join(', ')})
        and nspname not like 'pg_temp_%'
        and nspname not like 'pg_toast_temp_%'
      order by nspname`,
    SYSTEM_SCHEMAS
  )
  return res.rows
}

async function listTables(connectionId: string, schema: string): Promise<TableInfo[]> {
  const pool = getPool(connectionId)
  const res = await pool.query<{
    schema: string
    name: string
    kind: string
    estimated_rows: string | null
  }>(
    `select n.nspname as schema,
            c.relname as name,
            c.relkind::text as kind,
            case when c.reltuples >= 0 then c.reltuples::bigint::text else null end as estimated_rows
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1
        and c.relkind in ('r','v','m','p')
      order by c.relname`,
    [schema]
  )
  return res.rows.map((r) => ({
    schema: r.schema,
    name: r.name,
    type: r.kind === 'v' ? 'view' : r.kind === 'm' ? 'materialized_view' : 'table',
    estimatedRows: r.estimated_rows == null ? null : Number(r.estimated_rows)
  }))
}

/**
 * Enum labels for every `USER-DEFINED` column in `rows`, keyed `schema.type`.
 *
 * Shared by tableDetails and getSchemaGraph so the two cannot disagree about
 * what a column's type is - they did, and the whole-database map was the one
 * still handing the model the bare `USER-DEFINED` placeholder.
 *
 * One extra round-trip, and only when the table actually has such a column.
 */
async function enumLabelsFor(
  pool: Pool,
  rows: { data_type: string; udt_schema: string; udt_name: string }[]
): Promise<Map<string, string[]>> {
  const byType = new Map<string, string[]>()
  const userDefinedTypes = [
    ...new Set(
      rows.filter((r) => r.data_type === 'USER-DEFINED').map((r) => `${r.udt_schema}.${r.udt_name}`)
    )
  ]
  if (userDefinedTypes.length === 0) return byType

  const enumRes = await pool.query<{ type_key: string; labels: string[] }>(
    `select n.nspname || '.' || t.typname as type_key,
            array_agg(e.enumlabel::text order by e.enumsortorder) as labels
       from pg_type t
       join pg_namespace n on n.oid = t.typnamespace
       join pg_enum e on e.enumtypid = t.oid
      where n.nspname || '.' || t.typname = any($1)
      group by n.nspname, t.typname`,
    [userDefinedTypes]
  )
  for (const r of enumRes.rows) byType.set(r.type_key, r.labels)
  return byType
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

  const kindRes = await pool.query<{ kind: string; estimated_rows: string | null }>(
    `select c.relkind::text as kind,
            case when c.reltuples >= 0 then c.reltuples::bigint::text else null end as estimated_rows
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname = $2
      limit 1`,
    [schema, table]
  )
  if (kindRes.rowCount === 0) {
    throw new Error(`Table ${schema}.${table} not found`)
  }
  const kind = kindRes.rows[0].kind
  const type: TableDetails['type'] =
    kind === 'v' ? 'view' : kind === 'm' ? 'materialized_view' : 'table'

  const pkRes = await pool.query<{ column: string }>(
    `select a.attname as column
       from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       join pg_class c on c.oid = i.indrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relname = $2 and i.indisprimary
      order by array_position(i.indkey, a.attnum)`,
    [schema, table]
  )
  const primaryKey = pkRes.rows.map((r) => r.column)

  const colsRes = await pool.query<{
    name: string
    data_type: string
    udt_schema: string
    udt_name: string
    is_nullable: string
    default_value: string | null
    ordinal_position: number
    character_maximum_length: number | null
  }>(
    `select column_name as name,
            data_type,
            udt_schema,
            udt_name,
            is_nullable,
            column_default as default_value,
            ordinal_position,
            character_maximum_length
       from information_schema.columns
      where table_schema = $1 and table_name = $2
      order by ordinal_position`,
    [schema, table]
  )

  const enumLabelsByType = await enumLabelsFor(pool, colsRes.rows)

  const pkSet = new Set(primaryKey)
  const columns: ColumnInfo[] = colsRes.rows.map((r) => ({
    name: r.name,
    dataType: r.data_type,
    udtName: r.udt_name,
    isNullable: r.is_nullable === 'YES',
    isPrimaryKey: pkSet.has(r.name),
    defaultValue: r.default_value,
    ordinalPosition: r.ordinal_position,
    characterMaximumLength: r.character_maximum_length,
    enumValues: enumLabelsByType.get(`${r.udt_schema}.${r.udt_name}`) ?? null
  }))

  const idxRes = await pool.query<{
    name: string
    is_unique: boolean
    is_primary: boolean
    columns: string[]
    definition: string
  }>(
    `select i.relname as name,
            ix.indisunique as is_unique,
            ix.indisprimary as is_primary,
            array_agg(a.attname::text order by array_position(ix.indkey, a.attnum)) as columns,
            pg_get_indexdef(ix.indexrelid) as definition
       from pg_index ix
       join pg_class i on i.oid = ix.indexrelid
       join pg_class c on c.oid = ix.indrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attnum = any(ix.indkey)
      where n.nspname = $1 and c.relname = $2
      group by i.relname, ix.indisunique, ix.indisprimary, ix.indexrelid
      order by i.relname`,
    [schema, table]
  )
  const indexes: IndexInfo[] = idxRes.rows.map((r) => ({
    name: r.name,
    isUnique: r.is_unique,
    isPrimary: r.is_primary,
    columns: r.columns,
    definition: r.definition
  }))

  const fkRes = await pool.query<{
    name: string
    columns: string[]
    referenced_schema: string
    referenced_table: string
    referenced_columns: string[]
    on_delete: string
    on_update: string
  }>(
    `select con.conname as name,
            array_agg(a.attname::text order by k.ord) as columns,
            rn.nspname as referenced_schema,
            rc.relname as referenced_table,
            array_agg(ra.attname::text order by k.ord) as referenced_columns,
            case con.confdeltype
              when 'a' then 'NO ACTION'
              when 'r' then 'RESTRICT'
              when 'c' then 'CASCADE'
              when 'n' then 'SET NULL'
              when 'd' then 'SET DEFAULT'
              else 'NO ACTION'
            end as on_delete,
            case con.confupdtype
              when 'a' then 'NO ACTION'
              when 'r' then 'RESTRICT'
              when 'c' then 'CASCADE'
              when 'n' then 'SET NULL'
              when 'd' then 'SET DEFAULT'
              else 'NO ACTION'
            end as on_update
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_class rc on rc.oid = con.confrelid
       join pg_namespace rn on rn.oid = rc.relnamespace
       join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
       join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
       join lateral unnest(con.confkey) with ordinality as rk(attnum, ord) on rk.ord = k.ord
       join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = rk.attnum
      where con.contype = 'f' and n.nspname = $1 and c.relname = $2
      group by con.conname, rn.nspname, rc.relname, con.confdeltype, con.confupdtype
      order by con.conname`,
    [schema, table]
  )
  const foreignKeys: ForeignKeyInfo[] = fkRes.rows.map((r) => ({
    name: r.name,
    columns: r.columns,
    referencedSchema: r.referenced_schema,
    referencedTable: r.referenced_table,
    referencedColumns: r.referenced_columns,
    onDelete: r.on_delete,
    onUpdate: r.on_update
  }))

  const result: TableDetails = {
    schema,
    name: table,
    type,
    columns,
    primaryKey,
    indexes,
    foreignKeys,
    estimatedRows:
      kindRes.rows[0].estimated_rows == null ? null : Number(kindRes.rows[0].estimated_rows)
  }
  tableDetailsCache.set(cacheKey, result)
  return result
}

/**
 * The same constraint catalogue as `tableDetails`, filtered on the referenced
 * side instead of the referencing one, so it finds the children pointing here.
 * Not folded into `tableDetails`: that result is cached per table and this scans
 * every constraint in the database, which is a cost the data grid should not pay
 * on every table it opens.
 */
async function referencingKeys(
  connectionId: string,
  schema: string,
  table: string
): Promise<ReferencingKeyInfo[]> {
  const pool = getPool(connectionId)
  const res = await pool.query<{
    name: string
    child_schema: string
    child_table: string
    columns: string[]
    referenced_columns: string[]
    on_delete: string
    on_update: string
  }>(
    `select con.conname as name,
            n.nspname as child_schema,
            c.relname as child_table,
            array_agg(a.attname::text order by k.ord) as columns,
            array_agg(ra.attname::text order by k.ord) as referenced_columns,
            case con.confdeltype
              when 'a' then 'NO ACTION'
              when 'r' then 'RESTRICT'
              when 'c' then 'CASCADE'
              when 'n' then 'SET NULL'
              when 'd' then 'SET DEFAULT'
              else 'NO ACTION'
            end as on_delete,
            case con.confupdtype
              when 'a' then 'NO ACTION'
              when 'r' then 'RESTRICT'
              when 'c' then 'CASCADE'
              when 'n' then 'SET NULL'
              when 'd' then 'SET DEFAULT'
              else 'NO ACTION'
            end as on_update
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_class rc on rc.oid = con.confrelid
       join pg_namespace rn on rn.oid = rc.relnamespace
       join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
       join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
       join lateral unnest(con.confkey) with ordinality as rk(attnum, ord) on rk.ord = k.ord
       join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = rk.attnum
      where con.contype = 'f' and rn.nspname = $1 and rc.relname = $2
      group by con.conname, n.nspname, c.relname, con.confdeltype, con.confupdtype
      order by n.nspname, c.relname, con.conname`,
    [schema, table]
  )
  return res.rows.map((r) => ({
    name: r.name,
    schema: r.child_schema,
    table: r.child_table,
    columns: r.columns,
    referencedSchema: schema,
    referencedTable: table,
    referencedColumns: r.referenced_columns,
    onDelete: r.on_delete,
    onUpdate: r.on_update
  }))
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function qualifiedTable(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`
}

const filterDialect: FilterDialect = {
  quoteIdent,
  placeholder: (position) => `$${position}`,
  supportsIlike: true
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
  const rowsRes = await pool.query<Record<string, unknown>>(sql, params)

  return {
    rows: rowsRes.rows,
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
  const res = await pool.query<{ total: string }>(
    `select count(*)::text as total from ${qualifiedTable(opts.schema, opts.table)} ${whereSql}`,
    params
  )
  const total = Number(res.rows[0]?.total)
  return Number.isFinite(total) ? total : null
}

function returningClause(details: { columns: { name: string }[] }): string {
  return `returning ${details.columns.map((c) => quoteIdent(c.name)).join(', ')}`
}

async function insertRow(opts: RowMutation): Promise<Record<string, unknown>> {
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  const validColumns = new Map(details.columns.map((c) => [c.name, c]))

  const cols: string[] = []
  const values: unknown[] = []
  const placeholders: string[] = []
  for (const [key, value] of Object.entries(opts.values)) {
    if (!validColumns.has(key)) continue
    cols.push(quoteIdent(key))
    values.push(value)
    placeholders.push(`$${values.length}`)
  }
  if (cols.length === 0) throw new Error('No valid columns to insert')

  const pool = getPool(opts.connectionId)
  const sql = `insert into ${qualifiedTable(opts.schema, opts.table)} (${cols.join(', ')}) values (${placeholders.join(', ')}) ${returningClause(details)}`
  const res = await pool.query<Record<string, unknown>>(sql, values)
  return res.rows[0]
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
    params.push(value)
    setClauses.push(`${quoteIdent(key)} = $${params.length}`)
  }
  if (setClauses.length === 0) throw new Error('No columns to update')

  const whereClauses: string[] = []
  for (const pkCol of details.primaryKey) {
    if (!(pkCol in opts.pk)) throw new Error(`Missing primary key column ${pkCol}`)
    params.push(opts.pk[pkCol])
    whereClauses.push(`${quoteIdent(pkCol)} = $${params.length}`)
  }

  const pool = getPool(opts.connectionId)
  const sql = `update ${qualifiedTable(opts.schema, opts.table)} set ${setClauses.join(', ')} where ${whereClauses.join(' and ')} ${returningClause(details)}`
  const res = await pool.query<Record<string, unknown>>(sql, params)
  if (res.rowCount === 0) throw new Error('No row matched the primary key')
  return res.rows[0]
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
    params.push(opts.pk[pkCol])
    whereClauses.push(`${quoteIdent(pkCol)} = $${params.length}`)
  }
  const pool = getPool(opts.connectionId)
  const sql = `delete from ${qualifiedTable(opts.schema, opts.table)} where ${whereClauses.join(' and ')}`
  const res = await pool.query(sql, params)
  return { deleted: res.rowCount ?? 0 }
}

const ddlDialect: DdlDialect = {
  quoteIdent,
  qualifiedTable,
  dropIndex: (schema, _table, name) => `DROP INDEX ${quoteIdent(schema)}.${quoteIdent(name)}`,
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

interface PgInflightQuery {
  pid: number
  connectionId: string
}
const pgInflight = new Map<string, PgInflightQuery>()

async function runQuery(opts: RunQueryOptions): Promise<QueryResult> {
  const pool = getPool(opts.connectionId)
  const started = Date.now()
  // Runs on a dedicated client (so the backend PID is stable for cancellation),
  // which bypasses the instrumented pool.query - log it explicitly.
  const client = await pool.connect()
  try {
    let pid: number | null = null
    if (opts.queryId) {
      const pidRes = await client.query<{ pid: number }>('select pg_backend_pid() as pid')
      pid = pidRes.rows[0]?.pid ?? null
      if (pid != null) {
        pgInflight.set(opts.queryId, { pid, connectionId: opts.connectionId })
      }
    }
    try {
      const res = await client.query<Record<string, unknown>>(opts.sql, opts.params)
      // A multi-statement query (e.g. several INSERTs) makes pg return an array of
      // results - show the last statement's rows/columns and the total affected rows.
      const results = Array.isArray(res) ? res : [res]
      const primary = results[results.length - 1]
      const allRows = primary.rows ?? []
      const truncated = allRows.length > MAX_QUERY_RESULT_ROWS
      const rows = truncated ? allRows.slice(0, MAX_QUERY_RESULT_ROWS) : allRows
      const rowCount = results.reduce((sum, r) => sum + (r.rowCount ?? 0), 0)
      recordQuery({
        origin: 'user',
        connectionId: opts.connectionId,
        engine: 'postgres',
        sql: opts.sql,
        params: opts.params ?? [],
        durationMs: Date.now() - started,
        rowCount,
        success: true
      })
      if (isSchemaChanging(opts.sql)) invalidateTableDetailsForConnection(opts.connectionId)
      return {
        success: true,
        rows,
        fields: (primary.fields ?? []).map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
        rowCount,
        command: primary.command ?? detectCommand(opts.sql),
        durationMs: Date.now() - started,
        truncated
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      recordQuery({
        origin: 'user',
        connectionId: opts.connectionId,
        engine: 'postgres',
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
    if (opts.queryId) pgInflight.delete(opts.queryId)
    client.release()
  }
}

async function cancelQuery(connectionId: string, queryId: string): Promise<void> {
  const entry = pgInflight.get(queryId)
  if (!entry || entry.connectionId !== connectionId) return
  const pool = getPool(connectionId)
  try {
    await pool.query('select pg_cancel_backend($1)', [entry.pid])
  } catch (err) {
    console.error('[postgres] cancel failed:', err)
  }
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
    where = `where ${quoteIdent(opts.column)}::text ilike $${params.length}`
  }
  params.push(limit)
  const sql = `select distinct ${quoteIdent(opts.column)} as value from ${qualifiedTable(opts.schema, opts.table)} ${where} order by 1 nulls last limit $${params.length}`
  const res = await pool.query<{ value: unknown }>(sql, params)
  return res.rows.map((r) => r.value)
}

async function getOverview(connectionId: string): Promise<ConnectionOverview> {
  const pool = getPool(connectionId)
  const systemFilter = SYSTEM_SCHEMAS.map((_, i) => `$${i + 1}`).join(', ')

  const [meta, counts, tables] = await Promise.all([
    pool.query<{ database: string; version: string; size: string | null }>(
      // pg_database_size needs CONNECT on the database, which the current user
      // has by definition - but a restricted role can still be refused, so it
      // is read separately from the counts and allowed to be null.
      `select current_database() as database,
              version() as version,
              pg_database_size(current_database())::text as size`
    ),
    pool.query<{ schemas: string; tables: string; views: string }>(
      `select count(distinct n.nspname)::text as schemas,
              count(*) filter (where c.relkind in ('r','p'))::text as tables,
              count(*) filter (where c.relkind in ('v','m'))::text as views
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname not in (${systemFilter})
          and n.nspname not like 'pg_temp_%'
          and c.relkind in ('r','p','v','m')`,
      SYSTEM_SCHEMAS
    ),
    pool.query<{ schema: string; name: string; bytes: string; estimated_rows: string | null }>(
      `select n.nspname as schema,
              c.relname as name,
              pg_total_relation_size(c.oid)::text as bytes,
              case when c.reltuples >= 0 then c.reltuples::bigint::text else null end
                as estimated_rows
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname not in (${systemFilter})
          and n.nspname not like 'pg_temp_%'
          and c.relkind in ('r','p')
        order by pg_total_relation_size(c.oid) desc
        limit ${OVERVIEW_TABLE_LIMIT}`,
      SYSTEM_SCHEMAS
    )
  ])

  const row = meta.rows[0]
  const countRow = counts.rows[0]
  return {
    databaseName: row?.database ?? '',
    serverVersion: row?.version ?? '',
    schemaCount: toCount(countRow?.schemas),
    tableCount: toCount(countRow?.tables),
    viewCount: toCount(countRow?.views),
    totalBytes: row?.size == null ? null : toCount(row.size),
    largestTables: tables.rows.map((t) => ({
      schema: t.schema,
      name: t.name,
      bytes: toCount(t.bytes),
      estimatedRows: t.estimated_rows == null ? null : toCount(t.estimated_rows)
    }))
  }
}

async function getSchemaGraph(connectionId: string, schema: string): Promise<SchemaGraph> {
  const pool = getPool(connectionId)

  const tablesPromise = pool.query<{ name: string }>(
    `select c.relname as name
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relkind in ('r','p')
      order by c.relname`,
    [schema]
  )

  const columnsPromise = pool.query<{
    table: string
    name: string
    data_type: string
    udt_schema: string
    udt_name: string
    is_nullable: string
  }>(
    `select table_name as table,
            column_name as name,
            data_type,
            udt_schema,
            udt_name,
            is_nullable
       from information_schema.columns
      where table_schema = $1
      order by table_name, ordinal_position`,
    [schema]
  )

  const pksPromise = pool.query<{ table: string; column: string }>(
    `select c.relname as table, a.attname as column
       from pg_index i
       join pg_class c on c.oid = i.indrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where n.nspname = $1 and i.indisprimary and c.relkind in ('r','p')`,
    [schema]
  )

  const edgesPromise = pool.query<{
    name: string
    from_table: string
    from_columns: string[]
    to_schema: string
    to_table: string
    to_columns: string[]
  }>(
    `select con.conname as name,
            c.relname as from_table,
            array_agg(a.attname::text order by k.ord) as from_columns,
            rn.nspname as to_schema,
            rc.relname as to_table,
            array_agg(ra.attname::text order by k.ord) as to_columns
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_class rc on rc.oid = con.confrelid
       join pg_namespace rn on rn.oid = rc.relnamespace
       join lateral unnest(con.conkey) with ordinality as k(attnum, ord) on true
       join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
       join lateral unnest(con.confkey) with ordinality as rk(attnum, ord) on rk.ord = k.ord
       join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = rk.attnum
      where con.contype = 'f' and n.nspname = $1
      group by con.conname, rn.nspname, rc.relname, c.relname
      order by c.relname, con.conname`,
    [schema]
  )

  const [tablesRes, columnsRes, pksRes, edgesRes] = await Promise.all([
    tablesPromise,
    columnsPromise,
    pksPromise,
    edgesPromise
  ])

  const enumLabelsByType = await enumLabelsFor(pool, columnsRes.rows)

  const pkSet = new Set(pksRes.rows.map((r) => `${r.table}.${r.column}`))
  const columnsByTable = new Map<string, SchemaGraphTable['columns']>()
  for (const row of columnsRes.rows) {
    const list = columnsByTable.get(row.table) ?? []
    list.push({
      name: row.name,
      dataType: row.data_type,
      udtName: row.udt_name,
      isNullable: row.is_nullable === 'YES',
      isPrimaryKey: pkSet.has(`${row.table}.${row.name}`),
      enumValues: enumLabelsByType.get(`${row.udt_schema}.${row.udt_name}`) ?? null
    })
    columnsByTable.set(row.table, list)
  }

  const tables: SchemaGraphTable[] = tablesRes.rows.map((t) => ({
    schema,
    name: t.name,
    columns: columnsByTable.get(t.name) ?? []
  }))

  const edges: SchemaGraphEdge[] = edgesRes.rows.map((e) => ({
    name: e.name,
    from: { schema, table: e.from_table, columns: e.from_columns },
    to: { schema: e.to_schema, table: e.to_table, columns: e.to_columns }
  }))

  return { schema, tables, edges }
}

export const postgresDriver: DatabaseDriver = {
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
  getOverview
}
