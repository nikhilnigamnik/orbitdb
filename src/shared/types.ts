import type { AiFeature, AiModelId, AiProviderId } from './ai-models'

export type { AiFeature, AiModelId, AiProviderId }

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
  /** Allowed values for enum columns (Postgres enum types, MySQL enum); null otherwise. */
  enumValues: string[] | null
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

export interface SchemaGraphColumn {
  name: string
  dataType: string
  isNullable: boolean
  isPrimaryKey: boolean
}

export interface SchemaGraphTable {
  schema: string
  name: string
  columns: SchemaGraphColumn[]
}

export interface SchemaGraphEdge {
  name: string
  from: { schema: string; table: string; columns: string[] }
  to: { schema: string; table: string; columns: string[] }
}

export interface SchemaGraph {
  schema: string
  tables: SchemaGraphTable[]
  edges: SchemaGraphEdge[]
}

export type SortDirection = 'asc' | 'desc'

export interface RowFilter {
  column: string
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'like' | 'ilike' | 'is null' | 'is not null'
  value?: string
}

/**
 * How several filters combine. A single top-level connector rather than
 * arbitrary nesting: it covers "any of these" without a query-builder UI.
 */
export type FilterJoin = 'and' | 'or'

export interface GetRowsOptions {
  connectionId: string
  schema: string
  table: string
  limit: number
  offset: number
  orderBy?: string
  orderDir?: SortDirection
  filters?: RowFilter[]
  filterJoin?: FilterJoin
}

export interface CountRowsOptions {
  connectionId: string
  schema: string
  table: string
  filters?: RowFilter[]
  filterJoin?: FilterJoin
}

/**
 * Above this many rows, an unfiltered COUNT(*) costs more than the precision is
 * worth and the estimate stands instead. A filtered count always runs — that is
 * the case where the estimate is not merely imprecise but wrong.
 */
export const MAX_EXACT_COUNT_ROWS = 1_000_000

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

export type DdlOperation =
  | {
      kind: 'add-column'
      name: string
      dataType: string
      isNullable: boolean
      defaultValue?: string | null
    }
  | { kind: 'drop-column'; name: string }
  | { kind: 'rename-column'; from: string; to: string }
  | { kind: 'rename-table'; to: string }
  | { kind: 'create-index'; name: string; columns: string[]; isUnique: boolean }
  | { kind: 'drop-index'; name: string }
  | { kind: 'truncate-table' }
  | { kind: 'drop-table' }

export type DdlOperationKind = DdlOperation['kind']

/**
 * The operations the DDL form can build. Truncate and drop are table-wide and
 * take no form input — they go through their own confirm flow, which shows the
 * SQL and names the consequence.
 */
export type DdlFormKind = Exclude<DdlOperationKind, 'truncate-table' | 'drop-table'>

export interface DdlRequest {
  connectionId: string
  schema: string
  table: string
  operation: DdlOperation
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

export interface GenerateSqlOptions {
  connectionId: string
  prompt: string
}

export interface GenerateSqlResult {
  sql: string
}

export interface FilterTableOptions {
  connectionId: string
  schema: string
  table: string
  prompt: string
}

export interface FilterTableResult {
  filters: RowFilter[]
  orderBy?: string
  orderDir?: SortDirection
  /**
   * Conditions that could not be made executable and were dropped, phrased for
   * the user. Present only when something was dropped - silently narrowing the
   * request would return a wider result set that looks like an answer.
   */
  notes?: string[]
}

export interface ExplainTableOptions {
  connectionId: string
  schema: string
  table: string
}

export interface ExplainTableResult {
  explanation: string
}

export interface IndexSuggestion {
  name: string
  columns: string[]
  isUnique: boolean
  rationale: string
}

export interface SuggestIndexesOptions {
  connectionId: string
  schema: string
  table: string
}

export interface SuggestIndexesResult {
  suggestions: IndexSuggestion[]
}

export interface GenerateSeedOptions {
  connectionId: string
  schema: string
  table: string
  rowCount: number
}

export interface GenerateSeedResult {
  inserted: number
  attempted: number
  failed: number
  firstError?: string
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

/**
 * Who asked for a query: something the user typed or triggered, or the app's own
 * introspection. Without the distinction the log is mostly pragmas.
 */
export type QueryOrigin = 'user' | 'internal'

export interface QueryLogEntry {
  origin: QueryOrigin
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

/**
 * What the renderer is told about the AI settings. The key itself never crosses
 * back — `keyHint` (the last four characters) is enough to show *which* key is
 * saved, and useless to anything that gets hold of it.
 */
export interface AiProviderView {
  id: AiProviderId
  hasKey: boolean
  /** Last four characters of the saved key. Null when none is set. */
  keyHint: string | null
  /** The saved key exists but could not be unsealed on this machine. */
  isKeyUnreadable: boolean
  model: AiModelId
}

/**
 * Every provider's state at once, so the UI can show them side by side. No key
 * is ever included — only whether there is one, and its last four characters.
 */
export interface AiSettingsView {
  active: AiProviderId
  providers: AiProviderView[]
}

/** One row of the usage breakdown. Unused dimensions are the empty string. */
export interface UsageBreakdown {
  provider: string
  model: string
  feature: string
  calls: number
  input: number
  output: number
}

export interface UsageWindow {
  calls: number
  input: number
  output: number
  byModel: UsageBreakdown[]
  byFeature: UsageBreakdown[]
}

/** Aggregated in main — the renderer receives numbers to show, not a log to fold. */
export interface UsageSummary {
  today: UsageWindow
  last30: UsageWindow
  allTime: UsageWindow
  /** How far back anything is kept, so the UI can say so rather than imply forever. */
  retentionDays: number
}
