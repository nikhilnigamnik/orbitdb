import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageEvent } from '../../../src/main/store/usage-store'

const stub = vi.hoisted(() => ({ userDataDir: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`unexpected getPath(${name})`)
      return stub.userDataDir
    }
  }
}))

type Store = typeof import('../../../src/main/store/usage-store')

/** Re-import so the module's in-memory cache starts empty, as on app launch. */
async function freshStore(): Promise<Store> {
  vi.resetModules()
  return import('../../../src/main/store/usage-store')
}

function fileOnDisk(): { days: Record<string, Record<string, unknown>> } {
  return JSON.parse(readFileSync(join(stub.userDataDir, 'usage.json'), 'utf8'))
}

function event(overrides: Partial<UsageEvent> = {}): UsageEvent {
  return {
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    feature: 'generate-sql',
    inputTokens: 100,
    outputTokens: 20,
    ...overrides
  } as UsageEvent
}

// Fixed points in time — the tests must not depend on when they run. TZ is pinned
// to Asia/Kolkata in vitest.config, so a UTC-derived day key would be wrong here
// for anything late in the evening, which is exactly what we want to catch.
const EVENING = new Date('2026-08-10T20:30:00Z') // 2026-08-11 01:30 local
const NOON = new Date('2026-08-10T06:30:00Z') // 2026-08-10 12:00 local

let store: Store

beforeEach(async () => {
  stub.userDataDir = mkdtempSync(join(tmpdir(), 'orbitdb-usage-'))
  store = await freshStore()
})

afterEach(() => {
  rmSync(stub.userDataDir, { recursive: true, force: true })
})

describe('recording a call', () => {
  it('counts it against the local day, not the UTC one', () => {
    // 20:30 UTC is already tomorrow in Asia/Kolkata; filing it under the UTC date
    // would put it in yesterday's column for the person who ran it.
    store.recordUsage(event(), EVENING)

    expect(Object.keys(fileOnDisk().days)).toEqual(['2026-08-11'])
  })

  it('adds to the existing row rather than duplicating it', () => {
    store.recordUsage(event(), NOON)
    store.recordUsage(event({ inputTokens: 50, outputTokens: 5 }), NOON)

    const summary = store.getUsageSummary(NOON)
    expect(summary.today.calls).toBe(2)
    expect(summary.today.input).toBe(150)
    expect(summary.today.output).toBe(25)
    expect(summary.today.byModel).toHaveLength(1)
  })

  it('keeps a different model apart', () => {
    store.recordUsage(event(), NOON)
    store.recordUsage(event({ model: 'claude-opus-5' }), NOON)

    const { byModel } = store.getUsageSummary(NOON).today
    expect(byModel).toHaveLength(2)
    expect(byModel.map((r) => r.model).sort()).toEqual(['claude-opus-5', 'claude-sonnet-5'])
  })

  it('keeps a different provider apart, even at the same model name', () => {
    store.recordUsage(event(), NOON)
    store.recordUsage(event({ provider: 'openai', model: 'gpt-5.2' }), NOON)

    expect(store.getUsageSummary(NOON).today.byModel).toHaveLength(2)
  })

  it('rolls features up separately from models', () => {
    store.recordUsage(event({ feature: 'generate-sql' }), NOON)
    store.recordUsage(event({ feature: 'explain-table' }), NOON)

    const { byModel, byFeature } = store.getUsageSummary(NOON).today
    expect(byModel, 'one model was used, twice').toHaveLength(1)
    expect(byFeature).toHaveLength(2)
  })

  it('survives a relaunch', async () => {
    store.recordUsage(event(), NOON)
    store = await freshStore()

    expect(store.getUsageSummary(NOON).today.calls).toBe(1)
  })
})

describe('the windows', () => {
  it('separate today from the last thirty days', () => {
    const tenDaysAgo = new Date('2026-07-31T06:30:00Z')
    store.recordUsage(event(), tenDaysAgo)
    store.recordUsage(event(), NOON)

    const summary = store.getUsageSummary(NOON)
    expect(summary.today.calls).toBe(1)
    expect(summary.last30.calls).toBe(2)
  })

  it('leave older calls out of the thirty-day window but keep them in all time', () => {
    const longAgo = new Date('2026-07-01T06:30:00Z')
    store.recordUsage(event(), longAgo)
    store.recordUsage(event(), NOON)

    const summary = store.getUsageSummary(NOON)
    expect(summary.last30.calls).toBe(1)
    expect(summary.allTime.calls).toBe(2)
  })

  it('put the heaviest first, since that is the row worth seeing', () => {
    store.recordUsage(event({ model: 'claude-sonnet-5', inputTokens: 10 }), NOON)
    store.recordUsage(event({ model: 'claude-opus-5', inputTokens: 9000 }), NOON)

    expect(store.getUsageSummary(NOON).today.byModel[0].model).toBe('claude-opus-5')
  })

  it('read as zero when nothing has been recorded', () => {
    const summary = store.getUsageSummary(NOON)
    expect(summary.allTime.calls).toBe(0)
    expect(summary.allTime.byModel).toEqual([])
  })
})

describe('retention', () => {
  it('drops days past the cutoff when something new is written', () => {
    const ancient = new Date('2025-01-01T06:30:00Z')
    store.recordUsage(event(), ancient)
    expect(Object.keys(fileOnDisk().days)).toHaveLength(1)

    store.recordUsage(event(), NOON)

    // Unbounded growth is the alternative: this file is written on every AI call.
    expect(Object.keys(fileOnDisk().days)).toEqual(['2026-08-10'])
  })

  it('keeps a day that is only just inside the window', () => {
    const edge = new Date('2026-05-14T06:30:00Z') // 89 days before NOON, local
    store.recordUsage(event(), edge)
    store.recordUsage(event(), NOON)

    expect(Object.keys(fileOnDisk().days)).toHaveLength(2)
  })
})

describe('clearing', () => {
  it('empties everything', () => {
    store.recordUsage(event(), NOON)
    store.clearUsage()

    expect(store.getUsageSummary(NOON).allTime.calls).toBe(0)
  })

  it('leaves the store usable afterwards', () => {
    store.recordUsage(event(), NOON)
    store.clearUsage()
    store.recordUsage(event(), NOON)

    expect(store.getUsageSummary(NOON).today.calls).toBe(1)
  })
})

describe('a usage file that is corrupt', () => {
  it('reads as empty rather than throwing on launch', async () => {
    writeFileSync(join(stub.userDataDir, 'usage.json'), 'not json', 'utf8')
    store = await freshStore()

    expect(store.getUsageSummary(NOON).allTime.calls).toBe(0)
  })
})
