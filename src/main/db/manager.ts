import type {
  ConnectionInput,
  DatabaseEngine,
  DistinctValuesOptions,
  GetRowsOptions,
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
} from '../../shared/types'
import { getConnection } from '../store/connections-store'
import type { ActiveMeta, DatabaseDriver } from './drivers/types'
import { postgresDriver } from './drivers/postgres'
import { mysqlDriver } from './drivers/mysql'
import { d1Driver } from './drivers/d1'

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

export function getRows(opts: GetRowsOptions): Promise<RowsResult> {
  return driverForConnection(opts.connectionId).getRows(opts)
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

export function runQuery(opts: RunQueryOptions): Promise<QueryResult> {
  return driverForConnection(opts.connectionId).runQuery(opts)
}

export function getColumnDistinct(opts: DistinctValuesOptions): Promise<unknown[]> {
  return driverForConnection(opts.connectionId).getColumnDistinct(opts)
}
