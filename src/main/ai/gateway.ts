import { createAiGateway } from 'ai-gateway-provider'
import { createUnified } from 'ai-gateway-provider/providers/unified'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import { INCOMPLETE_GATEWAY_MESSAGE } from '../../shared/ai-models'
import type { GatewaySettings } from '../store/settings-store'

/**
 * Which upstreams answer a native `response_format: json_schema` on the unified
 * endpoint in a way the SDK can read back. Only OpenAI does, and why the others
 * do not is the load-bearing part.
 *
 * The gateway translates the schema into whatever the vendor speaks. For
 * Anthropic that is a *tool call*: the reply arrives with `content: null` and
 * the payload in `tool_calls`, which `Output.object` - which reads text - sees
 * as no output at all. Asking for it there is strictly worse than not asking,
 * so those models take the plain-text path in `generateJson` instead.
 */
const NATIVE_STRUCTURED_OUTPUT_PREFIXES = ['openai/']

export function gatewaySupportsStructuredOutput(model: string): boolean {
  return NATIVE_STRUCTURED_OUTPUT_PREFIXES.some((prefix) => model.startsWith(prefix))
}

/** The `json_schema` half of an outgoing OpenAI-compatible request body. */
interface JsonSchemaResponseFormat {
  type?: string
  json_schema?: { strict?: boolean }
}

/**
 * Strict mode requires every property to appear in `required`, and several
 * schemas here have optional fields on purpose - `filter-table` omits `value`
 * for `is null`. OpenAI rejects those with a 400 rather than relaxing, so strict
 * is turned off in the body on the way out.
 *
 * Done here rather than through `providerOptions` so that every gateway quirk
 * stays in this file: `generateJson` should not have to know that the model it
 * was handed happens to be a gateway one.
 */
function relaxStrictSchema(args: Record<string, unknown>): Record<string, unknown> {
  const format = args.response_format as JsonSchemaResponseFormat | undefined
  if (format?.type === 'json_schema' && format.json_schema) format.json_schema.strict = false
  return args
}

/**
 * Two providers, not one. `createUnified` defaults `supportsStructuredOutputs`
 * to false, which silently downgrades a schema request to `{type:'json_object'}`
 * - and OpenAI then rejects *that* with "messages must contain the word 'json'",
 * which is an `APICallError` and so is never retried. Every AI feature on an
 * `openai/*` gateway model failed on it.
 *
 * Both hold no credential, so there is nothing per-call about either.
 */
const structuredUnified = createUnified({
  supportsStructuredOutputs: true,
  transformRequestBody: relaxStrictSchema
})
const plainUnified = createUnified()

/**
 * A model on Cloudflare's unified endpoint, addressed by the catalog slug that
 * *is* the model id here - `anthropic/claude-sonnet-5`,
 * `google-ai-studio/gemini-3.6-flash`.
 *
 * No provider SDK is involved: Cloudflare supplies the upstream credential from
 * its own stored keys (BYOK) or Unified Billing credits, and the only key this
 * app sends is the gateway token.
 */
export function buildGatewayModel(
  gateway: GatewaySettings,
  token: string,
  model: string
): LanguageModelV3 {
  if (!gateway.accountId || !gateway.gatewayId) throw new Error(INCOMPLETE_GATEWAY_MESSAGE)

  const aigateway = createAiGateway({
    accountId: gateway.accountId,
    gateway: gateway.gatewayId,
    // Sent as `cf-aig-authorization`, and on this endpoint it is the credential:
    // it is what tells Cloudflare whose stored provider keys or Unified Billing
    // credits to spend. Left undefined when empty rather than rejected, because
    // an unauthenticated gateway fronting a provider key is a shape that works -
    // just not the one this app configures.
    apiKey: token || undefined
  })
  const unified = gatewaySupportsStructuredOutput(model) ? structuredUnified : plainUnified
  return aigateway(unified(model))
}
