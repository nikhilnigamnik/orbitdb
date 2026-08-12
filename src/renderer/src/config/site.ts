import type { ConnectionEnvironment, DatabaseEngine } from '@renderer/types'

// Re-exported so components follow the usual "constants come from config/" rule
// rather than reaching across the shared boundary by relative path.
export {
  AI_FEATURES,
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  MISSING_AI_KEY_MESSAGE,
  aiFeatureLabel,
  aiModelLabel,
  aiProvider,
  needsGatewayIds
} from '../../../shared/ai-models'

export { formatCost, isPricedModel, rateFor } from '../../../shared/ai-pricing'

export const APP_NAME = 'OrbitDB'
export const APP_TAGLINE = 'Postgres + MySQL, made friendly'
export const APP_VERSION = '0.1.0'

export const GITHUB_REPO_URL = 'https://github.com/nikhilnigamnik/orbitdb'

export const DEFAULT_PAGE_SIZE = 50
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const
export const MAX_PAGE_SIZE = 1000

/**
 * How long the undo prompt (and the marker on the row it belongs to) stays up
 * after a cell edit. The undo itself outlives it - this is only the hint.
 */
export const UNDO_PROMPT_MS = 7_000

/** How long a toast stays up, by tone. A failure needs reading; a success does not. */
export const TOAST_DURATION_MS = {
  success: 4_000,
  info: 4_000,
  warning: 6_000,
  error: 10_000
} as const

/** Floor for any toast carrying an action, so the button is actually clickable. */
export const TOAST_ACTION_MIN_MS = 10_000

/** Beyond this the stack covers the screen it is reporting on. */
export const MAX_TOASTS = 3

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

/**
 * Opening query for a fresh editor. `now()` does not exist in SQLite, so a
 * single default would fail on D1 the first time you press Run.
 */
export const DEFAULT_QUERY: Record<DatabaseEngine, string> = {
  postgres: 'select now();',
  mysql: 'select now();',
  d1: "select datetime('now');"
}

export const ENVIRONMENTS: ConnectionEnvironment[] = ['dev', 'stage', 'prod']

export const ENVIRONMENT_LABEL: Record<ConnectionEnvironment, string> = {
  dev: 'Dev',
  stage: 'Stage',
  prod: 'Prod'
}

export const DEFAULT_ENVIRONMENT: ConnectionEnvironment = 'dev'

export const DEFAULT_CONNECTION_VALUES = {
  name: '',
  engine: 'postgres' as DatabaseEngine,
  environment: DEFAULT_ENVIRONMENT,
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
