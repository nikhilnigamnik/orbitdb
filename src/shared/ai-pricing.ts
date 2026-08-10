/**
 * Published list prices for the models offered in Settings, in USD per million
 * tokens. Lives in `shared/` because main prices the usage rollup and the
 * renderer labels the result.
 *
 * Sourced from each vendor's own pricing page (checked 2026-08-10) - deliberately
 * not from a third-party aggregator, several of which disagree with the vendor by
 * a factor of two. **These are hardcoded and will drift.** Nothing in the app can
 * detect that, so the figures are always presented as an estimate.
 *
 * Rates are keyed by model id alone: the ids are distinct across all three
 * providers, and `isAiModelId` is what enforces the provider pairing.
 */

export interface TokenRate {
  /** USD per million input tokens. */
  input: number
  /** USD per million output tokens. */
  output: number
}

interface ModelPricing extends TokenRate {
  /**
   * A launch discount, applied to usage recorded on or before `through`
   * (a `yyyy-MM-dd` day key). Usage after that date prices at the standard rate.
   */
  promo?: TokenRate & { through: string }
}

/**
 * Where a vendor charges more above a context threshold (Gemini Pro doubles past
 * 200k), the sub-threshold rate is used: this app's prompts are capped well below
 * it by `MAX_SCHEMA_TABLES`. Long-context calls would cost more than shown.
 */
const PRICING: Record<string, ModelPricing> = {
  // Anthropic - platform.claude.com/docs/en/about-claude/models/overview
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': {
    input: 3,
    output: 15,
    promo: { input: 2, output: 10, through: '2026-08-31' }
  },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },

  // OpenAI - developers.openai.com/api/docs/pricing
  'gpt-5.6-sol': { input: 5, output: 30 },
  'gpt-5.6-terra': { input: 2, output: 12 },
  'gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'gpt-5.5': { input: 5, output: 30 },
  'gpt-5.2': { input: 1.75, output: 14 },
  'gpt-5.2-pro': { input: 21, output: 168 },
  'gpt-5-mini': { input: 0.25, output: 2 },

  // Google - ai.google.dev/gemini-api/docs/pricing
  'gemini-3.6-flash': { input: 1.5, output: 7.5 },
  'gemini-3.5-flash': { input: 1.5, output: 9 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.1-pro-preview': { input: 2, output: 12 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 }
}

/**
 * The rate in effect for `model` on `day` (a `yyyy-MM-dd` key), or null if the
 * model has no published rate here - a model added to the registry without a
 * pricing row, so its usage is counted but not costed.
 *
 * Day keys sort lexicographically, which is the whole comparison a promo needs.
 */
export function rateFor(model: string, day?: string): TokenRate | null {
  const pricing = PRICING[model]
  if (!pricing) return null
  const { promo } = pricing
  if (promo && day && day <= promo.through) return { input: promo.input, output: promo.output }
  return { input: pricing.input, output: pricing.output }
}

/** Cost in USD for one rollup row, or null when the model has no published rate. */
export function costOf(
  model: string,
  inputTokens: number,
  outputTokens: number,
  day?: string
): number | null {
  const rate = rateFor(model, day)
  if (!rate) return null
  return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output
}

export function isPricedModel(model: string): boolean {
  return model in PRICING
}

/**
 * Money, at a precision that matches the amount. A per-call cost is often a small
 * fraction of a cent, and rounding that to `$0.00` makes the column look broken -
 * so small amounts keep enough decimals to stay a number rather than a zero.
 */
export function formatCost(usd: number): string {
  if (usd === 0) return '$0'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}
