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
      { id: 'claude-sonnet-5', label: 'Sonnet 5', hint: 'Balanced - the default' },
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', hint: 'Fastest and cheapest' },
      { id: 'claude-opus-5', label: 'Opus 5', hint: 'Strongest on complex SQL' }
    ]
  },
  {
    id: 'openai',
    label: 'OpenAI',
    keyPlaceholder: 'sk-…',
    models: [
      { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', hint: 'Balanced - the default' },
      { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', hint: 'Fastest and cheapest' },
      { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', hint: 'Strongest on complex SQL' },
      { id: 'gpt-5.5', label: 'GPT-5.5', hint: 'Previous flagship' },
      { id: 'gpt-5.2', label: 'GPT-5.2', hint: 'Older, still capable' },
      { id: 'gpt-5.2-pro', label: 'GPT-5.2 Pro', hint: 'Older reasoning tier - costly' },
      { id: 'gpt-5-mini', label: 'GPT-5 mini', hint: 'Older, very cheap' }
    ]
  },
  {
    id: 'google',
    label: 'Google',
    keyPlaceholder: 'AIza…',
    models: [
      { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', hint: 'Balanced - the default' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', hint: 'Fast and cheap' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', hint: 'Strongest - preview model' },
      { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', hint: 'Previous Flash' },
      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', hint: 'Older, cheaper still' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', hint: 'Older reasoning tier' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', hint: 'Older, widely available' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', hint: 'Cheapest offered' }
    ]
  }
] as const

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
