import type {
  ConnectionInput,
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

  getRows(opts: GetRowsOptions): Promise<RowsResult>
  insertRow(opts: RowMutation): Promise<Record<string, unknown>>
  updateRow(opts: RowUpdate): Promise<Record<string, unknown>>
  deleteRow(opts: RowDelete): Promise<{ deleted: number }>

  runQuery(opts: RunQueryOptions): Promise<QueryResult>
}
