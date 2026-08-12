import {
  MAX_QUERY_RESULT_ROWS,
  OVERVIEW_TABLE_LIMIT,
  type ConnectionOverview,
  type CountRowsOptions,
  type ConnectionInput,
  type DdlRequest,
  type DistinctValuesOptions,
  type GetRowsOptions,
  type IndexInfo,
  type QueryOrigin,
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
  ValueSearchResult
} from '../../../shared/types'
import { requireConnection } from '../../store/connections-store'
import { buildDdl } from '../ddl'
import { toCount } from '../coerce'
import { buildOrderBySql } from '../order-by'
import { buildFilterSql } from '../filters'
import {
  LIST_BASE_TABLES_SQL,
  LIST_TABLES_SQL,
  SQLITE_SCHEMA,
  normalizeUdtName,
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
import { isSearchCancelled, sweepTables, type ValueSearchDialect } from '../value-search'
import { recordQuery } from '../query-log'
import { detectCommand, isSchemaChanging } from '../sql-command'
import type { ActiveMeta, DatabaseDriver } from './types'

const CF_API = 'https://api.cloudflare.com/client/v4'

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
  params: unknown[] = [],
  signal?: AbortSignal,
  origin: QueryOrigin = 'internal'
): Promise<D1QueryResultEntry<TRow>> {
  const connectionId = 'id' in input ? (input as SavedConnection).id : '<test>'
  const t0 = Date.now()
  try {
    const entry = await callD1Raw<TRow>(input, sql, params, signal)
    recordQuery({
      connectionId,
      engine: 'd1',
      sql,
      params,
      durationMs: Date.now() - t0,
      rowCount: entry.results?.length ?? null,
      success: true,
      origin
    })
    return entry
  } catch (err) {
    recordQuery({
      connectionId,
      engine: 'd1',
      sql,
      params,
      durationMs: Date.now() - t0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      origin
    })
    throw err
  }
}

/** D1 is HTTP-only; without this a stalled request hangs the UI forever. */
const D1_REQUEST_TIMEOUT_MS = 30_000

class QueryCancelledError extends Error {
  constructor() {
    super('Query cancelled')
    this.name = 'QueryCancelledError'
  }
}

async function callD1Raw<TRow = Record<string, unknown>>(
  input: ConnectionInput,
  sql: string,
  params: unknown[],
  signal?: AbortSignal
): Promise<D1QueryResultEntry<TRow>> {
  const { accountId, databaseId, apiToken } = requireD1Credentials(input)
  const url = `${CF_API}/accounts/${accountId}/d1/database/${databaseId}/query`

  const timeout = AbortSignal.timeout(D1_REQUEST_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql, params }),
      signal: combined
    })
  } catch (err) {
    // A user-initiated cancel is not a network failure - report it as itself.
    if (signal?.aborted) throw new QueryCancelledError()
    if (timeout.aborted) {
      throw new Error(`Cloudflare API did not respond within ${D1_REQUEST_TIMEOUT_MS / 1000}s`)
    }
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
    const message = envelope.errors?.map((e) => e.message).join('; ')
    throw new Error(message || `Cloudflare API error (HTTP ${res.status})`)
  }

  const entry = envelope.result?.[0]
  if (!entry) {
    return { results: [], success: true, meta: {} }
  }
  if (!entry.success) {
    const message = envelope.errors?.map((e) => e.message).join('; ')
    throw new Error(message || 'D1 query failed')
  }
  // D1 omits `results` for some statements - normalize once so every caller can
  // index it safely.
  return { ...entry, results: entry.results ?? [], meta: entry.meta ?? {} }
}

/**
 * Cloudflare rate-limits the D1 query API, so introspection that fans out over
 * every table (or every index) runs a few at a time rather than all at once.
 */
const D1_MAX_CONCURRENT_REQUESTS = 6

async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  fn: (item: TItem) => Promise<TResult>,
  limit = D1_MAX_CONCURRENT_REQUESTS
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
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
    currentDatabase: saved.name || (saved.databaseId ?? ''),
    currentUser: 'D1'
  }
}

async function disconnectPool(connectionId: string): Promise<void> {
  // D1 is stateless HTTP - nothing to close, but still flush cached schema.
  invalidateTableDetailsForConnection(connectionId)
}

async function disconnectAll(): Promise<void> {
  // Same - no-op.
}

function loadSaved(connectionId: string): SavedConnection {
  const saved = requireConnection(connectionId)
  if (saved.engine !== 'd1') throw new Error(`Wrong driver for connection ${connectionId}`)
  return saved
}

async function listSchemas(connectionId: string): Promise<SchemaInfo[]> {
  void connectionId
  return [{ name: SQLITE_SCHEMA }]
}

async function listTables(connectionId: string, schema: string): Promise<TableInfo[]> {
  void schema
  const saved = loadSaved(connectionId)
  const entry = await callD1<{ name: string; type: string }>(saved, LIST_TABLES_SQL)
  return entry.results.map((r) => ({
    schema: SQLITE_SCHEMA,
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
  const cacheKey = tableCacheKey(connectionId, schema, table)
  const cached = tableDetailsCache.get(cacheKey)
  if (cached) return cached

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

  // Every pragma is a separate HTTP round-trip to Cloudflare - issue the
  // independent ones together instead of paying the latency three times over.
  const [colEntry, idxListEntry, fkEntry] = await Promise.all([
    callD1<TableInfoRow>(saved, `pragma table_info(${tableIdent})`),
    callD1<IndexListRow>(saved, `pragma index_list(${tableIdent})`),
    callD1<ForeignKeyRow>(saved, `pragma foreign_key_list(${tableIdent})`)
  ])

  const columns = toColumns(colEntry.results)
  const primaryKey = toPrimaryKey(colEntry.results)

  const indexes: IndexInfo[] = await mapWithConcurrency(idxListEntry.results, async (idx) => {
    const colsEntry = await callD1<IndexInfoRow>(
      saved,
      `pragma index_info(${quoteIdent(String(idx.name))})`
    )
    return toIndex(idx, colsEntry.results)
  })

  const foreignKeys = toForeignKeys(fkEntry.results)

  const result: TableDetails = {
    schema,
    name: table,
    type,
    columns,
    primaryKey,
    indexes,
    foreignKeys,
    estimatedRows: null
  }
  tableDetailsCache.set(cacheKey, result)
  return result
}

async function getRows(opts: GetRowsOptions): Promise<RowsResult> {
  const saved = loadSaved(opts.connectionId)
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  const validColumns = new Set(details.columns.map((c) => c.name))

  // SQLite lacks ILIKE; the dialect folds it onto LIKE, which is already
  // case-insensitive for ASCII by default.
  const { whereSql, params } = buildFilterSql(
    opts.filters,
    validColumns,
    sqliteFilterDialect,
    opts.filterJoin
  )

  const orderSql = buildOrderBySql(opts.orderBy, opts.orderDir, details.primaryKey, validColumns, {
    quoteIdent
  })

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

async function countRows(opts: CountRowsOptions): Promise<number | null> {
  const saved = loadSaved(opts.connectionId)
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  const validColumns = new Set(details.columns.map((c) => c.name))
  const { whereSql, params } = buildFilterSql(
    opts.filters,
    validColumns,
    sqliteFilterDialect,
    opts.filterJoin
  )

  // SQLite keeps no row estimate, so there is no cheap total to fall back on -
  // count unconditionally. D1 databases are small enough for that to be fine.
  const entry = await callD1<{ total: number }>(
    saved,
    `select count(*) as total from ${quoteIdent(opts.table)} ${whereSql}`,
    params
  )
  const total = Number(entry.results[0]?.total)
  return Number.isFinite(total) ? total : null
}

async function fetchByRowid(
  saved: SavedConnection,
  table: string,
  rowid: number
): Promise<Record<string, unknown>> {
  try {
    const entry = await callD1(
      saved,
      `select * from ${quoteIdent(table)} where rowid = ? limit 1`,
      [rowid]
    )
    return entry.results[0] ?? {}
  } catch {
    // WITHOUT ROWID tables have no rowid column - nothing to read back.
    return {}
  }
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
  for (const pkCol of details.primaryKey) {
    if (opts.values[pkCol] != null) pk[pkCol] = opts.values[pkCol]
  }
  if (details.primaryKey.length > 0 && Object.keys(pk).length === details.primaryKey.length) {
    return fetchByPk(saved, opts.table, pk)
  }

  // The PK was assigned by the database. last_row_id is the rowid, which only
  // doubles as the PK for an INTEGER PRIMARY KEY alias - so read the row back by
  // rowid instead of pretending the rowid is the key.
  if (entry.meta.last_row_id != null) {
    return fetchByRowid(saved, opts.table, entry.meta.last_row_id)
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

async function generateDdl(opts: DdlRequest): Promise<string> {
  return buildDdl(opts.operation, opts.schema, opts.table, sqliteDdlDialect)
}

async function executeDdl(opts: DdlRequest): Promise<void> {
  const saved = loadSaved(opts.connectionId)
  const sql = buildDdl(opts.operation, opts.schema, opts.table, sqliteDdlDialect)
  await callD1(saved, sql)
  invalidateTableDetailsForConnection(opts.connectionId)
}

const d1Inflight = new Map<string, { controller: AbortController; connectionId: string }>()

async function runQuery(opts: RunQueryOptions): Promise<QueryResult> {
  const saved = loadSaved(opts.connectionId)
  const started = Date.now()
  const controller = new AbortController()
  if (opts.queryId) {
    d1Inflight.set(opts.queryId, { controller, connectionId: opts.connectionId })
  }
  try {
    const entry = await callD1(saved, opts.sql, opts.params ?? [], controller.signal, 'user')
    const fieldNames = entry.results[0] ? Object.keys(entry.results[0]) : []
    const truncated = entry.results.length > MAX_QUERY_RESULT_ROWS
    const rows = truncated ? entry.results.slice(0, MAX_QUERY_RESULT_ROWS) : entry.results
    if (isSchemaChanging(opts.sql)) invalidateTableDetailsForConnection(opts.connectionId)
    return {
      success: true,
      rows,
      fields: fieldNames.map((name) => ({ name, dataTypeID: 0 })),
      rowCount: entry.results.length > 0 ? entry.results.length : (entry.meta.changes ?? null),
      command: detectCommand(opts.sql),
      durationMs: Date.now() - started,
      truncated
    }
  } catch (err) {
    // A partially-applied DDL batch can still have changed the schema.
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
  } finally {
    if (opts.queryId) d1Inflight.delete(opts.queryId)
  }
}

async function cancelQuery(connectionId: string, queryId: string): Promise<void> {
  const entry = d1Inflight.get(queryId)
  if (!entry || entry.connectionId !== connectionId) return
  entry.controller.abort()
}

const searchDialect: ValueSearchDialect = {
  ...sqliteFilterDialect,
  // SQLite has no schemas, so the qualified name is just the table.
  qualifiedTable: (_schema, table) => quoteIdent(table),
  castText: (expr) => `cast(${expr} as text)`
}

async function searchValue(opts: ValueSearchOptions): Promise<ValueSearchResult> {
  const saved = loadSaved(opts.connectionId)
  return sweepTables(SQLITE_SCHEMA, opts.term, opts.mode, {
    dialect: searchDialect,
    listTables: () => listTables(opts.connectionId, SQLITE_SCHEMA),
    columnsFor: async (table) =>
      (await tableDetails(opts.connectionId, SQLITE_SCHEMA, table)).columns,
    run: async (sql, params) => {
      const entry = await callD1<Record<string, unknown>>(saved, sql, params)
      return entry.results[0]
    },
    isCancelled: () => isSearchCancelled(opts.searchId)
  })
}

async function getColumnDistinct(opts: DistinctValuesOptions): Promise<unknown[]> {
  const saved = loadSaved(opts.connectionId)
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
  const entry = await callD1<{ value: unknown }>(saved, sql, params)
  return entry.results.map((r) => r.value)
}

/**
 * D1 exposes no size figures at all - `dbstat` is not available over the query
 * API - so every byte count here is null and the UI says so rather than
 * inventing one. Row counts come from a real `count(*)` per table, which is
 * affordable only because the table list is short.
 */
async function getOverview(connectionId: string): Promise<ConnectionOverview> {
  const saved = loadSaved(connectionId)
  const tableList = await callD1<{ name: string; type: string }>(saved, LIST_TABLES_SQL)
  const all = tableList.results.map((r) => ({ name: String(r.name), type: String(r.type) }))
  const tables = all.filter((t) => t.type !== 'view')

  const counted = await mapWithConcurrency(tables.slice(0, OVERVIEW_TABLE_LIMIT), async (table) => {
    try {
      const entry = await callD1<{ count: number }>(
        saved,
        `select count(*) as count from ${quoteIdent(table.name)}`
      )
      return { name: table.name, rows: toCount(entry.results[0]?.count) }
    } catch {
      return { name: table.name, rows: null }
    }
  })

  return {
    databaseName: saved.name || (saved.databaseId ?? ''),
    serverVersion: 'Cloudflare D1',
    schemaCount: 1,
    tableCount: tables.length,
    viewCount: all.length - tables.length,
    totalBytes: null,
    largestTables: counted
      .map((t) => ({ schema: SQLITE_SCHEMA, name: t.name, bytes: null, estimatedRows: t.rows }))
      .sort((a, b) => (b.estimatedRows ?? -1) - (a.estimatedRows ?? -1))
  }
}

/**
 * SQLite has no reverse foreign-key catalogue - `pragma foreign_key_list` only
 * answers "what does this table point at". So the whole database is swept and
 * the answers filtered, which is one request per table. Acceptable because the
 * row editor asks for it once per row opened, not per keystroke.
 */
async function referencingKeys(
  connectionId: string,
  schema: string,
  table: string
): Promise<ReferencingKeyInfo[]> {
  const saved = loadSaved(connectionId)
  const tableList = await callD1<{ name: string }>(saved, LIST_BASE_TABLES_SQL)
  const others = tableList.results.map((r) => String(r.name)).filter((name) => name !== table)

  const perTable = await mapWithConcurrency(others, async (childTable) => {
    const entry = await callD1<ForeignKeyRow>(
      saved,
      `pragma foreign_key_list(${quoteIdent(childTable)})`
    )
    return { childTable, foreignKeys: toForeignKeys(entry.results) }
  })

  const out: ReferencingKeyInfo[] = []
  for (const { childTable, foreignKeys } of perTable) {
    for (const fk of foreignKeys) {
      // SQLite reports the parent unqualified, and D1 has exactly one schema.
      if (fk.referencedTable !== table) continue
      out.push({
        ...fk,
        // The pragma id is unique per child table, not per database.
        name: `${childTable}_${fk.name}`,
        schema,
        table: childTable,
        referencedSchema: schema
      })
    }
  }
  return out
}

async function getSchemaGraph(connectionId: string, schema: string): Promise<SchemaGraph> {
  const saved = loadSaved(connectionId)

  const tableList = await callD1<{ name: string }>(saved, LIST_BASE_TABLES_SQL)
  const tableNames = tableList.results.map((r) => String(r.name))

  // Halved: each item issues two requests, so this still caps in-flight at ~6.
  const perTable = await mapWithConcurrency(
    tableNames,
    async (tableName) => {
      const ident = quoteIdent(tableName)
      const [colEntry, fkEntry] = await Promise.all([
        callD1<{ name: string; type: string; notnull: number; pk: number }>(
          saved,
          `pragma table_info(${ident})`
        ),
        callD1<{ id: number; seq: number; table: string; from: string; to: string }>(
          saved,
          `pragma foreign_key_list(${ident})`
        )
      ])
      return { tableName, colEntry, fkEntry }
    },
    D1_MAX_CONCURRENT_REQUESTS / 2
  )

  const tables: SchemaGraphTable[] = []
  const edges: SchemaGraphEdge[] = []

  for (const { tableName, colEntry, fkEntry } of perTable) {
    tables.push({
      schema,
      name: tableName,
      columns: colEntry.results.map((c) => ({
        name: String(c.name),
        dataType: String(c.type || 'TEXT'),
        udtName: normalizeUdtName(String(c.type || 'TEXT')),
        isNullable: Number(c.notnull) === 0,
        isPrimaryKey: Number(c.pk) > 0,
        // SQLite has no enum type, and CHECK constraints are not parsed.
        enumValues: null
      }))
    })

    const fkGroups = new Map<
      number,
      { table: string; pairs: { from: string; to: string; seq: number }[] }
    >()
    for (const fk of fkEntry.results) {
      const id = Number(fk.id)
      const existing = fkGroups.get(id)
      if (existing) {
        existing.pairs.push({ from: String(fk.from), to: String(fk.to), seq: Number(fk.seq) })
      } else {
        fkGroups.set(id, {
          table: String(fk.table),
          pairs: [{ from: String(fk.from), to: String(fk.to), seq: Number(fk.seq) }]
        })
      }
    }
    for (const [id, group] of fkGroups) {
      const sorted = group.pairs.sort((a, b) => a.seq - b.seq)
      edges.push({
        name: `${tableName}_fk_${id}`,
        from: { schema, table: tableName, columns: sorted.map((p) => p.from) },
        to: { schema, table: group.table, columns: sorted.map((p) => p.to) }
      })
    }
  }

  return { schema, tables, edges }
}

export const d1Driver: DatabaseDriver = {
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
  getOverview
}
