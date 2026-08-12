import type {
  ConnectionInput,
  ConnectionOverview,
  DdlRequest,
  DistinctValuesOptions,
  CountRowsOptions,
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

  /** A glance at the whole connection: counts, size, and where the weight is. */
  getOverview(connectionId: string): Promise<ConnectionOverview>
  listSchemas(connectionId: string): Promise<SchemaInfo[]>
  listTables(connectionId: string, schema: string): Promise<TableInfo[]>
  tableDetails(connectionId: string, schema: string, table: string): Promise<TableDetails>
  /** Foreign keys pointing *at* this table, i.e. the children that depend on its rows. */
  referencingKeys(
    connectionId: string,
    schema: string,
    table: string
  ): Promise<ReferencingKeyInfo[]>
  getSchemaGraph(connectionId: string, schema: string): Promise<SchemaGraph>

  getRows(opts: GetRowsOptions): Promise<RowsResult>
  /** Exact row count for the current filters, or null when deliberately skipped. */
  countRows(opts: CountRowsOptions): Promise<number | null>
  insertRow(opts: RowMutation): Promise<Record<string, unknown>>
  updateRow(opts: RowUpdate): Promise<Record<string, unknown>>
  deleteRow(opts: RowDelete): Promise<{ deleted: number }>

  generateDdl(opts: DdlRequest): Promise<string>
  executeDdl(opts: DdlRequest): Promise<void>

  runQuery(opts: RunQueryOptions): Promise<QueryResult>
  cancelQuery(connectionId: string, queryId: string): Promise<void>
  getColumnDistinct(opts: DistinctValuesOptions): Promise<unknown[]>
}
