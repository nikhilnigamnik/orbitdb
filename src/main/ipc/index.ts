import { ipcMain, app, shell } from 'electron'
import { checkForUpdate } from '../app/update-check'
import type {
  ConnectionInput,
  DistinctValuesOptions,
  GetRowsOptions,
  RowDelete,
  RowMutation,
  RowUpdate,
  RunQueryOptions
} from '../../shared/types'
import {
  createConnection,
  deleteConnection,
  getConnection,
  listConnections,
  updateConnection
} from '../store/connections-store'
import {
  cancelQuery,
  describeActive,
  deleteRow,
  disconnectPool,
  getColumnDistinct,
  getRows,
  getSchemaGraph,
  insertRow,
  listSchemas,
  listTables,
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
      const saved = getConnection(connectionId)
      if (!saved) throw new Error(`Connection ${connectionId} not found`)
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
    'db:schema-graph',
    wrap(async (connectionId: string, schema: string) => getSchemaGraph(connectionId, schema))
  )

  ipcMain.handle(
    'db:rows-get',
    wrap(async (opts: GetRowsOptions) => getRows(opts))
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
    'db:query-run',
    wrap(async (opts: RunQueryOptions) => runQuery(opts))
  )
  ipcMain.handle(
    'db:query-cancel',
    wrap(async (connectionId: string, queryId: string) =>
      cancelQuery(connectionId, queryId)
    )
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
      await shell.openExternal(url)
    })
  )
}
