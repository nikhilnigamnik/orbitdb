/**
 * Reading and writing rows.
 */

import {
  type CountRowsOptions,
  type DistinctValuesOptions,
  type GetRowsOptions,
  type RowDelete,
  type RowMutation,
  type RowUpdate,
  type RowsResult,
  type SavedConnection
} from '../../../../shared/types'
import { buildOrderBySql } from '../../order-by'
import { buildFilterSql } from '../../filters'
import { quoteIdent, sqliteFilterDialect } from '../../sqlite-shared'
import { callD1, loadSaved } from './client'
import { tableDetails } from './introspect'

export async function getRows(opts: GetRowsOptions): Promise<RowsResult> {
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
export async function countRows(opts: CountRowsOptions): Promise<number | null> {
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
export async function insertRow(opts: RowMutation): Promise<Record<string, unknown>> {
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
export async function updateRow(opts: RowUpdate): Promise<Record<string, unknown>> {
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
export async function deleteRow(opts: RowDelete): Promise<{ deleted: number }> {
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
export async function getColumnDistinct(opts: DistinctValuesOptions): Promise<unknown[]> {
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
