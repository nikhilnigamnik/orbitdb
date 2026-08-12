import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Same stand-in for Electron's credential vault as connections-store's spec:
// `sealed:` marks a value as having gone through it, so a test can assert on
// what actually hit the disk.
const stub = vi.hoisted(() => ({
  userDataDir: '',
  isEncryptionAvailable: true,
  failDecrypt: false
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`unexpected getPath(${name})`)
      return stub.userDataDir
    }
  },
  safeStorage: {
    isEncryptionAvailable: () => stub.isEncryptionAvailable,
    encryptString: (plain: string) => Buffer.from(`sealed:${plain}`, 'utf8'),
    decryptString: (buf: Buffer) => {
      if (stub.failDecrypt) throw new Error('sealed under a different keychain')
      return buf.toString('utf8').slice('sealed:'.length)
    }
  }
}))

type Store = typeof import('../../../src/main/store/settings-store')

const KEY = 'sk-ant-api03-abcdef123456'

function sealed(plain: string): string {
  return `enc:v1:${Buffer.from(`sealed:${plain}`, 'utf8').toString('base64')}`
}

/** Re-import so the module's in-memory cache starts empty, as on app launch. */
async function freshStore(): Promise<Store> {
  vi.resetModules()
  return import('../../../src/main/store/settings-store')
}

function fileOnDisk(): {
  ai: { provider: string; keys: Record<string, string>; models: Record<string, string> }
  gateway: { accountId: string; gatewayId: string }
} {
  return JSON.parse(readFileSync(join(stub.userDataDir, 'settings.json'), 'utf8'))
}

function writeFile(contents: unknown): void {
  writeFileSync(join(stub.userDataDir, 'settings.json'), JSON.stringify(contents), 'utf8')
}

let store: Store

beforeEach(async () => {
  stub.userDataDir = mkdtempSync(join(tmpdir(), 'orbitdb-settings-'))
  stub.isEncryptionAvailable = true
  stub.failDecrypt = false
  store = await freshStore()
})

afterEach(() => {
  rmSync(stub.userDataDir, { recursive: true, force: true })
})

describe('the API key', () => {
  it('is sealed on disk and readable back', () => {
    store.setAiApiKey('anthropic', KEY)

    expect(fileOnDisk().ai.keys.anthropic, 'the key must never sit in plaintext').toBe(sealed(KEY))
    expect(store.getAiSettings().apiKey).toBe(KEY)
  })

  it('is trimmed, since a pasted key usually brings whitespace', () => {
    store.setAiApiKey('anthropic', `  ${KEY}\n`)
    expect(store.getAiSettings().apiKey).toBe(KEY)
  })

  it('is refused when empty, rather than saved as "no key"', () => {
    expect(() => store.setAiApiKey('anthropic', '   ')).toThrow(/empty/i)
  })

  it('falls back to plaintext when the OS has no keychain', async () => {
    stub.isEncryptionAvailable = false
    store = await freshStore()

    store.setAiApiKey('anthropic', KEY)
    expect(fileOnDisk().ai.keys.anthropic).toBe(KEY)
    expect(store.getAiSettings().apiKey).toBe(KEY)
  })

  it('is migrated to sealed on first read of a plaintext file', async () => {
    writeFile({ version: 1, ai: { apiKey: KEY, model: 'claude-sonnet-5' } })
    store = await freshStore()

    expect(store.getAiSettings().apiKey).toBe(KEY)
    expect(fileOnDisk().ai.keys.anthropic).toBe(sealed(KEY))
  })

  it('survives being cleared and set again', () => {
    store.setAiApiKey('anthropic', KEY)
    store.clearAiApiKey('anthropic')
    expect(store.getAiSettings().apiKey).toBe('')
    expect(store.getAiKeyHint('anthropic')).toBeNull()

    store.setAiApiKey('anthropic', 'sk-ant-second-9999')
    expect(store.getAiSettings().apiKey).toBe('sk-ant-second-9999')
  })
})

describe('a key that cannot be unsealed on this machine', () => {
  beforeEach(async () => {
    writeFile({ version: 1, ai: { apiKey: sealed(KEY), model: 'claude-opus-5' } })
    stub.failDecrypt = true
    store = await freshStore()
  })

  it('is reported rather than silently treated as absent', () => {
    expect(store.isAiKeyUnreadable('anthropic')).toBe(true)
    expect(store.getAiSettings().apiKey).toBe('')
  })

  it('keeps its ciphertext when something else is saved', () => {
    // The unreadable key reads back as '' - writing that would destroy a key the
    // user could still recover by logging into the right OS account.
    store.setAiModel('anthropic', 'claude-haiku-4-5-20251001')

    expect(fileOnDisk().ai.keys.anthropic).toBe(sealed(KEY))
    expect(fileOnDisk().ai.models.anthropic).toBe('claude-haiku-4-5-20251001')
  })

  it('is replaced outright when the user types a new one', () => {
    store.setAiApiKey('anthropic', 'sk-ant-fresh-0000')
    expect(fileOnDisk().ai.keys.anthropic).toBe(sealed('sk-ant-fresh-0000'))
  })

  it('is really gone after Remove, not resurrected by the preserve rule', () => {
    store.clearAiApiKey('anthropic')
    expect(fileOnDisk().ai.keys.anthropic).toBe('')
  })
})

describe('the key hint', () => {
  it('shows the last four characters and nothing more', () => {
    store.setAiApiKey('anthropic', KEY)
    expect(store.getAiKeyHint('anthropic')).toBe('…3456')
  })

  it('gives nothing away for a key too short to mask', () => {
    store.setAiApiKey('anthropic', 'abcd')
    expect(store.getAiKeyHint('anthropic')).toBe('…')
  })

  it('is null when no key is set', () => {
    expect(store.getAiKeyHint('anthropic')).toBeNull()
  })
})

describe('the model', () => {
  it('defaults to Sonnet 5', () => {
    expect(store.getAiSettings().model).toBe('claude-sonnet-5')
  })

  it('is rejected when unknown, rather than passed to the provider', () => {
    // An unrecognised id would come back from the API as an opaque 404.
    // gpt-4 is a real model, just not an Anthropic one.
    expect(() => store.setAiModel('anthropic', 'gpt-4')).toThrow(/unknown model/i)
    expect(store.getAiSettings().model).toBe('claude-sonnet-5')
  })

  it('falls back when the stored one is no longer offered', async () => {
    // A model dropped between releases must not break every AI call.
    writeFile({
      version: 2,
      ai: { provider: 'anthropic', keys: {}, models: { anthropic: 'claude-retired-1' } }
    })
    store = await freshStore()

    expect(store.getAiSettings().model).toBe('claude-sonnet-5')
  })

  it('persists across a relaunch', async () => {
    store.setAiModel('anthropic', 'claude-opus-5')
    store = await freshStore()

    expect(store.getAiSettings().model).toBe('claude-opus-5')
  })
})

describe('a settings file that is missing or corrupt', () => {
  it('reads as empty defaults rather than throwing on launch', async () => {
    writeFile('not json at all')
    store = await freshStore()

    expect(store.getAiSettings()).toEqual({
      provider: 'anthropic',
      apiKey: '',
      model: 'claude-sonnet-5'
    })
  })
})

describe('more than one provider', () => {
  it('keeps a key per provider, not one shared key', () => {
    store.setAiApiKey('anthropic', 'sk-ant-1111')
    store.setAiApiKey('openai', 'sk-openai-2222')

    expect(fileOnDisk().ai.keys.anthropic).toBe(sealed('sk-ant-1111'))
    expect(fileOnDisk().ai.keys.openai).toBe(sealed('sk-openai-2222'))
  })

  it('hands the AI layer the key and model of whichever is selected', () => {
    store.setAiApiKey('anthropic', 'sk-ant-1111')
    store.setAiApiKey('google', 'AIza-3333')
    store.setAiModel('google', 'gemini-2.5-flash')

    store.setAiProvider('google')

    expect(store.getAiSettings()).toEqual({
      provider: 'google',
      apiKey: 'AIza-3333',
      model: 'gemini-2.5-flash'
    })
  })

  it('does not lose the others when switching', () => {
    // Switching to compare answers must not cost you the key you came from.
    store.setAiApiKey('anthropic', 'sk-ant-1111')
    store.setAiProvider('openai')
    store.setAiApiKey('openai', 'sk-openai-2222')
    store.setAiProvider('anthropic')

    expect(store.getAiSettings().apiKey).toBe('sk-ant-1111')
    expect(store.getProviderSettings('openai').apiKey).toBe('sk-openai-2222')
  })

  it('removes one key without touching the rest', () => {
    store.setAiApiKey('anthropic', 'sk-ant-1111')
    store.setAiApiKey('openai', 'sk-openai-2222')

    store.clearAiApiKey('openai')

    expect(store.getProviderSettings('openai').apiKey).toBe('')
    expect(store.getProviderSettings('anthropic').apiKey).toBe('sk-ant-1111')
  })

  it('refuses a model that belongs to a different provider', () => {
    // gemini-2.5-flash is a real model - just not an OpenAI one, and sending it
    // there returns an opaque 404.
    expect(() => store.setAiModel('openai', 'gemini-2.5-flash')).toThrow(/unknown model/i)
  })

  it('refuses a provider it does not have an SDK for', () => {
    expect(() => store.setAiProvider('mistral')).toThrow(/unknown provider/i)
  })
})

describe('a settings file written by the single-provider version', () => {
  it('reads its key and model as Anthropic’s', async () => {
    // v1 had no provider field because there was only one.
    writeFile({ version: 1, ai: { apiKey: sealed(KEY), model: 'claude-opus-5' } })
    store = await freshStore()

    expect(store.getAiSettings()).toEqual({
      provider: 'anthropic',
      apiKey: KEY,
      model: 'claude-opus-5'
    })
    expect(store.getProviderSettings('anthropic').apiKey).toBe(KEY)
  })

  it('leaves the other providers empty rather than inventing keys', async () => {
    writeFile({ version: 1, ai: { apiKey: sealed(KEY), model: 'claude-opus-5' } })
    store = await freshStore()

    store.setAiProvider('openai')
    expect(store.getAiSettings().apiKey).toBe('')
  })
})

const TOKEN = 'cf-aig-token-wxyz'

describe('the Cloudflare provider', () => {
  it('keeps its token with the other keys, sealed the same way', () => {
    store.setAiApiKey('cloudflare', TOKEN)

    expect(fileOnDisk().ai.keys.cloudflare).toBe(sealed(TOKEN))
    expect(store.getProviderSettings('cloudflare').apiKey).toBe(TOKEN)
    expect(store.getAiKeyHint('cloudflare')).toBe('…wxyz')
  })

  it('stores its two ids in the clear, since they identify rather than authorise', () => {
    store.setGatewaySettings({ accountId: 'acct-1', gatewayId: 'orbitdb' })

    expect(fileOnDisk().gateway).toEqual({ accountId: 'acct-1', gatewayId: 'orbitdb' })
  })

  it('trims what was pasted, so a stray space is not baked into the URL', () => {
    store.setGatewaySettings({ accountId: '  acct-1 ', gatewayId: ' orbitdb  ' })

    expect(store.getGatewaySettings()).toEqual({ accountId: 'acct-1', gatewayId: 'orbitdb' })
  })

  it('lets the ids be blanked, which is how it is un-configured', () => {
    // Unlike a key, empty means empty here rather than "leave it alone".
    store.setGatewaySettings({ accountId: 'acct-1', gatewayId: 'orbitdb' })
    store.setGatewaySettings({ accountId: '', gatewayId: '' })

    expect(store.getGatewaySettings()).toEqual({ accountId: '', gatewayId: '' })
  })

  it('defaults to a catalog slug, not one of our own model ids', () => {
    expect(store.getProviderSettings('cloudflare').model).toBe('anthropic/claude-sonnet-5')
  })

  it('refuses a model that is not in the catalog list', () => {
    // `claude-sonnet-5` is a real model but not a real Cloudflare slug.
    expect(() => store.setAiModel('cloudflare', 'claude-sonnet-5')).toThrow(/Unknown model/)
  })

  it('survives a relaunch, ids and token together', async () => {
    store.setGatewaySettings({ accountId: 'acct-1', gatewayId: 'orbitdb' })
    store.setAiApiKey('cloudflare', TOKEN)
    store = await freshStore()

    expect(store.getGatewaySettings()).toEqual({ accountId: 'acct-1', gatewayId: 'orbitdb' })
    expect(store.getProviderSettings('cloudflare').apiKey).toBe(TOKEN)
  })
})

describe('a settings file written before Cloudflare was a provider', () => {
  it('reads with an unconfigured gateway, keeping the keys it already had', async () => {
    writeFile({
      version: 2,
      ai: {
        provider: 'openai',
        keys: { anthropic: sealed(KEY), openai: '', google: '' },
        models: { anthropic: 'claude-opus-5', openai: 'gpt-5.2', google: 'gemini-3.6-flash' }
      }
    })
    store = await freshStore()

    expect(store.getGatewaySettings()).toEqual({ accountId: '', gatewayId: '' })
    expect(store.getProviderSettings('anthropic').apiKey).toBe(KEY)
    expect(store.getActiveProvider()).toBe('openai')
    // The new provider slot exists but is empty rather than absent.
    expect(store.getProviderSettings('cloudflare').apiKey).toBe('')
  })
})
