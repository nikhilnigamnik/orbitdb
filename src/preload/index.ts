// Sandboxed: this file may import only what a sandboxed preload can require
// (contextBridge, ipcRenderer) and read only `process.platform`. Anything else
// fails at load and leaves the renderer with no `window.api` at all.
import { contextBridge, ipcRenderer } from 'electron'
import type {
  ActiveConnectionMeta,
  ExplainSqlOptions,
  ExplainSqlResult,
  FixSqlOptions,
  FixSqlResult,
  AiModelId,
  AiProviderId,
  AiGatewayIds,
  AiSettingsView,
  CascadeDeleteOptions,
  CascadeDeletePlan,
  CascadeDeleteResult,
  ConnectionInput,
  ConnectionOverview,
  DdlRequest,
  DistinctValuesOptions,
  ExplainTableOptions,
  ExplainTableResult,
  FilterTableOptions,
  FilterTableResult,
  GenerateSeedOptions,
  GenerateSeedResult,
  GenerateSqlOptions,
  GenerateSqlResult,
  CountRowsOptions,
  GetRowsOptions,
  OperationResult,
  QueryLogEntry,
  QueryResult,
  RecordQueryRun,
  ReferencingKeyInfo,
  RowDelete,
  RowMutation,
  RowUpdate,
  RowsResult,
  RunQueryOptions,
  SavedConnection,
  SavedQuery,
  SavedQueryPatch,
  SchemaGraph,
  SchemaInfo,
  SuggestIndexesOptions,
  SuggestIndexesResult,
  TableDetails,
  TableInfo,
  UsageSummary,
  TestConnectionResult,
  UpdateCheckResult,
  ValueSearchOptions,
  ValueSearchResult,
  CheckReferencesOptions,
  CheckReferencesResult
} from '../shared/types'

async function invoke<T>(channel: string, ...args: unknown[]): Promise<OperationResult<T>> {
  return ipcRenderer.invoke(channel, ...args)
}

const api = {
  platform: process.platform,
  connections: {
    list: () => invoke<SavedConnection[]>('connections:list'),
    create: (input: ConnectionInput) => invoke<SavedConnection>('connections:create', input),
    update: (id: string, input: ConnectionInput) =>
      invoke<SavedConnection>('connections:update', id, input),
    delete: (id: string) => invoke<void>('connections:delete', id),
    /** With an id, blank secrets are filled from the saved connection in main. */
    test: (input: ConnectionInput, connectionId?: string) =>
      invoke<TestConnectionResult>('connections:test', input, connectionId)
  },
  db: {
    connect: (connectionId: string) => invoke<ActiveConnectionMeta>('db:connect', connectionId),
    disconnect: (connectionId: string) => invoke<void>('db:disconnect', connectionId),
    overview: (connectionId: string) => invoke<ConnectionOverview>('db:overview', connectionId),
    listSchemas: (connectionId: string) => invoke<SchemaInfo[]>('db:list-schemas', connectionId),
    listTables: (connectionId: string, schema: string) =>
      invoke<TableInfo[]>('db:list-tables', connectionId, schema),
    tableDetails: (connectionId: string, schema: string, table: string) =>
      invoke<TableDetails>('db:table-details', connectionId, schema, table),
    referencingKeys: (connectionId: string, schema: string, table: string) =>
      invoke<ReferencingKeyInfo[]>('db:referencing-keys', connectionId, schema, table),
    schemaGraph: (connectionId: string, schema: string) =>
      invoke<SchemaGraph>('db:schema-graph', connectionId, schema),
    getRows: (opts: GetRowsOptions) => invoke<RowsResult>('db:rows-get', opts),
    countRows: (opts: CountRowsOptions) => invoke<number | null>('db:rows-count', opts),
    insertRow: (opts: RowMutation) => invoke<Record<string, unknown>>('db:row-insert', opts),
    updateRow: (opts: RowUpdate) => invoke<Record<string, unknown>>('db:row-update', opts),
    deleteRow: (opts: RowDelete) => invoke<{ deleted: number }>('db:row-delete', opts),
    cascadePlan: (opts: CascadeDeleteOptions) => invoke<CascadeDeletePlan>('db:cascade-plan', opts),
    cascadeDelete: (opts: CascadeDeleteOptions) =>
      invoke<CascadeDeleteResult>('db:cascade-delete', opts),
    ddlPreview: (opts: DdlRequest) => invoke<string>('db:ddl-preview', opts),
    ddlExecute: (opts: DdlRequest) => invoke<void>('db:ddl-execute', opts),
    runQuery: (opts: RunQueryOptions) => invoke<QueryResult>('db:query-run', opts),
    cancelQuery: (connectionId: string, queryId: string) =>
      invoke<void>('db:query-cancel', connectionId, queryId),
    columnDistinct: (opts: DistinctValuesOptions) => invoke<unknown[]>('db:column-distinct', opts),
    searchValue: (opts: ValueSearchOptions) => invoke<ValueSearchResult>('db:search-value', opts),
    cancelSearch: (searchId: string) => invoke<void>('db:search-cancel', searchId),
    checkReferences: (opts: CheckReferencesOptions) =>
      invoke<CheckReferencesResult>('db:check-references', opts),
    listLogs: () => invoke<QueryLogEntry[]>('db:logs-list'),
    clearLogs: () => invoke<void>('db:logs-clear')
  },
  ai: {
    generateSql: (opts: GenerateSqlOptions) => invoke<GenerateSqlResult>('ai:generate-sql', opts),
    fixSql: (opts: FixSqlOptions) => invoke<FixSqlResult>('ai:fix-sql', opts),
    explainSql: (opts: ExplainSqlOptions) => invoke<ExplainSqlResult>('ai:explain-sql', opts),
    filterTable: (opts: FilterTableOptions) => invoke<FilterTableResult>('ai:filter-table', opts),
    explainTable: (opts: ExplainTableOptions) =>
      invoke<ExplainTableResult>('ai:explain-table', opts),
    suggestIndexes: (opts: SuggestIndexesOptions) =>
      invoke<SuggestIndexesResult>('ai:suggest-indexes', opts),
    generateSeed: (opts: GenerateSeedOptions) =>
      invoke<GenerateSeedResult>('ai:generate-seed', opts)
  },
  settings: {
    getAi: () => invoke<AiSettingsView>('settings:get-ai'),
    setAiProvider: (provider: AiProviderId) =>
      invoke<AiProviderId>('settings:set-ai-provider', provider),
    setAiKey: (provider: AiProviderId, apiKey: string) =>
      invoke<void>('settings:set-ai-key', provider, apiKey),
    clearAiKey: (provider: AiProviderId) => invoke<void>('settings:clear-ai-key', provider),
    setAiModel: (provider: AiProviderId, model: AiModelId) =>
      invoke<AiModelId>('settings:set-ai-model', provider, model),
    testAi: (provider: AiProviderId) => invoke<void>('settings:test-ai', provider),
    setGateway: (input: AiGatewayIds) => invoke<void>('settings:set-gateway', input)
  },
  queries: {
    list: (connectionId: string) => invoke<SavedQuery[]>('queries:list', connectionId),
    record: (input: RecordQueryRun) => invoke<SavedQuery>('queries:record', input),
    update: (id: string, patch: SavedQueryPatch) => invoke<SavedQuery>('queries:update', id, patch),
    delete: (id: string) => invoke<void>('queries:delete', id),
    clearHistory: (connectionId: string) => invoke<void>('queries:clear-history', connectionId)
  },
  usage: {
    summary: () => invoke<UsageSummary>('usage:summary'),
    clear: () => invoke<void>('usage:clear')
  },
  app: {
    getVersion: () => invoke<string>('app:get-version'),
    checkUpdate: () => invoke<UpdateCheckResult>('app:check-update'),
    openExternal: (url: string) => invoke<void>('app:open-external', url)
  }
}

export type OrbitApi = typeof api

// Only `api`. The toolkit's `window.electron` used to sit beside it, handing the
// page raw `ipcRenderer.send`/`on` and a copy of `process.env`, and nothing in
// the renderer used it.
try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error(error)
}
