/**
 * Reading and writing rows. MySQL has no RETURNING, so a mutation is followed
 * by a read of the row it touched.
 */

import { type RowDataPacket, type ResultSetHeader } from 'mysql2/promise'
import {
  MAX_EXACT_COUNT_ROWS,
  type CountRowsOptions,
  type DistinctValuesOptions,
  type GetRowsOptions,
  type RowDelete,
  type RowMutation,
  type RowUpdate,
  type RowsResult
} from '../../../../shared/types'
import { buildOrderBySql } from '../../order-by'
import { buildFilterSql } from '../../filters'
import { filterDialect, qualifiedTable, quoteIdent } from './dialect'
import { tableDetails } from './introspect'
import { getPool } from './pool'

export async function getRows(opts: GetRowsOptions): Promise<RowsResult> {
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

  const pool = await getPool(opts.connectionId)
  const sql = `select * from ${qualifiedTable(opts.schema, opts.table)} ${whereSql} ${orderSql} limit ${limit} offset ${offset}`
  const [rows] = await pool.query<RowDataPacket[]>(sql, params)

  return {
    rows: rows as unknown as Record<string, unknown>[],
    columns: details.columns,
    totalEstimate: details.estimatedRows
  }
}
export async function countRows(opts: CountRowsOptions): Promise<number | null> {
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

  const pool = await getPool(opts.connectionId)
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
  const pool = await getPool(connectionId)
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
export async function insertRow(opts: RowMutation): Promise<Record<string, unknown>> {
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

  const pool = await getPool(opts.connectionId)
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
export async function updateRow(opts: RowUpdate): Promise<Record<string, unknown>> {
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

  const pool = await getPool(opts.connectionId)
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
export async function deleteRow(opts: RowDelete): Promise<{ deleted: number }> {
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
  const pool = await getPool(opts.connectionId)
  const sql = `delete from ${qualifiedTable(opts.schema, opts.table)} where ${whereClauses.join(' and ')}`
  const [result] = await pool.query<ResultSetHeader>(sql, params)
  return { deleted: result.affectedRows ?? 0 }
}
export async function getColumnDistinct(opts: DistinctValuesOptions): Promise<unknown[]> {
  const details = await tableDetails(opts.connectionId, opts.schema, opts.table)
  if (!details.columns.some((c) => c.name === opts.column)) {
    throw new Error(`Column ${opts.column} does not exist on ${opts.schema}.${opts.table}`)
  }
  const pool = await getPool(opts.connectionId)
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
