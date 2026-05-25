import { Pool, type PoolConfig } from 'pg'
import type {
  ColumnInfo,
  ConnectionInput,
  ForeignKeyInfo,
  GetRowsOptions,
  IndexInfo,
  QueryResult,
  RowDelete,
  RowMutation,
  RowUpdate,
  RowsResult,
  RunQueryOptions,
  SavedConnection,
  SchemaInfo,
  TableDetails,
  TableInfo,
  TestConnectionResult
} from '../../../shared/types'
import { getConnection } from '../../store/connections-store'
import type { ActiveMeta, DatabaseDriver } from './types'

const pools = new Map<string, Pool>()

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
  const saved = getConnection(connectionId)
  if (!saved) throw new Error(`Connection ${connectionId} is not saved`)
  if (saved.engine !== 'postgres') throw new Error(`Wrong driver for connection ${connectionId}`)
  const pool = new Pool(toPoolConfig(saved))
  pool.on('error', (err) => {
    console.error(`[pg pool ${connectionId}] error`, err)
  })
  pools.set(connectionId, pool)
  return pool
}

async function disconnectPool(connectionId: string): Promise<void> {
  const pool = pools.get(connectionId)
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

async function tableDetails(
  connectionId: string,
  schema: string,
  table: string
): Promise<TableDetails> {
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
    udt_name: string
    is_nullable: string
    default_value: string | null
    ordinal_position: number
    character_maximum_length: number | null
  }>(
    `select column_name as name,
            data_type,
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
  const pkSet = new Set(primaryKey)
  const columns: ColumnInfo[] = colsRes.rows.map((r) => ({
    name: r.name,
    dataType: r.data_type,
    udtName: r.udt_name,
    isNullable: r.is_nullable === 'YES',
    isPrimaryKey: pkSet.has(r.name),
    defaultValue: r.default_value,
    ordinalPosition: r.ordinal_position,
    characterMaximumLength: r.character_maximum_length
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

  return {
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
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
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
      params.push(filter.value)
      whereClauses.push(`${quoteIdent(filter.column)} ${filter.operator} $${params.length}`)
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
  const rowsRes = await pool.query<Record<string, unknown>>(sql, params)

  return {
    rows: rowsRes.rows,
    columns: details.columns,
    totalEstimate: details.estimatedRows
  }
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

async function runQuery(opts: RunQueryOptions): Promise<QueryResult> {
  const pool = getPool(opts.connectionId)
  const started = Date.now()
  try {
    const res = await pool.query<Record<string, unknown>>(opts.sql, opts.params)
    return {
      success: true,
      rows: res.rows,
      fields: res.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
      rowCount: res.rowCount,
      command: res.command ?? null,
      durationMs: Date.now() - started
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      rows: [],
      fields: [],
      rowCount: null,
      command: null,
      durationMs: Date.now() - started
    }
  }
}

export const postgresDriver: DatabaseDriver = {
  test,
  describeActive,
  disconnectPool,
  disconnectAll,
  listSchemas,
  listTables,
  tableDetails,
  getRows,
  insertRow,
  updateRow,
  deleteRow,
  runQuery
}
