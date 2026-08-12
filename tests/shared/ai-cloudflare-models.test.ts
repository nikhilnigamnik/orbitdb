import { describe, expect, it } from 'vitest'
import { AI_PROVIDERS, aiProvider, type AiProviderId } from '../../src/shared/ai-models'
import { isPricedModel } from '../../src/shared/ai-pricing'

const cloudflare = aiProvider('cloudflare')

/** Which of our own providers each Cloudflare prefix corresponds to. */
const PREFIX_OWNER: Record<string, AiProviderId> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google'
}

describe('the Cloudflare model list', () => {
  it('names every model as provider/model', () => {
    for (const model of cloudflare.models) {
      expect(model.id, model.id).toMatch(/^[a-z-]+\/.+$/)
    }
  })

  it('uses a prefix the unified endpoint knows', () => {
    // `google`, not `google-ai-studio` - the latter is the provider-native route.
    for (const model of cloudflare.models) {
      const prefix = model.id.slice(0, model.id.indexOf('/'))
      expect(PREFIX_OWNER[prefix], `unknown gateway prefix: ${prefix}`).toBeTruthy()
    }
  })

  it('carries the vendor’s own model id, not Cloudflare’s catalog name', () => {
    // The bug this pins: the catalog lists `anthropic/claude-haiku-4.5`, but with
    // BYOK the gateway forwards the part after the slash straight to the vendor,
    // and Anthropic only answers to `claude-haiku-4-5-20251001`. A vendor id is
    // correct under both billing modes; a catalog name is correct under one.
    for (const model of cloudflare.models) {
      const [prefix, ...rest] = model.id.split('/')
      const bare = rest.join('/')
      const owner = aiProvider(PREFIX_OWNER[prefix])
      expect(
        owner.models.some((m) => m.id === bare),
        `${model.id} is not a model ${owner.label} actually offers`
      ).toBe(true)
    }
  })

  it('has a price for every entry, so no call looks free', () => {
    for (const model of cloudflare.models) {
      expect(isPricedModel(model.id), model.id).toBe(true)
    }
  })

  it('prices identically to calling the vendor directly', () => {
    // Unified Billing passes inference through at the vendor's rate; the 5% is
    // charged when credits are bought, so it cannot be priced per token.
    for (const model of cloudflare.models) {
      const bare = model.id.slice(model.id.indexOf('/') + 1)
      expect(isPricedModel(bare), bare).toBe(true)
    }
  })

  it('is the only provider whose ids are namespaced', () => {
    for (const provider of AI_PROVIDERS) {
      if (provider.id === 'cloudflare') continue
      for (const model of provider.models) {
        expect(model.id.includes('/'), `${provider.id}/${model.id}`).toBe(false)
      }
    }
  })
})
