export type DatabaseEngine = 'postgres' | 'mysql' | 'd1'

export type ConnectionEnvironment = 'dev' | 'stage' | 'prod'

export interface ConnectionInput {
  name: string
  engine: DatabaseEngine
  environment: ConnectionEnvironment
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean
  // D1-only credentials
  accountId?: string
  databaseId?: string
  apiToken?: string
}

export interface SavedConnection extends ConnectionInput {
  id: string
  createdAt: string
  updatedAt: string
}

export interface TestConnectionResult {
  success: boolean
  error?: string
  serverVersion?: string
}

export interface SchemaInfo {
  name: string
}

export interface TableInfo {
  schema: string
  name: string
  type: 'table' | 'view' | 'materialized_view'
  estimatedRows: number | null
}

export interface ColumnInfo {
  name: string
  dataType: string
  udtName: string
  isNullable: boolean
  isPrimaryKey: boolean
  defaultValue: string | null
  ordinalPosition: number
  characterMaximumLength: number | null
}

export interface IndexInfo {
  name: string
  isUnique: boolean
  isPrimary: boolean
  columns: string[]
  definition: string
}

export interface ForeignKeyInfo {
  name: string
  columns: string[]
  referencedSchema: string
  referencedTable: string
  referencedColumns: string[]
  onDelete: string
  onUpdate: string
}

export interface TableDetails {
  schema: string
  name: string
  type: 'table' | 'view' | 'materialized_view'
  columns: ColumnInfo[]
  primaryKey: string[]
  indexes: IndexInfo[]
  foreignKeys: ForeignKeyInfo[]
  estimatedRows: number | null
}

export type SortDirection = 'asc' | 'desc'

export interface RowFilter {
  column: string
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'like' | 'ilike' | 'is null' | 'is not null'
  value?: string
}

export interface GetRowsOptions {
  connectionId: string
  schema: string
  table: string
  limit: number
  offset: number
  orderBy?: string
  orderDir?: SortDirection
  filters?: RowFilter[]
}

export interface RowsResult {
  rows: Record<string, unknown>[]
  columns: ColumnInfo[]
  totalEstimate: number | null
}

export interface RowMutation {
  connectionId: string
  schema: string
  table: string
  values: Record<string, unknown>
}

export interface RowUpdate extends RowMutation {
  pk: Record<string, unknown>
}

export interface RowDelete {
  connectionId: string
  schema: string
  table: string
  pk: Record<string, unknown>
}

export interface RunQueryOptions {
  connectionId: string
  sql: string
  params?: unknown[]
  queryId?: string
}

export interface CancelQueryOptions {
  connectionId: string
  queryId: string
}

export interface DistinctValuesOptions {
  connectionId: string
  schema: string
  table: string
  column: string
  limit?: number
  search?: string
}

export const MAX_QUERY_RESULT_ROWS = 10_000

export interface QueryResult {
  success: boolean
  error?: string
  rows: Record<string, unknown>[]
  fields: { name: string; dataTypeID: number }[]
  rowCount: number | null
  command: string | null
  durationMs: number
  truncated: boolean
}

export interface OperationResult<T = void> {
  success: boolean
  error?: string
  data?: T
}

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string | null
  hasUpdate: boolean
  releaseUrl: string | null
  publishedAt: string | null
}

export interface ActiveConnectionMeta {
  connectionId: string
  serverVersion: string
  currentDatabase: string
  currentUser: string
}

export interface QueryLogEntry {
  id: string
  connectionId: string
  engine: DatabaseEngine
  sql: string
  params: unknown[]
  durationMs: number
  rowCount: number | null
  success: boolean
  error?: string
  ranAt: string
}
