import { ipcMain } from 'electron'
import type {
  ConnectionInput,
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
  describeActive,
  deleteRow,
  disconnectPool,
  getRows,
  insertRow,
  listSchemas,
  listTables,
  runQuery,
  tableDetails,
  testConnection,
  updateRow
} from '../db/manager'

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
    wrap(async (id: string, input: ConnectionInput) => updateConnection(id, input))
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
}
