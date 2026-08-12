import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { APICallError, generateText, Output } from 'ai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { z } from 'zod'
import {
  MISSING_AI_KEY_MESSAGE,
  isAiProviderId,
  type AiFeature,
  type AiModelId,
  type AiProviderId
} from '../../shared/ai-models'
import {
  getAiSettings,
  getGatewaySettings,
  getProviderSettings,
  type GatewaySettings
} from '../store/settings-store'
import { recordUsage } from '../store/usage-store'
import { AI_REQUEST_TIMEOUT_MS } from './config'
import { buildGatewayModel } from './gateway'

export class MissingApiKeyError extends Error {
  constructor() {
    super(MISSING_AI_KEY_MESSAGE)
    this.name = 'MissingApiKeyError'
  }
}

/**
 * One line per provider. Each SDK takes the same shape - a factory that closes
 * over the key and returns a model builder - so adding a provider is a row here
 * plus a row in `AI_PROVIDERS`.
 */
const FACTORY: Record<AiProviderId, (apiKey: string) => (model: string) => LanguageModelV3> = {
  anthropic: (apiKey) => createAnthropic({ apiKey }),
  openai: (apiKey) => createOpenAI({ apiKey }),
  google: (apiKey) => createGoogleGenerativeAI({ apiKey }),
  // Cloudflare is reached through its own gateway rather than a vendor SDK, and
  // needs two ids the others do not - hence the special case in `buildModel`
  // instead of a row that would have to pretend it fits this shape.
  cloudflare: () => {
    throw new Error('The Cloudflare provider is built by buildModel, not FACTORY.')
  }
}

/**
 * Every path that needs a model goes through here, so a provider cannot be
 * honoured in one place and forgotten in another.
 *
 * Cloudflare's token is optional - an unauthenticated gateway is a valid setup -
 * so the missing-key check is per provider rather than up front.
 */
function buildModel(
  provider: AiProviderId,
  apiKey: string,
  model: AiModelId,
  gateway: GatewaySettings
): LanguageModelV3 {
  if (provider === 'cloudflare') return buildGatewayModel(gateway, apiKey, model)
  if (!apiKey) throw new MissingApiKeyError()
  return FACTORY[provider](apiKey)(model)
}

// The credential is runtime state now, not build-time state, so the model can no
// longer be a module constant: it has to be re-read after the user saves a key.
// Rebuilt only when the provider, key, model or gateway actually changes - hence
// the gateway in the cache key, or turning it on would keep serving the direct
// model until the next key edit.
let cached: {
  provider: AiProviderId
  apiKey: string
  model: AiModelId
  gateway: string
  instance: LanguageModelV3
} | null = null

/**
 * Drops the built provider - and with it the copy of the key it closed over.
 * Called when the key changes so a removed key does not linger in memory.
 */
export function resetModelCache(): void {
  cached = null
}

/**
 * A model for a *named* provider, using that provider's own saved key. `getModel`
 * is the active one; this is for testing a key on a card you are not using yet.
 * Not cached - it is pressed by hand, once.
 */
export function buildModelFor(provider: string): LanguageModelV3 {
  if (!isAiProviderId(provider)) throw new Error(`Unknown provider: ${provider}`)
  const { apiKey, model } = getProviderSettings(provider)
  return buildModel(provider, apiKey, model, getGatewaySettings())
}

/** Identity of the gateway ids, for the model cache: renaming a gateway has to
 * rebuild the client rather than keep addressing the old one. */
function gatewayCacheKey(gateway: GatewaySettings): string {
  return `${gateway.accountId}|${gateway.gatewayId}`
}

export function getModel(): LanguageModelV3 {
  const { provider, apiKey, model } = getAiSettings()
  const gateway = getGatewaySettings()
  const gatewayKey = gatewayCacheKey(gateway)
  if (
    cached &&
    cached.provider === provider &&
    cached.apiKey === apiKey &&
    cached.model === model &&
    cached.gateway === gatewayKey
  ) {
    return cached.instance
  }
  const instance = buildModel(provider, apiKey, model, gateway)
  cached = { provider, apiKey, model, gateway: gatewayKey, instance }
  return instance
}

type TextArgs = Omit<Parameters<typeof generateText>[0], 'model'>

/** Narrower than the SDK's own args, and enough for everything this app asks for. */

/**
 * The only way this app talks to a model. Everything goes through here so usage is
 * recorded once, in one place - a second path would silently under-count.
 */
export async function runText(feature: AiFeature, args: TextArgs, provider?: string) {
  const model = provider ? buildModelFor(provider) : getModel()
  const result = await generateText({ ...args, model } as Parameters<typeof generateText>[0])

  try {
    const active = provider ? getProviderSettings(provider as AiProviderId) : null
    const settings = getAiSettings()
    recordUsage({
      provider: (provider as AiProviderId) ?? settings.provider,
      model: active?.model ?? settings.model,
      feature,
      inputTokens: result.totalUsage.inputTokens ?? 0,
      outputTokens: result.totalUsage.outputTokens ?? 0
    })
  } catch (err) {
    // Bookkeeping must never cost the user the answer they were waiting for.
    console.error('[usage] failed to record token usage', err)
  }

  return result
}

// Strip ```sql / ```json fences some models add despite instructions.
export function stripFences(text: string): string {
  const fenced = text.match(/```(?:\w+)?\s*([\s\S]*?)```/i)
  return (fenced ? fenced[1] : text).trim()
}

// Pull the first JSON object/array out of a reply that may include a preamble
// (reasoning models like to prefix "Here's the JSON:" before the payload).
function extractJson(text: string): string {
  const objStart = text.indexOf('{')
  const arrStart = text.indexOf('[')
  if (objStart === -1 && arrStart === -1) return text
  const useArray = objStart === -1 || (arrStart !== -1 && arrStart < objStart)
  const start = useArray ? arrStart : objStart
  const end = text.lastIndexOf(useArray ? ']' : '}')
  return end > start ? text.slice(start, end + 1) : text
}

/**
 * Some failures mean "the model's answer was the wrong shape" - worth a second,
 * plainer attempt. Others mean the request never landed: a rejected key, a rate
 * limit, a timeout. Retrying those buys a second round-trip and, in the rate
 * limit's case, makes the thing it is retrying worse.
 */
function isWorthRetrying(err: unknown): boolean {
  if (APICallError.isInstance(err)) return false
  // AbortSignal.timeout - the model was too slow, and it will be again.
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return false
  }
  return true
}

/**
 * Structured output in two layers.
 *
 * 1. `generateText` + `Output.object` - the SDK's supported path as of v6, which
 *    deprecated `generateObject`. Every model offered in Settings reports
 *    `supportsStructuredOutput`, so the Anthropic provider sends a native
 *    `output_config.format` carrying the schema rather than asking in prose.
 * 2. A plain-text retry, parsed defensively. `Output.object` takes no repair
 *    hook, so salvaging a fenced or preamble-wrapped reply means asking again -
 *    which is why layer 1 failing for a *transport* reason must not land here.
 */
export async function generateJson<T>(opts: {
  feature: AiFeature
  schema: z.ZodType<T>
  system: string
  prompt: string
}): Promise<T> {
  // Kept so a shape failure that also fails on the retry is reported as itself
  // rather than as the retry's generic "invalid JSON".
  let structuredFailure: unknown
  try {
    const { output } = await runText(opts.feature, {
      system: opts.system,
      prompt: opts.prompt,
      output: Output.object({ schema: opts.schema }),
      abortSignal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS)
    })
    if (output != null) return output as T
  } catch (err) {
    if (!isWorthRetrying(err)) throw err
    structuredFailure = err
  }

  const { text } = await runText(opts.feature, {
    system: `${opts.system}\n\nRespond with raw JSON only - no prose, no markdown code fences.`,
    prompt: opts.prompt,
    abortSignal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS)
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(extractJson(stripFences(text)))
  } catch {
    // If the first attempt failed for a reason of its own, that is the useful
    // one to report.
    if (structuredFailure instanceof Error) throw structuredFailure
    throw new Error('The model returned invalid JSON. Try rephrasing your request.')
  }

  const result = opts.schema.safeParse(parsed)
  if (!result.success) {
    throw new Error('The model response did not match the expected shape. Try again.')
  }
  return result.data
}
