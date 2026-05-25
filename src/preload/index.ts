import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  ActiveConnectionMeta,
  ConnectionInput,
  GetRowsOptions,
  OperationResult,
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
    test: (input: ConnectionInput) => invoke<TestConnectionResult>('connections:test', input)
  },
  db: {
    connect: (connectionId: string) => invoke<ActiveConnectionMeta>('db:connect', connectionId),
    disconnect: (connectionId: string) => invoke<void>('db:disconnect', connectionId),
    listSchemas: (connectionId: string) => invoke<SchemaInfo[]>('db:list-schemas', connectionId),
    listTables: (connectionId: string, schema: string) =>
      invoke<TableInfo[]>('db:list-tables', connectionId, schema),
    tableDetails: (connectionId: string, schema: string, table: string) =>
      invoke<TableDetails>('db:table-details', connectionId, schema, table),
    getRows: (opts: GetRowsOptions) => invoke<RowsResult>('db:rows-get', opts),
    insertRow: (opts: RowMutation) => invoke<Record<string, unknown>>('db:row-insert', opts),
    updateRow: (opts: RowUpdate) => invoke<Record<string, unknown>>('db:row-update', opts),
    deleteRow: (opts: RowDelete) => invoke<{ deleted: number }>('db:row-delete', opts),
    runQuery: (opts: RunQueryOptions) => invoke<QueryResult>('db:query-run', opts)
  }
}

export type OrbitApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
