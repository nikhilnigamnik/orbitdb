import { describe, expect, it } from 'vitest'
import { costOf, formatCost, isPricedModel, rateFor } from '../../src/shared/ai-pricing'
import { AI_PROVIDERS } from '../../src/shared/ai-models'

describe('the rate for a model', () => {
  it('prices a model at its published list rate', () => {
    expect(rateFor('claude-opus-5')).toEqual({ input: 5, output: 25 })
    expect(rateFor('gpt-5.6-terra')).toEqual({ input: 2, output: 12 })
    expect(rateFor('gemini-3.6-flash')).toEqual({ input: 1.5, output: 7.5 })
  })

  it('applies a launch discount to usage inside its window', () => {
    // Sonnet 5 lists at $3/$15 but runs at $2/$10 through 2026-08-31.
    expect(rateFor('claude-sonnet-5', '2026-08-10')).toEqual({ input: 2, output: 10 })
    expect(rateFor('claude-sonnet-5', '2026-08-31')).toEqual({ input: 2, output: 10 })
  })

  it('reverts to the standard rate the day the discount ends', () => {
    expect(rateFor('claude-sonnet-5', '2026-09-01')).toEqual({ input: 3, output: 15 })
  })

  it('falls back to the standard rate when no day is given', () => {
    // Better to overstate than to quietly bill a promo that may have expired.
    expect(rateFor('claude-sonnet-5')).toEqual({ input: 3, output: 15 })
  })

  it('returns null for a model it has no rate for', () => {
    expect(rateFor('some-model-added-later')).toBeNull()
    expect(isPricedModel('some-model-added-later')).toBe(false)
  })
})

describe('costing a rollup row', () => {
  it('charges input and output at their separate rates', () => {
    // 1M input at $5 + 1M output at $25.
    expect(costOf('claude-opus-5', 1_000_000, 1_000_000)).toBeCloseTo(30, 10)
  })

  it('scales below a million tokens', () => {
    expect(costOf('claude-opus-5', 100_000, 10_000)).toBeCloseTo(0.5 + 0.25, 10)
  })

  it('prices at the rate in effect on the day of the usage', () => {
    const promo = costOf('claude-sonnet-5', 1_000_000, 0, '2026-08-10')
    const standard = costOf('claude-sonnet-5', 1_000_000, 0, '2026-09-01')

    expect(promo).toBeCloseTo(2, 10)
    expect(standard).toBeCloseTo(3, 10)
  })

  it('is null rather than zero for an unpriced model', () => {
    // Zero would silently understate the total; null lets the caller say so.
    expect(costOf('some-model-added-later', 1_000_000, 1_000_000)).toBeNull()
  })

  it('costs nothing for no tokens', () => {
    expect(costOf('claude-opus-5', 0, 0)).toBe(0)
  })
})

describe('every model offered in Settings', () => {
  it('has a published rate', () => {
    // A model in the picker with no rate row is counted but never costed, which
    // shows up as a total that is quietly short.
    const unpriced = AI_PROVIDERS.flatMap((p) => p.models)
      .map((m) => m.id)
      .filter((id) => !isPricedModel(id))

    expect(unpriced).toEqual([])
  })
})

describe('formatting money', () => {
  it('keeps enough decimals that a fraction of a cent is still a number', () => {
    // $0.00 in the column reads as broken rather than cheap.
    expect(formatCost(0.00042)).toBe('$0.0004')
    expect(formatCost(0.154)).toBe('$0.154')
  })

  it('settles to cents once there is a dollar to show', () => {
    expect(formatCost(12.3456)).toBe('$12.35')
  })

  it('shows exact zero plainly', () => {
    expect(formatCost(0)).toBe('$0')
  })
})
