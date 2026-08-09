import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import {
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  defaultModelFor,
  isAiModelId,
  isAiProviderId,
  type AiModelId,
  type AiProviderId
} from '../../shared/ai-models'
import { decryptString, encryptString, isEncrypted, isEncryptionAvailable } from './crypto'

const FILE_NAME = 'settings.json'

type PerProvider<T> = Record<AiProviderId, T>

interface AiSettings {
  provider: AiProviderId
  /** Plaintext in memory, `enc:v1:` on disk. Empty string means "not set". */
  keys: PerProvider<string>
  models: PerProvider<AiModelId>
}

interface StoreShape {
  version: 2
  ai: AiSettings
}

function emptyKeys(): PerProvider<string> {
  return Object.fromEntries(AI_PROVIDERS.map((p) => [p.id, ''])) as PerProvider<string>
}

function defaultModels(): PerProvider<AiModelId> {
  return Object.fromEntries(
    AI_PROVIDERS.map((p) => [p.id, defaultModelFor(p.id)])
  ) as PerProvider<AiModelId>
}

function emptyState(): StoreShape {
  return {
    version: 2,
    ai: { provider: DEFAULT_AI_PROVIDER, keys: emptyKeys(), models: defaultModels() }
  }
}

// Every AI call reads this, and unsealing a secret is a synchronous keychain
// round-trip. Both the on-disk bytes and the decrypted view are cached until we
// write — the same arrangement as connections-store.
let rawCache: StoreShape | null = null
let decryptedCache: StoreShape | null = null
/** Providers whose stored key exists but could not be unsealed on this host. */
let undecryptable = new Set<AiProviderId>()

function storePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, FILE_NAME)
}

/** v1 held one Anthropic key and model; v2 holds one of each per provider. */
interface LegacyAi {
  apiKey?: unknown
  model?: unknown
}

function parseFile(): StoreShape {
  const path = storePath()
  if (!existsSync(path)) return emptyState()

  let parsed: { ai?: Record<string, unknown> }
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return emptyState()
  }

  const ai = parsed?.ai
  if (!ai || typeof ai !== 'object') return emptyState()

  const state = emptyState()
  const legacy = ai as LegacyAi
  // A v1 file names anthropic implicitly — it was the only provider.
  if (typeof legacy.apiKey === 'string' && !('keys' in ai)) {
    state.ai.keys.anthropic = legacy.apiKey
    if (isAiModelId('anthropic', legacy.model)) state.ai.models.anthropic = legacy.model
    return state
  }

  const keys = (ai.keys ?? {}) as Record<string, unknown>
  const models = (ai.models ?? {}) as Record<string, unknown>
  for (const provider of AI_PROVIDERS) {
    const key = keys[provider.id]
    if (typeof key === 'string') state.ai.keys[provider.id] = key
    // A model dropped from the registry between releases must not be handed to
    // the provider; fall back rather than fail every AI call.
    const model = models[provider.id]
    if (isAiModelId(provider.id, model)) state.ai.models[provider.id] = model
  }
  if (isAiProviderId(ai.provider)) state.ai.provider = ai.provider

  return state
}

function readRaw(): StoreShape {
  if (rawCache) return rawCache
  rawCache = parseFile()
  return rawCache
}

function writeRaw(state: StoreShape): void {
  writeFileSync(storePath(), JSON.stringify(state, null, 2), 'utf8')
  rawCache = state
  decryptedCache = null
}

function read(): StoreShape {
  if (decryptedCache) return decryptedCache

  let raw = readRaw()
  const hasPlaintext = AI_PROVIDERS.some((p) => {
    const key = raw.ai.keys[p.id]
    return key.length > 0 && !isEncrypted(key)
  })
  if (isEncryptionAvailable() && hasPlaintext) {
    console.info('[settings-store] migrating stored API keys to encrypted-at-rest')
    const keys = { ...raw.ai.keys }
    for (const p of AI_PROVIDERS) keys[p.id] = encryptString(keys[p.id])
    raw = { ...raw, ai: { ...raw.ai, keys } }
    writeRaw(raw)
  }

  const keys = emptyKeys()
  undecryptable = new Set()
  for (const provider of AI_PROVIDERS) {
    const stored = raw.ai.keys[provider.id]
    if (!stored) continue
    const plain = decryptString(stored)
    if (plain === null) {
      undecryptable.add(provider.id)
      console.error(
        `[settings-store] the stored ${provider.label} API key cannot be decrypted on this ` +
          'machine — the ciphertext is kept on disk untouched. Re-enter it in Settings.'
      )
    } else {
      keys[provider.id] = plain
    }
  }

  decryptedCache = { version: 2, ai: { ...raw.ai, keys } }
  return decryptedCache
}

/**
 * Persist, sealing each key. A key we could not unseal reads back as '' — writing
 * that would destroy it — so the untouched ciphertext is kept unless the user
 * typed a replacement. Connection secrets learned this the hard way.
 */
function write(state: StoreShape): void {
  const stored = readRaw().ai.keys
  const keys = emptyKeys()
  for (const provider of AI_PROVIDERS) {
    const next = state.ai.keys[provider.id]
    keys[provider.id] = next
      ? encryptString(next)
      : undecryptable.has(provider.id)
        ? stored[provider.id]
        : ''
  }
  writeRaw({ version: 2, ai: { ...state.ai, keys } })
}

export interface ActiveAiSettings {
  provider: AiProviderId
  apiKey: string
  model: AiModelId
}

/** The provider the user picked, with its own key and model. */
export function getAiSettings(): ActiveAiSettings {
  const { ai } = read()
  return { provider: ai.provider, apiKey: ai.keys[ai.provider], model: ai.models[ai.provider] }
}

/** One provider's key and model, whether or not it is the active one. */
export function getProviderSettings(provider: AiProviderId): { apiKey: string; model: AiModelId } {
  const { ai } = read()
  return { apiKey: ai.keys[provider], model: ai.models[provider] }
}

export function getActiveProvider(): AiProviderId {
  return read().ai.provider
}

/**
 * The last four characters of a saved key, for showing *which* key is set
 * without handing the key itself to the renderer. Null when none is set.
 */
export function getAiKeyHint(provider: AiProviderId): string | null {
  const key = read().ai.keys[provider]
  if (!key) return null
  return key.length <= 4 ? '…' : `…${key.slice(-4)}`
}

export function isAiKeyUnreadable(provider: AiProviderId): boolean {
  read()
  return undecryptable.has(provider)
}

export function setAiProvider(provider: string): AiProviderId {
  if (!isAiProviderId(provider)) throw new Error(`Unknown provider: ${provider}`)
  const state = read()
  write({ ...state, ai: { ...state.ai, provider } })
  return provider
}

export function setAiApiKey(provider: string, apiKey: string): void {
  if (!isAiProviderId(provider)) throw new Error(`Unknown provider: ${provider}`)
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error('The API key is empty.')
  const state = read()
  undecryptable.delete(provider)
  write({ ...state, ai: { ...state.ai, keys: { ...state.ai.keys, [provider]: trimmed } } })
}

export function clearAiApiKey(provider: string): void {
  if (!isAiProviderId(provider)) throw new Error(`Unknown provider: ${provider}`)
  const state = read()
  // Cleared on purpose: the preserve-the-ciphertext rule must not resurrect it.
  undecryptable.delete(provider)
  write({ ...state, ai: { ...state.ai, keys: { ...state.ai.keys, [provider]: '' } } })
}

export function setAiModel(provider: string, model: string): AiModelId {
  if (!isAiProviderId(provider)) throw new Error(`Unknown provider: ${provider}`)
  if (!isAiModelId(provider, model)) {
    throw new Error(`Unknown model for ${provider}: ${model}`)
  }
  const state = read()
  write({ ...state, ai: { ...state.ai, models: { ...state.ai.models, [provider]: model } } })
  return model
}

/** Test seam — drops the caches so a fresh file is re-read. */
export function resetSettingsCache(): void {
  rawCache = null
  decryptedCache = null
  undecryptable = new Set()
}
