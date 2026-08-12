import { APICallError } from 'ai'
import { z } from 'zod'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const settings = vi.hoisted(() => ({
  provider: 'anthropic',
  apiKey: 'sk-ant-1',
  model: 'claude-sonnet-5'
}))
/** Queued outcomes, one per generateText call, so a test scripts both passes. */
const calls = vi.hoisted(() => ({
  queue: [] as unknown[],
  count: 0,
  lastArgs: null as Record<string, unknown> | null
}))

vi.mock('../../../src/main/store/settings-store', () => ({
  getAiSettings: () => ({ ...settings }),
  getGatewaySettings: () => ({
    isEnabled: false,
    accountId: '',
    gatewayId: '',
    token: '',
    keySource: 'app'
  })
}))

const stubSdk = () => () => (model: string) => ({ id: model })
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: stubSdk() }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: stubSdk() }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: stubSdk() }))

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    generateText: vi.fn(async (args: Record<string, unknown>) => {
      calls.lastArgs = args
      const next = calls.queue[calls.count++]
      if (next instanceof Error) throw next
      return next
    })
  }
})

type Client = typeof import('../../../src/main/ai/client')

const schema = z.object({ ok: z.boolean() })

let client: Client

beforeEach(async () => {
  calls.queue = []
  calls.count = 0
  calls.lastArgs = null
  settings.provider = 'anthropic'
  settings.apiKey = 'sk-ant-1'
  vi.resetModules()
  client = await import('../../../src/main/ai/client')
})

function run() {
  return client.generateJson({ schema, system: 's', prompt: 'p' })
}

function apiError(statusCode: number, message: string) {
  return new APICallError({
    message,
    url: 'https://api.anthropic.com',
    requestBodyValues: {},
    statusCode
  })
}

describe('asking for structured output', () => {
  it('goes through the SDK output spec, not a prompt asking nicely for JSON', async () => {
    // generateText + Output.object is the supported path in AI SDK 6, which
    // deprecated generateObject. The provider turns it into a native schema.
    calls.queue = [{ output: { ok: true } }]

    await expect(run()).resolves.toEqual({ ok: true })
    expect(calls.lastArgs?.output, 'the schema must reach the provider').toBeTruthy()
  })

  it('takes exactly one call when it works', async () => {
    calls.queue = [{ output: { ok: true } }]
    await run()
    expect(calls.count, 'a second generation would be a wasted round-trip').toBe(1)
  })
})

describe('when the answer comes back the wrong shape', () => {
  it('retries in plain text and salvages a fenced reply', async () => {
    // Output.object has no repair hook, so salvaging means asking again.
    calls.queue = [new Error('could not parse the response'), { text: '```json\n{"ok":true}\n```' }]

    await expect(run()).resolves.toEqual({ ok: true })
    expect(calls.count).toBe(2)
  })

  it('reports the first failure when the retry is no better', async () => {
    calls.queue = [new Error('the model produced nothing usable'), { text: 'sorry, I cannot' }]

    await expect(run()).rejects.toThrow(/nothing usable/)
  })

  it('rejects a reply that parses but does not match the schema', async () => {
    calls.queue = [new Error('shape'), { text: '{"ok":"yes"}' }]
    await expect(run()).rejects.toThrow(/did not match/)
  })
})

describe('when the request never landed', () => {
  it('does not retry a rejected key', async () => {
    // The retry cannot succeed, and doubles how long the user waits for a 401.
    calls.queue = [apiError(401, 'invalid x-api-key')]

    await expect(run()).rejects.toThrow(/invalid x-api-key/)
    expect(calls.count, 'one call, not two').toBe(1)
  })

  it('does not retry a rate limit, which retrying makes worse', async () => {
    calls.queue = [apiError(429, 'rate limit exceeded')]

    await expect(run()).rejects.toThrow(/rate limit/)
    expect(calls.count).toBe(1)
  })

  it('does not retry a timeout', async () => {
    const timeout = new Error('signal timed out')
    timeout.name = 'TimeoutError'
    calls.queue = [timeout]

    await expect(run()).rejects.toThrow(/timed out/)
    expect(calls.count).toBe(1)
  })

  it('does not call the model at all with no key', async () => {
    settings.apiKey = ''

    await expect(run()).rejects.toThrow(/Settings/)
    expect(calls.count).toBe(0)
  })
})
