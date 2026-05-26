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

const CF_API = 'https://api.cloudflare.com/client/v4'

interface D1QueryMeta {
  duration?: number
  changes?: number
  last_row_id?: number
  rows_read?: number
  rows_written?: number
  served_by?: string
}

interface D1QueryResultEntry<TRow = Record<string, unknown>> {
  results: TRow[]
  success: boolean
  meta: D1QueryMeta
}

interface D1Envelope<TRow = Record<string, unknown>> {
  success: boolean
  errors: { code: number; message: string }[]
  messages: { code: number; message: string }[]
  result?: D1QueryResultEntry<TRow>[]
}

function requireD1Credentials(input: ConnectionInput): {
  accountId: string
  databaseId: string
  apiToken: string
} {
  const accountId = (input.accountId ?? '').trim()
  const databaseId = (input.databaseId ?? '').trim()
  const apiToken = (input.apiToken ?? '').trim()
  if (!accountId) throw new Error('Cloudflare account ID is required')
  if (!databaseId) throw new Error('D1 database ID is required')
  if (!apiToken) throw new Error('Cloudflare API token is required')
  return { accountId, databaseId, apiToken }
}

async function callD1<TRow = Record<string, unknown>>(
  input: ConnectionInput,
  sql: string,
  params: unknown[] = []
): Promise<D1QueryResultEntry<TRow>> {
  const { accountId, databaseId, apiToken } = requireD1Credentials(input)
  const url = `${CF_API}/accounts/${accountId}/d1/database/${databaseId}/query`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql, params })
    })
  } catch (err) {
    throw new Error(
      `Failed to reach Cloudflare API: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  let envelope: D1Envelope<TRow>
  try {
    envelope = (await res.json()) as D1Envelope<TRow>
  } catch {
    throw new Error(`Cloudflare API returned a non-JSON response (HTTP ${res.status})`)
  }

  if (!res.ok || !envelope.success) {
    const message = envelope.errors?.[0]?.message || `Cloudflare API error (HTTP ${res.status})`
    throw new Error(message)
  }

  const entry = envelope.result?.[0]
  if (!entry) {
    return { results: [], success: true, meta: {} }
  }
  if (!entry.success) {
    throw new Error('D1 query failed')
  }
  return entry
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function quoteLiteral(name: string): string {
  return `'${name.replace(/'/g, "''")}'`
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

function normalizeUdtName(declared: string): string {
  const t = declared.toLowerCase().trim()
  if (!t) return 'text'
  if (t.includes('json')) return 'json'
  if (t.includes('bool')) return 'bool'
  if (
    t.includes('int') ||
    t.includes('real') ||
    t.includes('floa') ||
    t.includes('doub') ||
    t.includes('numeric') ||
    t.includes('decimal')
  ) {
    return t.includes('int') ? 'int4' : 'float8'
  }
  return 'text'
}

async function test(input: ConnectionInput): Promise<TestConnectionResult> {
  try {
    await callD1<{ ok: number }>(input, 'select 1 as ok')
    return { success: true, serverVersion: 'Cloudflare D1' }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function describeActive(saved: SavedConnection): Promise<ActiveMeta> {
  await callD1<{ ok: number }>(saved, 'select 1 as ok')
  return {
    serverVersion: 'Cloudflare D1',
    currentDatabase: saved.databaseId ?? saved.name,
    currentUser: 'D1'
  }
}

async function disconnectPool(connectionId: string): Promise<void> {
  // D1 is stateless HTTP — nothing to close.
  void connectionId
}

async function disconnectAll(): Promise<void> {
  // Same — no-op.
}

function loadSaved(connectionId: string): SavedConnection {
  const saved = getConnection(connectionId)
  if (!saved) throw new Error(`Connection ${connectionId} is not saved`)
  if (saved.engine !== 'd1') throw new Error(`Wrong driver for connection ${connectionId}`)
  return saved
}

async function listSchemas(connectionId: string): Promise<SchemaInfo[]> {
  void connectionId
  return [{ name: 'main' }]
}

async function listTables(connectionId: string, schema: string): Promise<TableInfo[]> {
  void schema
  const saved = loadSaved(connectionId)
  const entry = await callD1<{ name: string; type: string }>(
    saved,
    `select name, type from sqlite_master
      where type in ('table', 'view')
        and name not like 'sqlite_%'
        and name not like '_cf_%'
      order by name`
  )
  return entry.results.map((r) => ({
    schema: 'main',
    name: String(r.name),
    type: r.type === 'view' ? 'view' : 'table',
    estimatedRows: null
  }))
}

async function tableDetails(
  connectionId: string,
  schema: string,
  table: string
): Promise<TableDetails> {
  const saved = loadSaved(connectionId)

  const metaEntry = await callD1<{ type: string; sql: string | null }>(
    saved,
    `select type, sql from sqlite_master where type in ('table', 'view') and name = ? limit 1`,
    [table]
  )
  if (metaEntry.results.length === 0) {
    throw new Error(`Table ${table} not found`)
  }
  const type: TableDetails['type'] = metaEntry.results[0].type === 'view' ? 'view' : 'table'

  // PRAGMAs don't accept bind params; embed quoted identifier literally.
  const tableIdent = quoteIdent(table)

  const colEntry = await callD1<{
    cid: number
    name: string
    type: string
    notnull: number
    dflt_value: string | null
    pk: number
  }>(saved, `pragma table_info(${tableIdent})`)

  const columns: ColumnInfo[] = colEntry.results.map((r) => ({
    name: String(r.name),
    dataType: String(r.type || 'TEXT'),
    udtName: normalizeUdtName(String(r.type)),
    isNullable: Number(r.notnull) === 0,
    isPrimaryKey: Number(r.pk) > 0,
    defaultValue: r.dflt_value == null ? null : String(r.dflt_value),
    ordinalPosition: Number(r.cid) + 1,
    characterMaximumLength: null
  }))

  const primaryKey = colEntry.results
    .filter((r) => Number(r.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk))
    .map((r) => String(r.name))

  const idxListEntry = await callD1<{
    seq: number
    name: string
    unique: number
    origin: string
    partial: number
  }>(saved, `pragma index_list(${tableIdent})`)

  const indexes: IndexInfo[] = []
  for (const idx of idxListEntry.results) {
    const indexName = String(idx.name)
    const colsEntry = await callD1<{ seqno: number; cid: number; name: string }>(
      saved,
      `pragma index_info(${quoteIdent(indexName)})`
    )
    indexes.push({
      name: indexName,
      isUnique: Number(idx.unique) === 1,
      isPrimary: idx.origin === 'pk',
      columns: colsEntry.results
        .sort((a, b) => Number(a.seqno) - Number(b.seqno))
        .map((c) => String(c.name)),
      definition: ''
    })
  }

  const fkEntry = await callD1<{
    id: number
    seq: number
    table: string
    from: string
    to: string
    on_update: string
    on_delete: string
    match: string
  }>(saved, `pragma foreign_key_list(${tableIdent})`)

  const fkGroups = new Map<
    number,
    {
      table: string
      onUpdate: string
      onDelete: string
      pairs: { from: string; to: string; seq: number }[]
    }
  >()
  for (const fk of fkEntry.results) {
    const id = Number(fk.id)
    const existing = fkGroups.get(id)
    if (existing) {
      existing.pairs.push({ from: String(fk.from), to: String(fk.to), seq: Number(fk.seq) })
    } else {
      fkGroups.set(id, {
        table: String(fk.table),
        onUpdate: String(fk.on_update ?? 'NO ACTION'),
        onDelete: String(fk.on_delete ?? 'NO ACTION'),
        pairs: [{ from: String(fk.from), to: String(fk.to), seq: Number(fk.seq) }]
      })
    }
  }
  const foreignKeys: ForeignKeyInfo[] = [...fkGroups.entries()].map(([id, g]) => {
    const sorted = g.pairs.sort((a, b) => a.seq - b.seq)
    return {
      name: `fk_${id}`,
      columns: sorted.map((p) => p.from),
      referencedSchema: 'main',
      referencedTable: g.table,
      referencedColumns: sorted.map((p) => p.to),
      onDelete: g.onDelete,
      onUpdate: g.onUpdate
    }
  })

  return {
    schema,
    name: table,
    type,
    columns,
    primaryKey,
    indexes,
    foreignKeys,
    estimatedRows: null
  }
}

async function getRows(opts: GetRowsOptions): Promise<RowsResult> {
  const saved = loadSaved(opts.connectionId)
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
      // SQLite lacks ILIKE; map to LIKE (SQLite LIKE is case-insensitive for ASCII by default).
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

  const sql = `select * from ${quoteIdent(opts.table)} ${whereSql} ${orderSql} limit ${limit} offset ${offset}`
  const entry = await callD1(saved, sql, params)

  return {
    rows: entry.results,
    columns: details.columns,
    totalEstimate: null
  }
}

async function fetchByPk(
  saved: SavedConnection,
  table: string,
  pk: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const keys = Object.keys(pk)
  if (keys.length === 0) return {}
  const where = keys.map((k) => `${quoteIdent(k)} = ?`).join(' and ')
  const sql = `select * from ${quoteIdent(table)} where ${where} limit 1`
  const entry = await callD1(
    saved,
    sql,
    keys.map((k) => pk[k])
  )
  return entry.results[0] ?? {}
}

async function insertRow(opts: RowMutation): Promise<Record<string, unknown>> {
  const saved = loadSaved(opts.connectionId)
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
  const entry = await callD1(saved, sql, values)

  const pk: Record<string, unknown> = {}
  if (details.primaryKey.length === 1) {
    const pkCol = details.primaryKey[0]
    if (opts.values[pkCol] != null) {
      pk[pkCol] = opts.values[pkCol]
    } else if (entry.meta.last_row_id != null) {
      pk[pkCol] = entry.meta.last_row_id
    }
  } else {
    for (const pkCol of details.primaryKey) {
      if (opts.values[pkCol] != null) pk[pkCol] = opts.values[pkCol]
    }
  }

  if (details.primaryKey.length > 0 && Object.keys(pk).length === details.primaryKey.length) {
    return fetchByPk(saved, opts.table, pk)
  }
  return {}
}

async function updateRow(opts: RowUpdate): Promise<Record<string, unknown>> {
  const saved = loadSaved(opts.connectionId)
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
  const entry = await callD1(saved, sql, params)
  if ((entry.meta.changes ?? 0) === 0) throw new Error('No row matched the primary key')

  const newPk: Record<string, unknown> = {}
  for (const pkCol of details.primaryKey) {
    newPk[pkCol] = opts.values[pkCol] != null ? opts.values[pkCol] : opts.pk[pkCol]
  }
  return fetchByPk(saved, opts.table, newPk)
}

async function deleteRow(opts: RowDelete): Promise<{ deleted: number }> {
  const saved = loadSaved(opts.connectionId)
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
  const entry = await callD1(saved, sql, params)
  return { deleted: entry.meta.changes ?? 0 }
}

function detectCommand(sql: string): string | null {
  const trimmed = sql.trim().split(/\s+/)[0]
  return trimmed ? trimmed.toUpperCase() : null
}

async function runQuery(opts: RunQueryOptions): Promise<QueryResult> {
  const saved = loadSaved(opts.connectionId)
  const started = Date.now()
  try {
    const entry = await callD1(saved, opts.sql, opts.params ?? [])
    const fieldNames = entry.results[0] ? Object.keys(entry.results[0]) : []
    return {
      success: true,
      rows: entry.results,
      fields: fieldNames.map((name) => ({ name, dataTypeID: 0 })),
      rowCount: entry.results.length > 0 ? entry.results.length : (entry.meta.changes ?? null),
      command: detectCommand(opts.sql),
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

// quoteLiteral is reserved for future use (e.g., DDL helpers that can't bind).
void quoteLiteral

export const d1Driver: DatabaseDriver = {
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
