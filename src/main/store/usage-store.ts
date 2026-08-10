import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { format, subDays } from 'date-fns'
import type { AiFeature, AiModelId, AiProviderId } from '../../shared/ai-models'
import { costOf } from '../../shared/ai-pricing'
import type { UsageBreakdown, UsageSummary, UsageWindow } from '../../shared/types'

const FILE_NAME = 'usage.json'

/** Long enough to see a trend, short enough that the file never needs thinking about. */
export const USAGE_RETENTION_DAYS = 90

interface Counts {
  calls: number
  input: number
  output: number
}

/** `provider|model|feature` → counts, per local day. */
type DayRows = Record<string, Counts>

interface StoreShape {
  version: 1
  days: Record<string, DayRows>
}

// No encryption here, unlike the other two stores: there are no secrets in token
// counts, and crypto.ts costs a keychain round-trip per read.
let cache: StoreShape | null = null

function emptyState(): StoreShape {
  return { version: 1, days: {} }
}

function storePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, FILE_NAME)
}

/** Local, not UTC - "today" has to mean the user's today. */
function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function rowKey(provider: string, model: string, feature: string): string {
  return `${provider}|${model}|${feature}`
}

function read(): StoreShape {
  if (cache) return cache
  const path = storePath()
  if (!existsSync(path)) {
    cache = emptyState()
    return cache
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<StoreShape>
    cache =
      parsed?.days && typeof parsed.days === 'object'
        ? { version: 1, days: parsed.days }
        : emptyState()
  } catch {
    // A corrupt usage file is not worth failing a launch over.
    cache = emptyState()
  }
  return cache
}

function write(state: StoreShape): void {
  writeFileSync(storePath(), JSON.stringify(state), 'utf8')
  cache = state
}

function prune(days: Record<string, DayRows>, now: Date): Record<string, DayRows> {
  const oldest = dayKey(subDays(now, USAGE_RETENTION_DAYS - 1))
  return Object.fromEntries(Object.entries(days).filter(([day]) => day >= oldest))
}

export interface UsageEvent {
  provider: AiProviderId
  model: AiModelId
  feature: AiFeature
  inputTokens: number
  outputTokens: number
}

/**
 * Add one call to today's rollup. Rolled up rather than logged per call so the file
 * stays small however heavily the AI features are used.
 */
export function recordUsage(event: UsageEvent, now = new Date()): void {
  const state = read()
  const day = dayKey(now)
  const key = rowKey(event.provider, event.model, event.feature)
  const rows = state.days[day] ?? {}
  const previous = rows[key] ?? { calls: 0, input: 0, output: 0 }

  const days = prune(
    {
      ...state.days,
      [day]: {
        ...rows,
        [key]: {
          calls: previous.calls + 1,
          input: previous.input + event.inputTokens,
          output: previous.output + event.outputTokens
        }
      }
    },
    now
  )
  write({ version: 1, days })
}

function emptyWindow(): UsageWindow {
  return { calls: 0, input: 0, output: 0, cost: 0, unpricedCalls: 0, byModel: [], byFeature: [] }
}

/**
 * Takes `[dayKey, rows]` rather than bare rows because cost is priced per day:
 * a rate can change partway through a window (Sonnet 5's launch discount ends
 * 2026-08-31), and the rollup is already per-day, so pricing each day at its own
 * rate is exact rather than an approximation.
 */
function summarise(days: [string, DayRows][]): UsageWindow {
  const byModel = new Map<string, UsageBreakdown>()
  const byFeature = new Map<string, UsageBreakdown>()
  const total = { calls: 0, input: 0, output: 0, cost: 0, unpricedCalls: 0 }

  for (const [day, rows] of days) {
    for (const [key, counts] of Object.entries(rows)) {
      const [provider, model, feature] = key.split('|')
      const cost = costOf(model, counts.input, counts.output, day)

      total.calls += counts.calls
      total.input += counts.input
      total.output += counts.output
      total.cost += cost ?? 0
      if (cost == null) total.unpricedCalls += counts.calls

      const modelKey = `${provider}|${model}`
      const model_ = byModel.get(modelKey) ?? { provider, model, feature: '', ...zero() }
      byModel.set(modelKey, add(model_, counts, cost))

      const feature_ = byFeature.get(feature) ?? { provider: '', model: '', feature, ...zero() }
      byFeature.set(feature, add(feature_, counts, cost))
    }
  }

  const heaviestFirst = (a: UsageBreakdown, b: UsageBreakdown) =>
    b.input + b.output - (a.input + a.output)

  return {
    ...total,
    byModel: [...byModel.values()].sort(heaviestFirst),
    byFeature: [...byFeature.values()].sort(heaviestFirst)
  }
}

function zero(): Counts & { cost: number } {
  return { calls: 0, input: 0, output: 0, cost: 0 }
}

function add(row: UsageBreakdown, counts: Counts, cost: number | null): UsageBreakdown {
  return {
    ...row,
    calls: row.calls + counts.calls,
    input: row.input + counts.input,
    output: row.output + counts.output,
    cost: row.cost + (cost ?? 0)
  }
}

export function getUsageSummary(now = new Date()): UsageSummary {
  const { days } = read()
  const today = dayKey(now)
  const from30 = dayKey(subDays(now, 29))

  const entries = Object.entries(days)
  return {
    today: summarise(entries.filter(([day]) => day === today)),
    last30: summarise(entries.filter(([day]) => day >= from30)),
    allTime: summarise(entries),
    retentionDays: USAGE_RETENTION_DAYS
  }
}

export function clearUsage(): void {
  write(emptyState())
}

/** Test seam - drops the cache so a fresh file is re-read. */
export function resetUsageCache(): void {
  cache = null
}

export { emptyWindow }
