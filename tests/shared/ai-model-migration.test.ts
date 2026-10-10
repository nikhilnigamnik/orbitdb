import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDERS,
  RENAMED_AI_MODEL_IDS,
  SUCCEEDED_AI_MODEL_IDS,
  currentAiModelId,
  isAiModelId,
  migrateAiModelId
} from '../../src/shared/ai-models'
import { isPricedModel } from '../../src/shared/ai-pricing'

describe('model id migration', () => {
  it('follows a rename and then the retirement that came after it', () => {
    expect(migrateAiModelId('google/gemini-3.6-flash')).toBe('google-ai-studio/gemini-3.8-flash')
    expect(migrateAiModelId('gemini-2.5-flash-lite')).toBe('gemini-3.5-flash-lite')
  })

  it('leaves a current id alone', () => {
    expect(migrateAiModelId('claude-sonnet-5-5')).toBe('claude-sonnet-5-5')
  })

  it('lands every successor on a model the picker still offers', () => {
    for (const [retired, successor] of Object.entries(SUCCEEDED_AI_MODEL_IDS)) {
      const provider = AI_PROVIDERS.find((p) => p.models.some((m) => m.id === successor))
      expect(provider, `${retired} -> ${successor} names no listed model`).toBeDefined()
      expect(isAiModelId(provider!.id, retired), `${retired} is still listed`).toBe(false)
    }
  })

  it('keeps pricing on the retired model rather than its successor', () => {
    // A retired model keeps its own rate; usage recorded under it must not be
    // repriced at whatever its successor costs.
    for (const [old, renamed] of Object.entries(RENAMED_AI_MODEL_IDS)) {
      expect(currentAiModelId(old)).toBe(renamed)
      expect(isPricedModel(old)).toBe(true)
    }
    expect(currentAiModelId('google-ai-studio/gemini-3.6-flash')).toBe(
      'google-ai-studio/gemini-3.6-flash'
    )
  })
})
