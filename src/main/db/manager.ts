import type {
  ConnectionInput,
  ConnectionOverview,
  CountRowsOptions,
  DatabaseEngine,
  DdlRequest,
  DistinctValuesOptions,
  GetRowsOptions,
  QueryResult,
  ReferencingKeyInfo,
  RowDelete,
  RowMutation,
  RowUpdate,
  RowsResult,
  RunQueryOptions,
  SavedConnection,
  SchemaGraph,
  SchemaInfo,
  TableDetails,
  TableInfo,
  TestConnectionResult,
  ValueSearchOptions,
  ValueSearchResult,
  CheckReferencesOptions,
  CheckReferencesResult
} from '../../shared/types'
import { getConnection } from '../store/connections-store'
import type { ActiveMeta, DatabaseDriver } from './drivers/types'
import { postgresDriver } from './drivers/postgres'
import { mysqlDriver } from './drivers/mysql'
import { d1Driver } from './drivers/d1'
import { clearSweepCancel, requestSweepCancel } from './sweep-cancel'

function driverFor(engine: DatabaseEngine): DatabaseDriver {
  if (engine === 'mysql') return mysqlDriver
  if (engine === 'd1') return d1Driver
  return postgresDriver
}

function driverForConnection(connectionId: string): DatabaseDriver {
  const saved = getConnection(connectionId)
  if (!saved) throw new Error(`Connection ${connectionId} not found`)
  return driverFor(saved.engine)
}

export function testConnection(input: ConnectionInput): Promise<TestConnectionResult> {
  return driverFor(input.engine).test(input)
}

export function describeActive(saved: SavedConnection): Promise<ActiveMeta> {
  return driverFor(saved.engine).describeActive(saved)
}

export async function disconnectPool(connectionId: string): Promise<void> {
  const saved = getConnection(connectionId)
  if (!saved) return
  await driverFor(saved.engine).disconnectPool(connectionId)
}

export async function disconnectAll(): Promise<void> {
  await Promise.all([
    postgresDriver.disconnectAll(),
    mysqlDriver.disconnectAll(),
    d1Driver.disconnectAll()
  ])
}

export function listSchemas(connectionId: string): Promise<SchemaInfo[]> {
  return driverForConnection(connectionId).listSchemas(connectionId)
}

export function listTables(connectionId: string, schema: string): Promise<TableInfo[]> {
  return driverForConnection(connectionId).listTables(connectionId, schema)
}

export function tableDetails(
  connectionId: string,
  schema: string,
  table: string
): Promise<TableDetails> {
  return driverForConnection(connectionId).tableDetails(connectionId, schema, table)
}

export function getOverview(connectionId: string): Promise<ConnectionOverview> {
  return driverForConnection(connectionId).getOverview(connectionId)
}

export function referencingKeys(
  connectionId: string,
  schema: string,
  table: string
): Promise<ReferencingKeyInfo[]> {
  return driverForConnection(connectionId).referencingKeys(connectionId, schema, table)
}

export function getSchemaGraph(connectionId: string, schema: string): Promise<SchemaGraph> {
  return driverForConnection(connectionId).getSchemaGraph(connectionId, schema)
}

export function getRows(opts: GetRowsOptions): Promise<RowsResult> {
  return driverForConnection(opts.connectionId).getRows(opts)
}

export function countRows(opts: CountRowsOptions): Promise<number | null> {
  return driverForConnection(opts.connectionId).countRows(opts)
}

export function insertRow(opts: RowMutation): Promise<Record<string, unknown>> {
  return driverForConnection(opts.connectionId).insertRow(opts)
}

export function updateRow(opts: RowUpdate): Promise<Record<string, unknown>> {
  return driverForConnection(opts.connectionId).updateRow(opts)
}

export function deleteRow(opts: RowDelete): Promise<{ deleted: number }> {
  return driverForConnection(opts.connectionId).deleteRow(opts)
}

export function generateDdl(opts: DdlRequest): Promise<string> {
  return driverForConnection(opts.connectionId).generateDdl(opts)
}

export function executeDdl(opts: DdlRequest): Promise<void> {
  return driverForConnection(opts.connectionId).executeDdl(opts)
}

export function runQuery(opts: RunQueryOptions): Promise<QueryResult> {
  return driverForConnection(opts.connectionId).runQuery(opts)
}

export function cancelQuery(connectionId: string, queryId: string): Promise<void> {
  return driverForConnection(connectionId).cancelQuery(connectionId, queryId)
}

export function getColumnDistinct(opts: DistinctValuesOptions): Promise<unknown[]> {
  return driverForConnection(opts.connectionId).getColumnDistinct(opts)
}

/**
 * The cancel flag is cleared here rather than in the drivers: it is set from a
 * different IPC call than the one that reads it, so whichever sweep owns the id
 * has to retire it however it ends.
 */
export async function searchValue(opts: ValueSearchOptions): Promise<ValueSearchResult> {
  try {
    return await driverForConnection(opts.connectionId).searchValue(opts)
  } finally {
    clearSweepCancel(opts.searchId)
  }
}

export function cancelValueSearch(searchId: string): void {
  requestSweepCancel(searchId)
}

export async function checkReferences(
  opts: CheckReferencesOptions
): Promise<CheckReferencesResult> {
  try {
    return await driverForConnection(opts.connectionId).checkReferences(opts)
  } finally {
    clearSweepCancel(opts.sweepId)
  }
}
