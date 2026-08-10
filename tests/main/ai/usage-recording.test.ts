import { z } from 'zod'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageEvent } from '../../../src/main/store/usage-store'

const settings = vi.hoisted(() => ({
  provider: 'anthropic',
  apiKey: 'sk-ant-1',
  model: 'claude-sonnet-5'
}))
const recorded = vi.hoisted(() => ({ events: [] as UsageEvent[], shouldThrow: false }))
const generated = vi.hoisted(() => ({
  usage: { inputTokens: 1200, outputTokens: 340 } as Record<string, number | undefined>,
  /** Set to fail the first call, so the plain-text retry path is exercised. */
  failFirst: false,
  calls: 0
}))

vi.mock('../../../src/main/store/settings-store', () => ({
  getAiSettings: () => ({ ...settings }),
  getProviderSettings: (provider: string) => ({
    apiKey: `key-for-${provider}`,
    model: provider === 'openai' ? 'gpt-5.2' : 'claude-sonnet-5'
  })
}))

vi.mock('../../../src/main/store/usage-store', () => ({
  recordUsage: (event: UsageEvent) => {
    if (recorded.shouldThrow) throw new Error('disk full')
    recorded.events.push(event)
  }
}))

const stubSdk = () => () => (model: string) => ({ id: model })
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: stubSdk() }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: stubSdk() }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: stubSdk() }))

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    generateText: vi.fn(async () => {
      generated.calls++
      if (generated.failFirst && generated.calls === 1) {
        throw new Error('could not parse the response')
      }
      return {
        text: '{"ok":true}',
        output: generated.failFirst ? undefined : { ok: true },
        totalUsage: generated.usage
      }
    })
  }
})

type Client = typeof import('../../../src/main/ai/client')

let client: Client

beforeEach(async () => {
  recorded.events = []
  recorded.shouldThrow = false
  generated.usage = { inputTokens: 1200, outputTokens: 340 }
  generated.failFirst = false
  generated.calls = 0
  settings.provider = 'anthropic'
  settings.model = 'claude-sonnet-5'
  vi.resetModules()
  client = await import('../../../src/main/ai/client')
})

describe('every call through the wrapper', () => {
  it('records what it used, against the provider and model that served it', async () => {
    await client.runText('generate-sql', { prompt: 'p' })

    expect(recorded.events).toEqual([
      {
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        feature: 'generate-sql',
        inputTokens: 1200,
        outputTokens: 340
      }
    ])
  })

  it('records under the feature it was told, not a default', async () => {
    await client.runText('explain-table', { prompt: 'p' })
    expect(recorded.events[0].feature).toBe('explain-table')
  })

  it('follows the active model when it changes', async () => {
    settings.model = 'claude-opus-5'
    await client.runText('generate-sql', { prompt: 'p' })

    expect(recorded.events[0].model).toBe('claude-opus-5')
  })

  it('attributes a key test to the provider being tested, not the active one', async () => {
    // The card you pressed is the one being billed for it.
    await client.runText('test-key', { prompt: 'p' }, 'openai')

    expect(recorded.events[0]).toMatchObject({ provider: 'openai', model: 'gpt-5.2' })
  })

  it('counts a reply the provider gave no numbers for as zero, not NaN', async () => {
    generated.usage = { inputTokens: undefined, outputTokens: undefined }

    await client.runText('generate-sql', { prompt: 'p' })

    expect(recorded.events[0]).toMatchObject({ inputTokens: 0, outputTokens: 0 })
  })

  it('records a structured call once when it works first time', async () => {
    await client.generateJson({
      feature: 'filter-table',
      schema: z.object({ ok: z.boolean() }),
      system: 's',
      prompt: 'p'
    })

    expect(recorded.events).toHaveLength(1)
    expect(recorded.events[0].feature).toBe('filter-table')
  })

  it('counts only the pass that came back, when the first one threw', async () => {
    // generateJson can call the model twice. A throw carries no usage object, so
    // the failed attempt is genuinely uncountable - the reported figure is a
    // lower bound, not a guess, which is the honest way round.
    generated.failFirst = true

    await client.generateJson({
      feature: 'filter-table',
      schema: z.object({ ok: z.boolean() }),
      system: 's',
      prompt: 'p'
    })

    expect(generated.calls, 'the model really was called twice').toBe(2)
    expect(recorded.events).toHaveLength(1)
  })
})

describe('when recording itself fails', () => {
  it('does not cost the user the answer they were waiting for', async () => {
    // Bookkeeping is the least important thing happening in this function.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    recorded.shouldThrow = true

    const result = await client.runText('generate-sql', { prompt: 'p' })

    expect(result.text).toBe('{"ok":true}')
    expect(quiet, 'and it is not swallowed silently either').toHaveBeenCalled()
    quiet.mockRestore()
  })
})
