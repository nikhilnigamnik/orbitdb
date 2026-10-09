/**
 * The providers and models offered in Settings. Lives in `shared/` because both
 * sides need it: the renderer builds the pickers from it, and main validates
 * against it before anything reaches a provider SDK.
 */
export const AI_PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    keyPlaceholder: 'sk-ant-…',
    models: [
      { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', hint: 'Balanced - the default' },
      { id: 'claude-haiku-5-5', label: 'Haiku 5.5', hint: 'Fastest and cheapest' },
      { id: 'claude-opus-5-5', label: 'Opus 5.5', hint: 'Strongest on complex SQL' },
      { id: 'claude-fable-5-1', label: 'Fable 5.1', hint: 'Most capable - priciest' }
    ]
  },
  {
    id: 'openai',
    label: 'OpenAI',
    keyPlaceholder: 'sk-…',
    models: [
      { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', hint: 'Balanced - the default' },
      { id: 'gpt-6-luna', label: 'GPT-6 Luna', hint: 'Fastest and cheapest' },
      { id: 'gpt-6-astra', label: 'GPT-6 Astra', hint: 'Most capable - priciest' }
    ]
  },
  {
    id: 'google',
    label: 'Google',
    keyPlaceholder: 'AIza…',
    models: [
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', hint: 'Balanced - the default' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', hint: 'Fast and cheap' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', hint: 'Strongest - preview model' }
    ]
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare AI Gateway',
    keyPlaceholder: 'Cloudflare API token',
    /**
     * `provider/model`, where the prefix is Cloudflare's own and the model part
     * is **the vendor's own id**.
     *
     * That second half is load-bearing and was learned the hard way. Cloudflare's
     * catalog lists `anthropic/claude-haiku-4.5`, but with BYOK the gateway
     * forwards everything after the slash straight to the vendor, and Anthropic
     * has no such model - the real id is `claude-haiku-4-5-20251001`. Catalog
     * names only apply when Unified Billing is supplying the credential. Vendor
     * ids work under both, so they are what this list uses.
     *
     * The prefix half bit too. Google's is `google-ai-studio`; a plain `google`
     * is refused by the endpoint with `AiGatewayError 2008 Invalid provider`,
     * which made both Gemini rows here unusable.
     */
    models: [
      { id: 'anthropic/claude-sonnet-5-5', label: 'Sonnet 5.5', hint: 'Anthropic - the default' },
      { id: 'anthropic/claude-haiku-5-5', label: 'Haiku 5.5', hint: 'Anthropic - fast and cheap' },
      { id: 'anthropic/claude-opus-5-5', label: 'Opus 5.5', hint: 'Anthropic - strongest' },
      { id: 'anthropic/claude-fable-5-1', label: 'Fable 5.1', hint: 'Anthropic - most capable' },
      { id: 'openai/gpt-6.1-sol', label: 'GPT-6.1 Sol', hint: 'OpenAI - balanced' },
      { id: 'openai/gpt-6-luna', label: 'GPT-6 Luna', hint: 'OpenAI - fast and cheap' },
      { id: 'openai/gpt-6-astra', label: 'GPT-6 Astra', hint: 'OpenAI - most capable' },
      {
        id: 'google-ai-studio/gemini-3.8-flash',
        label: 'Gemini 3.8 Flash',
        hint: 'Google - balanced'
      },
      {
        id: 'google-ai-studio/gemini-3.5-flash-lite',
        label: 'Gemini 3.5 Flash-Lite',
        hint: 'Google - fast and cheap'
      },
      {
        id: 'google-ai-studio/gemini-3.1-pro-preview',
        label: 'Gemini 3.1 Pro',
        hint: 'Google - strongest, preview'
      }
    ]
  }
] as const

/**
 * Providers needing more than a key. Cloudflare is the only one: its account and
 * gateway ids go in the URL, and unlike the token they are identifiers rather
 * than secrets, so they are stored and shown in the clear.
 */
export function needsGatewayIds(provider: AiProviderId): boolean {
  return provider === 'cloudflare'
}

export type AiProviderId = (typeof AI_PROVIDERS)[number]['id']
export type AiModelId = (typeof AI_PROVIDERS)[number]['models'][number]['id']

export const DEFAULT_AI_PROVIDER: AiProviderId = 'anthropic'

/** What a model call was for. Recorded with its token usage. */
export const AI_FEATURES = [
  { id: 'generate-sql', label: 'Generate SQL' },
  { id: 'filter-table', label: 'AI filter' },
  { id: 'explain-table', label: 'Explain table' },
  { id: 'suggest-indexes', label: 'Suggest indexes' },
  { id: 'generate-seed', label: 'Seed data' },
  { id: 'test-key', label: 'Key test' }
] as const

export type AiFeature = (typeof AI_FEATURES)[number]['id']

export function aiFeatureLabel(id: string): string {
  return AI_FEATURES.find((f) => f.id === id)?.label ?? id
}

/**
 * Thrown by main when the chosen provider has no key, and matched exactly by the
 * renderer to swap the raw error for a prompt to open Settings. It lives here so
 * neither side is matching on a string the other might quietly reword.
 */
export const MISSING_AI_KEY_MESSAGE =
  'No API key for the selected AI provider. Add one in Settings to use the AI features.'

/** Matched the same way as `MISSING_AI_KEY_MESSAGE`, for a half-filled gateway. */
export const INCOMPLETE_GATEWAY_MESSAGE =
  'The Cloudflare AI Gateway needs an account id and a gateway id. Add them in Settings.'

/**
 * True for the errors that mean "finish setting up AI in Settings" rather than
 * "something broke". The one place both messages are matched, so a third cannot
 * be added to main without the renderer learning about it here.
 */
export function isAiSetupMessage(message: string | null | undefined): boolean {
  return message === MISSING_AI_KEY_MESSAGE || message === INCOMPLETE_GATEWAY_MESSAGE
}

export function aiProvider(id: AiProviderId): (typeof AI_PROVIDERS)[number] {
  const found = AI_PROVIDERS.find((provider) => provider.id === id)
  if (!found) throw new Error(`Unknown AI provider: ${id}`)
  return found
}

export function isAiProviderId(value: unknown): value is AiProviderId {
  return AI_PROVIDERS.some((provider) => provider.id === value)
}

/**
 * Guards the IPC boundary, and pairs the model with its provider: `gpt-5.2` is a
 * real model but not a real *Anthropic* model, and sending it there would come
 * back as an opaque 404.
 */
/**
 * Model ids that were renamed, and what they are called now.
 *
 * A model *dropped* from the registry falls back to the provider's default, and
 * that is right - it no longer exists. A model that was only *renamed* still
 * does, so the same fallback silently moves the user onto a different vendor's
 * model and orphans every usage row already recorded under the old name. The
 * gateway's Gemini ids were `google/…` until the prefix turned out to have to be
 * `google-ai-studio/…`.
 *
 * Read when settings.json is loaded and when a usage row is priced.
 */
export const RENAMED_AI_MODEL_IDS: Record<string, string> = {
  'google/gemini-3.6-flash': 'google-ai-studio/gemini-3.6-flash',
  'google/gemini-2.5-flash': 'google-ai-studio/gemini-2.5-flash'
}

/** The id a model goes by now, following at most one rename. */
export function currentAiModelId(value: string): string {
  return RENAMED_AI_MODEL_IDS[value] ?? value
}

export function isAiModelId(provider: AiProviderId, value: unknown): value is AiModelId {
  return isAiProviderId(provider) && aiProvider(provider).models.some((m) => m.id === value)
}

/** The short name for a model id - `claude-haiku-4-5-20251001` reads as noise. */
export function aiModelLabel(provider: string, id: string): string {
  if (!isAiProviderId(provider)) return id
  return aiProvider(provider).models.find((m) => m.id === id)?.label ?? id
}

export function defaultModelFor(provider: AiProviderId): AiModelId {
  return aiProvider(provider).models[0].id
}
