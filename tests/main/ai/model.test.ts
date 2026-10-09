import { beforeEach, describe, expect, it, vi } from 'vitest'

const settings = vi.hoisted(() => ({
  provider: 'anthropic',
  apiKey: '',
  model: 'claude-sonnet-5'
}))
const gateway = vi.hoisted(() => ({
  accountId: '',
  gatewayId: ''
}))
/** Which SDK modules have actually been loaded - the mock factories run on import. */
const loaded = vi.hoisted(() => ({ modules: [] as string[] }))
const created = vi.hoisted(() => ({
  keys: [] as string[],
  models: [] as string[],
  providers: [] as string[]
}))
/** What `createAiGateway` was built with, and what it was handed to wrap. */
const routed = vi.hoisted(() => ({
  configs: [] as Record<string, unknown>[],
  wrapped: [] as unknown[]
}))

vi.mock('../../../src/main/store/settings-store', () => ({
  getAiSettings: () => ({ ...settings }),
  getProviderSettings: () => ({ apiKey: settings.apiKey, model: settings.model }),
  getGatewaySettings: () => ({ ...gateway })
}))

vi.mock('ai-gateway-provider', () => ({
  createAiGateway: (config: Record<string, unknown>) => {
    routed.configs.push(config)
    return (model: unknown) => {
      routed.wrapped.push(model)
      return { id: 'gateway', inner: model }
    }
  }
}))

vi.mock('ai-gateway-provider/providers/unified', () => ({
  createUnified: () => (slug: string) => ({ id: `unified/${slug}` })
}))

// Stand-ins for each provider SDK: they record what they were built with, so a
// test can tell a rebuild from a reuse - and which SDK was reached for.
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

vi.mock('@ai-sdk/anthropic', () => {
  loaded.modules.push('@ai-sdk/anthropic')
  return { createAnthropic: stubSdk('anthropic') }
})
vi.mock('@ai-sdk/openai', () => {
  loaded.modules.push('@ai-sdk/openai')
  return { createOpenAI: stubSdk('openai') }
})
vi.mock('@ai-sdk/google', () => {
  loaded.modules.push('@ai-sdk/google')
  return { createGoogleGenerativeAI: stubSdk('google') }
})

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
  gateway.accountId = ''
  gateway.gatewayId = ''
  routed.configs = []
  routed.wrapped = []
  loaded.modules = []
  client = await freshClient()
})

describe('loading the SDKs', () => {
  it('loads no provider SDK until a model is first asked for', async () => {
    // Startup cost: every SDK used to be required before the window could open.
    expect(loaded.modules).toEqual([])

    settings.apiKey = 'sk-ant-1'
    await client.getModel()

    expect(loaded.modules).toEqual(['@ai-sdk/anthropic'])
  })

  it('builds once when two callers race the first build', async () => {
    settings.apiKey = 'sk-ant-1'

    const [first, second] = await Promise.all([client.getModel(), client.getModel()])

    expect(second).toBe(first)
    expect(created.keys).toEqual(['sk-ant-1'])
  })

  it('does not cache a failed build, so saving a key takes effect', async () => {
    await expect(client.getModel()).rejects.toThrow(/Settings/)

    settings.apiKey = 'sk-ant-1'
    await client.getModel()

    expect(created.keys).toEqual(['sk-ant-1'])
  })
})

describe('with no key saved', () => {
  it('says where to add one instead of failing at the provider', async () => {
    // Left to the SDK this surfaces as a 401 with no hint about what to do.
    await expect(client.getModel()).rejects.toThrow(/Settings/)
    expect(created.keys, 'nothing should be built without a key').toEqual([])
  })
})

describe('with a key saved', () => {
  it('builds the model the settings name', async () => {
    settings.apiKey = 'sk-ant-1'
    settings.model = 'claude-opus-5'

    await client.getModel()

    expect(created.keys).toEqual(['sk-ant-1'])
    expect(created.models).toEqual(['claude-opus-5'])
  })

  it('reuses the same instance while nothing changes', async () => {
    settings.apiKey = 'sk-ant-1'

    const first = await client.getModel()
    const second = await client.getModel()

    expect(second).toBe(first)
    expect(created.keys).toHaveLength(1)
  })

  it('rebuilds when the key changes, so a new key takes effect at once', async () => {
    // The whole point of reading settings at call time: no restart.
    settings.apiKey = 'sk-ant-1'
    await client.getModel()

    settings.apiKey = 'sk-ant-2'
    await client.getModel()

    expect(created.keys).toEqual(['sk-ant-1', 'sk-ant-2'])
  })

  it('rebuilds when the model changes', async () => {
    settings.apiKey = 'sk-ant-1'
    await client.getModel()

    settings.model = 'claude-haiku-4-5-20251001'
    await client.getModel()

    expect(created.models).toEqual(['claude-sonnet-5', 'claude-haiku-4-5-20251001'])
  })

  it('stops working the moment the key is removed', async () => {
    settings.apiKey = 'sk-ant-1'
    await client.getModel()

    settings.apiKey = ''
    await expect(client.getModel()).rejects.toThrow(/Settings/)
  })
})

describe('the Cloudflare provider', () => {
  function configure() {
    settings.provider = 'cloudflare'
    settings.model = 'anthropic/claude-sonnet-5'
    gateway.accountId = 'acct-1'
    gateway.gatewayId = 'orbitdb'
  }

  it('goes through the gateway rather than any vendor SDK', async () => {
    configure()
    settings.apiKey = 'cf-token-1'

    await client.getModel()

    expect(routed.configs).toEqual([
      { accountId: 'acct-1', gateway: 'orbitdb', apiKey: 'cf-token-1' }
    ])
    // No vendor SDK is reached for: Cloudflare supplies the upstream credential.
    expect(created.keys).toEqual([])
    expect(routed.wrapped).toEqual([{ id: 'unified/anthropic/claude-sonnet-5' }])
  })

  it('sends the catalog slug verbatim, not a derived one', async () => {
    // Cloudflare's catalog says `google/`, while `google-ai-studio/` is the
    // separate provider-native route - so the id is the slug, not built from one.
    configure()
    settings.model = 'google/gemini-3.6-flash'

    await client.getModel()

    expect(routed.wrapped).toEqual([{ id: 'unified/google/gemini-3.6-flash' }])
  })

  it('works with no token, since an unauthenticated gateway is a real setup', async () => {
    configure()

    await client.getModel()

    expect(routed.configs[0].apiKey).toBeUndefined()
  })

  it('rebuilds when the token is rotated', async () => {
    configure()
    settings.apiKey = 'cf-token-1'
    await client.getModel()

    settings.apiKey = 'cf-token-2'
    await client.getModel()

    expect(routed.configs.map((c) => c.apiKey)).toEqual(['cf-token-1', 'cf-token-2'])
  })

  it('rebuilds when the gateway is renamed, not only when the token changes', async () => {
    configure()
    const first = await client.getModel()

    gateway.gatewayId = 'renamed'
    const second = await client.getModel()

    expect(second).not.toBe(first)
    expect(routed.configs.map((c) => c.gateway)).toEqual(['orbitdb', 'renamed'])
  })

  it('says what is missing when only one id is filled in', async () => {
    settings.provider = 'cloudflare'
    settings.model = 'anthropic/claude-sonnet-5'
    gateway.accountId = 'acct-1'

    await expect(client.getModel()).rejects.toThrow(/gateway id/)
  })
})

describe('choosing a provider', () => {
  it('reaches for the SDK that provider belongs to', async () => {
    settings.provider = 'openai'
    settings.apiKey = 'sk-openai-1'
    settings.model = 'gpt-5.2'

    await client.getModel()

    expect(created.providers).toEqual(['openai'])
    expect(created.models).toEqual(['gpt-5.2'])
  })

  it('rebuilds when the provider changes, even at the same key and model name', async () => {
    // Reusing the cached instance here would keep talking to the old provider.
    settings.provider = 'anthropic'
    settings.apiKey = 'shared-key'
    await client.getModel()

    settings.provider = 'google'
    settings.model = 'gemini-3.6-flash'
    await client.getModel()

    expect(created.providers).toEqual(['anthropic', 'google'])
  })
})
