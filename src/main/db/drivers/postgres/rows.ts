/**
 * Reading and writing rows. RETURNING means a mutation can hand back the row it
 * wrote without a second query.
 */

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
  const rowsRes = await pool.query<Record<string, unknown>>(sql, params)

  return {
    rows: rowsRes.rows,
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
export async function insertRow(opts: RowMutation): Promise<Record<string, unknown>> {
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

  const pool = await getPool(opts.connectionId)
  const sql = `insert into ${qualifiedTable(opts.schema, opts.table)} (${cols.join(', ')}) values (${placeholders.join(', ')}) ${returningClause(details)}`
  const res = await pool.query<Record<string, unknown>>(sql, values)
  return res.rows[0]
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

  const pool = await getPool(opts.connectionId)
  const sql = `update ${qualifiedTable(opts.schema, opts.table)} set ${setClauses.join(', ')} where ${whereClauses.join(' and ')} ${returningClause(details)}`
  const res = await pool.query<Record<string, unknown>>(sql, params)
  if (res.rowCount === 0) throw new Error('No row matched the primary key')
  return res.rows[0]
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
    params.push(opts.pk[pkCol])
    whereClauses.push(`${quoteIdent(pkCol)} = $${params.length}`)
  }
  const pool = await getPool(opts.connectionId)
  const sql = `delete from ${qualifiedTable(opts.schema, opts.table)} where ${whereClauses.join(' and ')}`
  const res = await pool.query(sql, params)
  return { deleted: res.rowCount ?? 0 }
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
    where = `where ${quoteIdent(opts.column)}::text ilike $${params.length}`
  }
  params.push(limit)
  const sql = `select distinct ${quoteIdent(opts.column)} as value from ${qualifiedTable(opts.schema, opts.table)} ${where} order by 1 nulls last limit $${params.length}`
  const res = await pool.query<{ value: unknown }>(sql, params)
  return res.rows.map((r) => r.value)
}
