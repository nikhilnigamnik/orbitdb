import type { DatabaseEngine } from '@renderer/types'

export const APP_NAME = 'OrbitDB'
export const APP_TAGLINE = 'Postgres + MySQL, made friendly'
export const APP_VERSION = '0.1.0'

export const DEFAULT_PAGE_SIZE = 50
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const
export const MAX_PAGE_SIZE = 1000

export const ENGINE_LABEL: Record<DatabaseEngine, string> = {
  postgres: 'Postgres',
  mysql: 'MySQL',
  d1: 'D1'
}

export const DEFAULT_PORTS: Record<DatabaseEngine, number> = {
  postgres: 5432,
  mysql: 3306,
  d1: 0
}

export const DEFAULT_USERS: Record<DatabaseEngine, string> = {
  postgres: 'postgres',
  mysql: 'root',
  d1: ''
}

export const DEFAULT_DATABASES: Record<DatabaseEngine, string> = {
  postgres: 'postgres',
  mysql: '',
  d1: ''
}

export const DEFAULT_CONNECTION_VALUES = {
  name: '',
  engine: 'postgres' as DatabaseEngine,
  host: 'localhost',
  port: DEFAULT_PORTS.postgres,
  database: DEFAULT_DATABASES.postgres,
  user: DEFAULT_USERS.postgres,
  password: '',
  ssl: false,
  accountId: '',
  databaseId: '',
  apiToken: ''
}
