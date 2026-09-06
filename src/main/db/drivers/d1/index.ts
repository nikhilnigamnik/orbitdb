/**
 * The D1 driver. Cloudflare REST rather than a socket, no schemas, and the
 * SQLite dialect pieces shared with any other SQLite engine.
 */

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
import { LIST_TABLES_SQL, SQLITE_SCHEMA, quoteIdent, sqliteDdlDialect } from '../../sqlite-shared'
import { sweepTables } from '../../value-search'
import { sweepReferences } from '../../broken-refs'
import { isSweepCancelled } from '../../sweep-cancel'
import type { DatabaseDriver } from '.././types'
import { cascadeDelete, cascadeDeletePlan } from './cascade'
import {
  callD1,
  describeActive,
  disconnectAll,
  disconnectPool,
  invalidateTableDetailsForConnection,
  loadSaved,
  mapWithConcurrency,
  searchDialect,
  test
} from './client'
import {
  getSchemaGraph,
  listSchemas,
  listTables,
  referencingKeys,
  tableDetails
} from './introspect'
import { cancelQuery, runQuery } from './query'
import { countRows, deleteRow, getColumnDistinct, getRows, insertRow, updateRow } from './rows'

async function generateDdl(opts: DdlRequest): Promise<string> {
  return buildDdl(opts.operation, opts.schema, opts.table, sqliteDdlDialect)
}
async function executeDdl(opts: DdlRequest): Promise<void> {
  const saved = loadSaved(opts.connectionId)
  const sql = buildDdl(opts.operation, opts.schema, opts.table, sqliteDdlDialect)
  await callD1(saved, sql)
  invalidateTableDetailsForConnection(opts.connectionId)
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
    isCancelled: () => isSweepCancelled(opts.searchId)
  })
}
async function checkReferences(opts: CheckReferencesOptions): Promise<CheckReferencesResult> {
  const saved = loadSaved(opts.connectionId)
  return sweepReferences(SQLITE_SCHEMA, {
    dialect: searchDialect,
    loadTables: async () => {
      const tables = await listTables(opts.connectionId, SQLITE_SCHEMA)
      const details: TableDetails[] = []
      for (const table of tables) {
        if (table.type !== 'table') continue
        details.push(await tableDetails(opts.connectionId, SQLITE_SCHEMA, table.name))
      }
      return details
    },
    run: async (sql) => {
      const entry = await callD1<Record<string, unknown>>(saved, sql, [])
      return entry.results[0]
    },
    isCancelled: () => isSweepCancelled(opts.sweepId)
  })
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
