/**
 * The AI layer: what each feature is asked for, and what it reports back.
 */

import type { AiFeature, AiModelId, AiProviderId } from '../ai-models'
import type { RowFilter, SortDirection } from './rows'

export type { AiFeature, AiModelId, AiProviderId }

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

/**
 * What the renderer is told about the AI settings. The key itself never crosses
 * back - `keyHint` (the last four characters) is enough to show *which* key is
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
 * The Cloudflare account and gateway ids. Unlike a key these cross the boundary
 * in full and in both directions: they identify rather than authorise, and both
 * appear in every dashboard URL.
 */
export interface AiGatewayIds {
  accountId: string
  gatewayId: string
}

/**
 * Every provider's state at once, so the UI can show them side by side. No key
 * is ever included - only whether there is one, and its last four characters.
 */
export interface AiSettingsView {
  active: AiProviderId
  providers: AiProviderView[]
  /** Only meaningful for the Cloudflare provider, which needs them in its URL. */
  gateway: AiGatewayIds
}

/** One row of the usage breakdown. Unused dimensions are the empty string. */
export interface UsageBreakdown {
  provider: string
  model: string
  feature: string
  calls: number
  input: number
  output: number
  /** Estimated USD at published list prices. Excludes any unpriced model. */
  cost: number
}

export interface UsageWindow {
  calls: number
  input: number
  output: number
  /** Estimated USD across every priced row in the window. */
  cost: number
  /**
   * Calls on models with no published rate in `ai-pricing.ts`. Non-zero means
   * `cost` is short by an unknown amount, and the UI has to say so rather than
   * present the figure as complete.
   */
  unpricedCalls: number
  byModel: UsageBreakdown[]
  byFeature: UsageBreakdown[]
}

/** Aggregated in main - the renderer receives numbers to show, not a log to fold. */
export interface UsageSummary {
  today: UsageWindow
  last30: UsageWindow
  allTime: UsageWindow
  /** How far back anything is kept, so the UI can say so rather than imply forever. */
  retentionDays: number
}
