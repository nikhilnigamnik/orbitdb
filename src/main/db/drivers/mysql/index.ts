/**
 * The MySQL driver.
 */

// Kept on the driver's entry point: tests/main/db/mysql-types.test.ts reaches
// for them there, and where they sit inside the driver is not its business.
export { normalizeUdtName, parseEnumValues } from './introspect'

import { type RowDataPacket } from 'mysql2/promise'
import {
  OVERVIEW_TABLE_LIMIT,
  type ConnectionOverview,
  type DdlRequest,
  type TableDetails,
  ValueSearchOptions,
  ValueSearchResult,
  CheckReferencesOptions,
  CheckReferencesResult
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

async function getOverview(connectionId: string): Promise<ConnectionOverview> {
  const pool = await getPool(connectionId)
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
async function searchValue(opts: ValueSearchOptions): Promise<ValueSearchResult> {
  const pool = await getPool(opts.connectionId)
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
    run: async (sql) => {
      const [rows] = await pool.query<RowDataPacket[]>(sql)
      return rows[0] as Record<string, unknown> | undefined
    },
    isCancelled: () => isSweepCancelled(opts.sweepId)
  })
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
  cascadeDeletePlan,
  cascadeDelete,
  generateDdl,
  executeDdl,
  runQuery,
  cancelQuery,
  getColumnDistinct,
  searchValue,
  checkReferences,
  getOverview
}
