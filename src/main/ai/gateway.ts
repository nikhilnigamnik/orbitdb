import { createAiGateway } from 'ai-gateway-provider'
import { createUnified } from 'ai-gateway-provider/providers/unified'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import { INCOMPLETE_GATEWAY_MESSAGE } from '../../shared/ai-models'
import type { GatewaySettings } from '../store/settings-store'

/**
 * The unified endpoint is a plain OpenAI-compatible provider whose base URL the
 * gateway wrapper rewrites (`…/v1/compat` is a marker, not a destination). Built
 * once - it holds no credential, so there is nothing per-call about it.
 */
const unified = createUnified()

/**
 * A model on Cloudflare's unified endpoint, addressed by the catalog slug that
 * *is* the model id here - `anthropic/claude-sonnet-5`, `google/gemini-3.6-flash`.
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
  return aigateway(unified(model))
}
