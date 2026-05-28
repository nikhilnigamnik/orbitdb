import type {
  ConnectionInput,
  DistinctValuesOptions,
  GetRowsOptions,
  QueryResult,
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
  TestConnectionResult
} from '../../../shared/types'

export interface ActiveMeta {
  serverVersion: string
  currentDatabase: string
  currentUser: string
}

export interface DatabaseDriver {
  test(input: ConnectionInput): Promise<TestConnectionResult>
  describeActive(saved: SavedConnection): Promise<ActiveMeta>
  disconnectPool(connectionId: string): Promise<void>
  disconnectAll(): Promise<void>

  listSchemas(connectionId: string): Promise<SchemaInfo[]>
  listTables(connectionId: string, schema: string): Promise<TableInfo[]>
  tableDetails(connectionId: string, schema: string, table: string): Promise<TableDetails>
  getSchemaGraph(connectionId: string, schema: string): Promise<SchemaGraph>

  getRows(opts: GetRowsOptions): Promise<RowsResult>
  insertRow(opts: RowMutation): Promise<Record<string, unknown>>
  updateRow(opts: RowUpdate): Promise<Record<string, unknown>>
  deleteRow(opts: RowDelete): Promise<{ deleted: number }>

  runQuery(opts: RunQueryOptions): Promise<QueryResult>
  cancelQuery(connectionId: string, queryId: string): Promise<void>
  getColumnDistinct(opts: DistinctValuesOptions): Promise<unknown[]>
}
