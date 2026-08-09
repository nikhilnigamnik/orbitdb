import { beforeEach, describe, expect, it, vi } from 'vitest'

const settings = vi.hoisted(() => ({
  provider: 'anthropic',
  apiKey: '',
  model: 'claude-sonnet-5'
}))
const created = vi.hoisted(() => ({
  keys: [] as string[],
  models: [] as string[],
  providers: [] as string[]
}))

vi.mock('../../../src/main/store/settings-store', () => ({
  getAiSettings: () => ({ ...settings })
}))

// Stand-ins for each provider SDK: they record what they were built with, so a
// test can tell a rebuild from a reuse — and which SDK was reached for.
function stubSdk(name: string) {
  return ({ apiKey }: { apiKey: string }) => {
    created.providers.push(name)
    created.keys.push(apiKey)
    return (model: string) => {
      created.models.push(model)
      return { id: `${name}/${apiKey}/${model}` }
    }
  }
}

vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: stubSdk('anthropic') }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: stubSdk('openai') }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: stubSdk('google') }))

type Client = typeof import('../../../src/main/ai/client')

async function freshClient(): Promise<Client> {
  vi.resetModules()
  return import('../../../src/main/ai/client')
}

let client: Client

beforeEach(async () => {
  settings.provider = 'anthropic'
  settings.apiKey = ''
  settings.model = 'claude-sonnet-5'
  created.keys = []
  created.models = []
  created.providers = []
  client = await freshClient()
})

describe('with no key saved', () => {
  it('says where to add one instead of failing at the provider', async () => {
    // Left to the SDK this surfaces as a 401 with no hint about what to do.
    expect(() => client.getModel()).toThrow(/Settings/)
    expect(created.keys, 'nothing should be built without a key').toEqual([])
  })
})

describe('with a key saved', () => {
  it('builds the model the settings name', () => {
    settings.apiKey = 'sk-ant-1'
    settings.model = 'claude-opus-5'

    client.getModel()

    expect(created.keys).toEqual(['sk-ant-1'])
    expect(created.models).toEqual(['claude-opus-5'])
  })

  it('reuses the same instance while nothing changes', () => {
    settings.apiKey = 'sk-ant-1'

    const first = client.getModel()
    const second = client.getModel()

    expect(second).toBe(first)
    expect(created.keys).toHaveLength(1)
  })

  it('rebuilds when the key changes, so a new key takes effect at once', () => {
    // The whole point of reading settings at call time: no restart.
    settings.apiKey = 'sk-ant-1'
    client.getModel()

    settings.apiKey = 'sk-ant-2'
    client.getModel()

    expect(created.keys).toEqual(['sk-ant-1', 'sk-ant-2'])
  })

  it('rebuilds when the model changes', () => {
    settings.apiKey = 'sk-ant-1'
    client.getModel()

    settings.model = 'claude-haiku-4-5-20251001'
    client.getModel()

    expect(created.models).toEqual(['claude-sonnet-5', 'claude-haiku-4-5-20251001'])
  })

  it('stops working the moment the key is removed', () => {
    settings.apiKey = 'sk-ant-1'
    client.getModel()

    settings.apiKey = ''
    expect(() => client.getModel()).toThrow(/Settings/)
  })
})

describe('choosing a provider', () => {
  it('reaches for the SDK that provider belongs to', () => {
    settings.provider = 'openai'
    settings.apiKey = 'sk-openai-1'
    settings.model = 'gpt-5.2'

    client.getModel()

    expect(created.providers).toEqual(['openai'])
    expect(created.models).toEqual(['gpt-5.2'])
  })

  it('rebuilds when the provider changes, even at the same key and model name', () => {
    // Reusing the cached instance here would keep talking to the old provider.
    settings.provider = 'anthropic'
    settings.apiKey = 'shared-key'
    client.getModel()

    settings.provider = 'google'
    settings.model = 'gemini-3.6-flash'
    client.getModel()

    expect(created.providers).toEqual(['anthropic', 'google'])
  })
})
