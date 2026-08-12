import { ipcMain, app, shell } from 'electron'
import { safeExternalUrl } from '../app/open-external'
import { checkForUpdate } from '../app/update-check'
import type {
  AiSettingsView,
  UsageSummary,
  ConnectionInput,
  CountRowsOptions,
  DdlRequest,
  DistinctValuesOptions,
  ExplainTableOptions,
  FilterTableOptions,
  GenerateSeedOptions,
  GenerateSqlOptions,
  GetRowsOptions,
  RecordQueryRun,
  RowDelete,
  RowMutation,
  RowUpdate,
  RunQueryOptions,
  SavedQueryPatch,
  SuggestIndexesOptions
} from '../../shared/types'
import { generateSql } from '../ai/generate-sql'
import { explainTable } from '../ai/explain-table'
import { filterTable } from '../ai/filter-table'
import { suggestIndexes } from '../ai/suggest-indexes'
import { seedTable } from '../ai/generate-seed'
import { resetModelCache } from '../ai/client'
import { testAiKey } from '../ai/test-key'
import { AI_PROVIDERS } from '../../shared/ai-models'
import { clearUsage, getUsageSummary } from '../store/usage-store'
import {
  clearQueryHistory,
  deleteQuery,
  listQueries,
  recordQueryRun,
  updateQuery
} from '../store/queries-store'
import {
  clearAiApiKey,
  getActiveProvider,
  getAiKeyHint,
  getProviderSettings,
  isAiKeyUnreadable,
  setAiApiKey,
  setAiModel,
  setAiProvider
} from '../store/settings-store'
import {
  createConnection,
  deleteConnection,
  listConnections,
  requireConnection,
  updateConnection
} from '../store/connections-store'
import {
  cancelQuery,
  countRows,
  describeActive,
  deleteRow,
  disconnectPool,
  executeDdl,
  generateDdl,
  getColumnDistinct,
  getOverview,
  getRows,
  getSchemaGraph,
  insertRow,
  listSchemas,
  listTables,
  referencingKeys,
  runQuery,
  tableDetails,
  testConnection,
  updateRow
} from '../db/manager'
import { clearQueryLogs, listQueryLogs } from '../db/query-log'

function wrap<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => Promise<TResult> | TResult
) {
  return async (_event: unknown, ...args: TArgs) => {
    try {
      const data = await handler(...args)
      return { success: true as const, data }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[ipc]', message)
      return { success: false as const, error: message }
    }
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(
    'connections:list',
    wrap(async () => listConnections())
  )
  ipcMain.handle(
    'connections:create',
    wrap(async (input: ConnectionInput) => createConnection(input))
  )
  ipcMain.handle(
    'connections:update',
    wrap(async (id: string, input: ConnectionInput) => {
      await disconnectPool(id)
      return updateConnection(id, input)
    })
  )
  ipcMain.handle(
    'connections:delete',
    wrap(async (id: string) => {
      await disconnectPool(id)
      deleteConnection(id)
    })
  )
  ipcMain.handle(
    'connections:test',
    wrap(async (input: ConnectionInput) => testConnection(input))
  )

  ipcMain.handle(
    'db:connect',
    wrap(async (connectionId: string) => {
      // requireConnection, not getConnection: it reports unreadable credentials
      // up front instead of letting the engine fail with "auth failed".
      const saved = requireConnection(connectionId)
      const meta = await describeActive(saved)
      return { connectionId, ...meta }
    })
  )
  ipcMain.handle(
    'db:disconnect',
    wrap(async (connectionId: string) => {
      await disconnectPool(connectionId)
    })
  )
  ipcMain.handle(
    'db:overview',
    wrap(async (connectionId: string) => getOverview(connectionId))
  )
  ipcMain.handle(
    'db:list-schemas',
    wrap(async (connectionId: string) => listSchemas(connectionId))
  )
  ipcMain.handle(
    'db:list-tables',
    wrap(async (connectionId: string, schema: string) => listTables(connectionId, schema))
  )
  ipcMain.handle(
    'db:table-details',
    wrap(async (connectionId: string, schema: string, table: string) =>
      tableDetails(connectionId, schema, table)
    )
  )
  ipcMain.handle(
    'db:referencing-keys',
    wrap(async (connectionId: string, schema: string, table: string) =>
      referencingKeys(connectionId, schema, table)
    )
  )
  ipcMain.handle(
    'db:schema-graph',
    wrap(async (connectionId: string, schema: string) => getSchemaGraph(connectionId, schema))
  )

  ipcMain.handle(
    'db:rows-get',
    wrap(async (opts: GetRowsOptions) => getRows(opts))
  )
  ipcMain.handle(
    'db:rows-count',
    wrap(async (opts: CountRowsOptions) => countRows(opts))
  )
  ipcMain.handle(
    'db:row-insert',
    wrap(async (opts: RowMutation) => insertRow(opts))
  )
  ipcMain.handle(
    'db:row-update',
    wrap(async (opts: RowUpdate) => updateRow(opts))
  )
  ipcMain.handle(
    'db:row-delete',
    wrap(async (opts: RowDelete) => deleteRow(opts))
  )

  ipcMain.handle(
    'db:ddl-preview',
    wrap(async (opts: DdlRequest) => generateDdl(opts))
  )
  ipcMain.handle(
    'db:ddl-execute',
    wrap(async (opts: DdlRequest) => {
      await executeDdl(opts)
    })
  )

  ipcMain.handle(
    'db:query-run',
    wrap(async (opts: RunQueryOptions) => runQuery(opts))
  )
  ipcMain.handle(
    'db:query-cancel',
    wrap(async (connectionId: string, queryId: string) => cancelQuery(connectionId, queryId))
  )

  ipcMain.handle(
    'db:column-distinct',
    wrap(async (opts: DistinctValuesOptions) => getColumnDistinct(opts))
  )

  ipcMain.handle(
    'db:logs-list',
    wrap(async () => listQueryLogs())
  )
  ipcMain.handle(
    'db:logs-clear',
    wrap(async () => {
      clearQueryLogs()
    })
  )

  ipcMain.handle(
    'ai:generate-sql',
    wrap(async (opts: GenerateSqlOptions) => generateSql(opts))
  )
  ipcMain.handle(
    'ai:filter-table',
    wrap(async (opts: FilterTableOptions) => filterTable(opts))
  )
  ipcMain.handle(
    'ai:explain-table',
    wrap(async (opts: ExplainTableOptions) => explainTable(opts))
  )
  ipcMain.handle(
    'ai:suggest-indexes',
    wrap(async (opts: SuggestIndexesOptions) => suggestIndexes(opts))
  )
  ipcMain.handle(
    'ai:generate-seed',
    wrap(async (opts: GenerateSeedOptions) => seedTable(opts))
  )

  ipcMain.handle(
    'settings:get-ai',
    wrap(
      (): AiSettingsView => ({
        active: getActiveProvider(),
        providers: AI_PROVIDERS.map((p) => {
          const { apiKey, model } = getProviderSettings(p.id)
          return {
            id: p.id,
            hasKey: apiKey.length > 0,
            keyHint: getAiKeyHint(p.id),
            isKeyUnreadable: isAiKeyUnreadable(p.id),
            model
          }
        })
      })
    )
  )
  ipcMain.handle(
    'settings:set-ai-key',
    wrap(async (provider: string, apiKey: string) => {
      setAiApiKey(provider, apiKey)
      resetModelCache()
    })
  )
  ipcMain.handle(
    'settings:clear-ai-key',
    wrap(async (provider: string) => {
      clearAiApiKey(provider)
      resetModelCache()
    })
  )
  ipcMain.handle(
    'settings:set-ai-model',
    wrap(async (provider: string, model: string) => setAiModel(provider, model))
  )
  ipcMain.handle(
    'settings:set-ai-provider',
    wrap(async (provider: string) => {
      const next = setAiProvider(provider)
      resetModelCache()
      return next
    })
  )
  ipcMain.handle(
    'settings:test-ai',
    wrap(async (provider: string) => testAiKey(provider))
  )

  ipcMain.handle(
    'queries:list',
    wrap(async (connectionId: string) => listQueries(connectionId))
  )
  ipcMain.handle(
    'queries:record',
    wrap(async (input: RecordQueryRun) => recordQueryRun(input))
  )
  ipcMain.handle(
    'queries:update',
    wrap(async (id: string, patch: SavedQueryPatch) => updateQuery(id, patch))
  )
  ipcMain.handle(
    'queries:delete',
    wrap(async (id: string) => {
      deleteQuery(id)
    })
  )
  ipcMain.handle(
    'queries:clear-history',
    wrap(async (connectionId: string) => {
      clearQueryHistory(connectionId)
    })
  )

  ipcMain.handle(
    'usage:summary',
    wrap((): UsageSummary => getUsageSummary())
  )
  ipcMain.handle(
    'usage:clear',
    wrap(async () => {
      clearUsage()
    })
  )

  ipcMain.handle(
    'app:get-version',
    wrap(() => app.getVersion())
  )
  ipcMain.handle(
    'app:check-update',
    wrap(async () => checkForUpdate())
  )
  ipcMain.handle(
    'app:open-external',
    wrap(async (url: string) => {
      const safe = safeExternalUrl(url)
      if (!safe) throw new Error(`Refusing to open: ${url}`)
      await shell.openExternal(safe)
    })
  )
}
