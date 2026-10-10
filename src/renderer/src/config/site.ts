import type { ConnectionColor, ConnectionEnvironment, DatabaseEngine } from '@renderer/types'

// Same rule as the AI re-exports above: a value crossing the shared boundary
// comes through config/ rather than a relative path from a component.
export {
  normalizeFolder,
  CONNECTION_COLORS,
  canReuseStoredSecrets,
  THEME_PREFERENCES,
  DEFAULT_THEME_PREFERENCE,
  isThemePreference
} from '../../../shared/types'

// Re-exported so components follow the usual "constants come from config/" rule
// rather than reaching across the shared boundary by relative path.
export {
  AI_FEATURES,
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  MISSING_AI_KEY_MESSAGE,
  aiFeatureLabel,
  isAiSetupMessage,
  aiModelLabel,
  aiProvider,
  needsGatewayIds
} from '../../../shared/ai-models'

export { formatCost, isPricedModel, rateFor } from '../../../shared/ai-pricing'

/**
 * The "finish setting up AI" state, worded for every provider at once.
 * `isAiSetupMessage` matches all four providers' setup errors - and the
 * half-configured gateway - so no surface can know which key is missing. One
 * toast used to name Anthropic regardless, telling a user with OpenAI selected
 * to add the wrong key.
 */
export const AI_SETUP_COPY = {
  title: 'Set up an AI provider',
  description:
    'Add a key for Anthropic, OpenAI, Google or a Cloudflare gateway in Settings. It stays encrypted on this machine.',
  action: 'Open settings'
} as const

export const APP_NAME = 'OrbitDB'
export const APP_TAGLINE = 'Postgres + MySQL, made friendly'

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

/**
 * Tailwind resolves class names statically, so every accent has to be written
 * out here as a literal - `bg-tag-${color}` compiles to nothing.
 */
export const CONNECTION_COLOR_CLASS: Record<ConnectionColor, string> = {
  slate: 'bg-tag-slate',
  blue: 'bg-tag-blue',
  violet: 'bg-tag-violet',
  cyan: 'bg-tag-cyan',
  green: 'bg-tag-green',
  amber: 'bg-tag-amber',
  orange: 'bg-tag-orange',
  rose: 'bg-tag-rose'
}

/**
 * A tag filled behind a letter (the sidebar's connection tile). Ink follows
 * the fill so the initial holds 4.5:1: dark on the light tags, white on the
 * dark ones, and green and rose - which carry neither - on deeper fills.
 */
export const CONNECTION_TILE_CLASS: Record<ConnectionColor, string> = {
  slate: 'bg-tag-slate text-tag-ink',
  blue: 'bg-tag-blue text-white',
  violet: 'bg-tag-violet text-white',
  cyan: 'bg-tag-cyan text-tag-ink',
  green: 'bg-tag-green-deep text-white',
  amber: 'bg-tag-amber text-tag-ink',
  orange: 'bg-tag-orange text-tag-ink',
  rose: 'bg-tag-rose-deep text-white'
}

export const CONNECTION_COLOR_LABEL: Record<ConnectionColor, string> = {
  slate: 'Slate',
  blue: 'Blue',
  violet: 'Violet',
  cyan: 'Cyan',
  green: 'Green',
  amber: 'Amber',
  orange: 'Orange',
  rose: 'Rose'
}

/** Long enough for "Client work / staging", short enough to fit a group header. */
export const MAX_FOLDER_NAME_LENGTH = 40

/** Heading for the connections that were never filed anywhere. */
export const UNGROUPED_FOLDER_LABEL = 'Ungrouped'

export const DEFAULT_CONNECTION_VALUES = {
  name: '',
  engine: 'postgres' as DatabaseEngine,
  environment: DEFAULT_ENVIRONMENT,
  folder: '',
  color: undefined as ConnectionColor | undefined,
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
