import { beforeEach, describe, expect, it, vi } from 'vitest'

/** What each `createUnified` call was configured with, in construction order. */
const unified = vi.hoisted(() => ({ configs: [] as Record<string, unknown>[] }))
const routed = vi.hoisted(() => ({ wrapped: [] as unknown[] }))

vi.mock('ai-gateway-provider/providers/unified', () => ({
  createUnified: (config: Record<string, unknown> = {}) => {
    const index = unified.configs.push(config) - 1
    return (slug: string) => ({ id: slug, builtBy: index })
  }
}))

vi.mock('ai-gateway-provider', () => ({
  createAiGateway: () => (model: unknown) => {
    routed.wrapped.push(model)
    return model
  }
}))

type Gateway = typeof import('../../../src/main/ai/gateway')

const settings = { accountId: 'acct', gatewayId: 'gw' }

let gateway: Gateway

beforeEach(async () => {
  unified.configs = []
  routed.wrapped = []
  vi.resetModules()
  gateway = await import('../../../src/main/ai/gateway')
})

/** The config `model` was ultimately built from. */
function configFor(model: string): Record<string, unknown> {
  const built = gateway.buildGatewayModel(settings, 'token', model) as unknown as {
    builtBy: number
  }
  return unified.configs[built.builtBy]
}

describe('which gateway upstreams get a native schema', () => {
  it('gives one to OpenAI', () => {
    expect(gateway.gatewaySupportsStructuredOutput('openai/gpt-5.6-luna')).toBe(true)
    expect(configFor('openai/gpt-5.6-luna').supportsStructuredOutputs).toBe(true)
  })

  it('withholds it from Anthropic, whose answer comes back as a tool call', () => {
    // `content: null` + `tool_calls` is not text, so Output.object reads nothing.
    expect(gateway.gatewaySupportsStructuredOutput('anthropic/claude-sonnet-5')).toBe(false)
    expect(configFor('anthropic/claude-sonnet-5').supportsStructuredOutputs).toBeUndefined()
  })

  it('withholds it from Google', () => {
    expect(gateway.gatewaySupportsStructuredOutput('google-ai-studio/gemini-3.6-flash')).toBe(false)
  })

  it('matches on the prefix, not a substring of the model half', () => {
    expect(gateway.gatewaySupportsStructuredOutput('anthropic/claude-openai/x')).toBe(false)
  })
})

describe('the outgoing request body', () => {
  it('forces strict off, which a schema with an optional field needs', () => {
    // OpenAI strict mode requires every property in `required`; filter-table
    // omits `value` for `is null`, and a strict request is a 400 rather than a
    // relaxed one.
    const config = configFor('openai/gpt-5.6-luna')
    const transform = config.transformRequestBody as (
      args: Record<string, unknown>
    ) => Record<string, unknown>

    const body = transform({
      response_format: { type: 'json_schema', json_schema: { strict: true, schema: {} } }
    })

    expect((body.response_format as { json_schema: { strict: boolean } }).json_schema.strict).toBe(
      false
    )
  })

  it('leaves a body carrying no schema alone', () => {
    const config = configFor('openai/gpt-5.6-luna')
    const transform = config.transformRequestBody as (
      args: Record<string, unknown>
    ) => Record<string, unknown>

    expect(transform({ model: 'x' })).toEqual({ model: 'x' })
    expect(transform({ response_format: { type: 'json_object' } })).toEqual({
      response_format: { type: 'json_object' }
    })
  })
})

describe('a half-configured gateway', () => {
  it('refuses without an account id', () => {
    expect(() => gateway.buildGatewayModel({ accountId: '', gatewayId: 'gw' }, 't', 'm')).toThrow(
      /account id/
    )
  })

  it('refuses without a gateway id', () => {
    expect(() => gateway.buildGatewayModel({ accountId: 'a', gatewayId: '' }, 't', 'm')).toThrow(
      /gateway id/
    )
  })
})
