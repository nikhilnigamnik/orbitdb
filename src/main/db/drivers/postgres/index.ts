/**
 * The Postgres driver.
 */

import {
  OVERVIEW_TABLE_LIMIT,
  type ConnectionOverview,
  type DdlRequest,
  type TableDetails,
  type ValueSearchOptions,
  type ValueSearchResult,
  type CheckReferencesOptions,
  type CheckReferencesResult
} from '../../../../shared/types'
import { buildDdl } from '../../ddl'
import { toCount } from '../../coerce'
import { sweepTables } from '../../value-search'
import { sweepReferences } from '../../broken-refs'
import { isSweepCancelled } from '../../sweep-cancel'
import type { DatabaseDriver } from '.././types'
import { cascadeDelete, cascadeDeletePlan } from './cascade'
import { ddlDialect, searchDialect } from './dialect'
import {
  SYSTEM_SCHEMAS,
  getSchemaGraph,
  listSchemas,
  listTables,
  referencingKeys,
  tableDetails
} from './introspect'
import {
  describeActive,
  disconnectAll,
  disconnectPool,
  getPool,
  invalidateTableDetailsForConnection,
  test
} from './pool'
import { cancelQuery, runQuery } from './query'
import { countRows, deleteRow, getColumnDistinct, getRows, insertRow, updateRow } from './rows'

async function searchValue(opts: ValueSearchOptions): Promise<ValueSearchResult> {
  const pool = await getPool(opts.connectionId)
  return sweepTables(opts.schema, opts.term, opts.mode, {
    dialect: searchDialect,
    listTables: () => listTables(opts.connectionId, opts.schema),
    columnsFor: async (table) =>
      (await tableDetails(opts.connectionId, opts.schema, table)).columns,
    run: async (sql, params) => (await pool.query(sql, params)).rows[0],
    isCancelled: () => isSweepCancelled(opts.searchId)
  })
}
async function generateDdl(opts: DdlRequest): Promise<string> {
  return buildDdl(opts.operation, opts.schema, opts.table, ddlDialect)
}
async function executeDdl(opts: DdlRequest): Promise<void> {
  const sql = buildDdl(opts.operation, opts.schema, opts.table, ddlDialect)
  const pool = await getPool(opts.connectionId)
  await pool.query(sql)
  invalidateTableDetailsForConnection(opts.connectionId)
}
async function checkReferences(opts: CheckReferencesOptions): Promise<CheckReferencesResult> {
  const pool = await getPool(opts.connectionId)
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
    run: async (sql) => (await pool.query(sql)).rows[0],
    isCancelled: () => isSweepCancelled(opts.sweepId)
  })
}
async function getOverview(connectionId: string): Promise<ConnectionOverview> {
  const pool = await getPool(connectionId)
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
  cascadeDeletePlan,
  cascadeDelete,
  generateDdl,
  executeDdl,
  runQuery,
  cancelQuery,
  getColumnDistinct,
  getOverview,
  searchValue,
  checkReferences
}
