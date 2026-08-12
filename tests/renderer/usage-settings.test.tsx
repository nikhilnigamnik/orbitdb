// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UsageSettings } from '@renderer/features/settings/components/usage-settings'
import { ToastProvider } from '@renderer/components/ui/toast'
import type { UsageSummary, UsageWindow } from '@renderer/types'

afterEach(cleanup)

function ok<T>(data: T) {
  return Promise.resolve({ success: true as const, data })
}

function emptyWindow(): UsageWindow {
  return { calls: 0, input: 0, output: 0, cost: 0, unpricedCalls: 0, byModel: [], byFeature: [] }
}

const BUSY: UsageSummary = {
  today: {
    calls: 2,
    input: 3000,
    output: 400,
    cost: 0.01,
    unpricedCalls: 0,
    byModel: [
      {
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        feature: '',
        calls: 2,
        input: 3000,
        output: 400,
        cost: 0.01
      }
    ],
    byFeature: [
      {
        provider: '',
        model: '',
        feature: 'generate-sql',
        calls: 2,
        input: 3000,
        output: 400,
        cost: 0.01
      }
    ]
  },
  last30: {
    calls: 12,
    input: 45000,
    output: 6100,
    cost: 0.154,
    unpricedCalls: 0,
    byModel: [
      {
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        feature: '',
        calls: 9,
        input: 40000,
        output: 5000,
        cost: 0.13
      },
      {
        provider: 'openai',
        model: 'gpt-5.2',
        feature: '',
        calls: 3,
        input: 5000,
        output: 1100,
        cost: 0.024
      }
    ],
    byFeature: [
      {
        provider: '',
        model: '',
        feature: 'generate-seed',
        calls: 4,
        input: 30000,
        output: 4000,
        cost: 0.1
      },
      {
        provider: '',
        model: '',
        feature: 'generate-sql',
        calls: 8,
        input: 15000,
        output: 2100,
        cost: 0.054
      }
    ]
  },
  allTime: {
    calls: 12,
    input: 45000,
    output: 6100,
    cost: 0.154,
    unpricedCalls: 0,
    byModel: [],
    byFeature: []
  },
  retentionDays: 90
}

const EMPTY: UsageSummary = {
  today: emptyWindow(),
  last30: emptyWindow(),
  allTime: emptyWindow(),
  retentionDays: 90
}

function setup(summary: UsageSummary, overrides: Record<string, unknown> = {}) {
  const api = {
    summary: vi.fn(() => ok(summary)),
    clear: vi.fn(() => ok(undefined)),
    ...overrides
  }
  Object.assign(window, { api: { usage: api } })
  render(
    <ToastProvider>
      <UsageSettings />
    </ToastProvider>
  )
  return { api }
}

describe('what is shown', () => {
  it('opens on the thirty-day window, which is the useful default', async () => {
    setup(BUSY)
    expect(await screen.findByText(/12 calls/)).toBeTruthy()
  })

  it('breaks usage down by model, naming the provider too', async () => {
    // Sonnet 5 and GPT-5.2 are different bills.
    setup(BUSY)

    expect(await screen.findByText('Sonnet 5')).toBeTruthy()
    expect(screen.getByText('GPT-5.2')).toBeTruthy()
    expect(screen.getByText('OpenAI')).toBeTruthy()
  })

  it('shows the short model name, keeping the exact id on hover', async () => {
    // claude-haiku-4-5-20251001 in a table column is noise; the dated id still
    // matters when reconciling against a provider's own dashboard.
    setup({
      ...BUSY,
      last30: {
        ...BUSY.last30,
        byModel: [
          {
            provider: 'anthropic',
            model: 'claude-haiku-4-5-20251001',
            feature: '',
            calls: 3,
            input: 2610,
            output: 515,
            cost: 0.005
          }
        ]
      }
    })

    const label = await screen.findByText('Haiku 4.5')
    expect(label.closest('[title]')?.getAttribute('title')).toBe('claude-haiku-4-5-20251001')
  })

  it('breaks it down by feature, under readable names', async () => {
    setup(BUSY)
    expect(await screen.findByText('Seed data')).toBeTruthy()
    expect(screen.getByText('Generate SQL')).toBeTruthy()
  })

  it('says how long anything is kept, rather than implying forever', async () => {
    setup(BUSY)
    expect(await screen.findByText(/kept for 90 days/)).toBeTruthy()
  })
})

describe('the timeframe', () => {
  it('switches the numbers without asking main again', async () => {
    // The whole summary arrives in one call; re-fetching per tab would be a
    // round-trip for data already in hand.
    const { api } = setup(BUSY)
    await screen.findByText(/12 calls/)

    fireEvent.click(screen.getByText('Today'))

    expect(await screen.findByText(/2 calls/)).toBeTruthy()
    expect(api.summary).toHaveBeenCalledTimes(1)
  })
})

describe('with nothing recorded', () => {
  it('says so instead of showing a table of zeros', async () => {
    setup(EMPTY)
    expect(await screen.findByText(/No AI usage yet/)).toBeTruthy()
  })

  it('offers nothing to clear', async () => {
    setup(EMPTY)
    await screen.findByText(/No AI usage yet/)

    expect(screen.getByText('Clear').closest('button')!.disabled).toBe(true)
  })
})

describe('clearing', () => {
  it('asks first, since the counts exist nowhere else', async () => {
    const { api } = setup(BUSY)
    await screen.findByText(/12 calls/)

    fireEvent.click(screen.getByText('Clear'))

    expect(await screen.findByText(/Clear usage history\?/)).toBeTruthy()
    expect(api.clear, 'not until it is confirmed').not.toHaveBeenCalled()
  })

  it('goes through once confirmed', async () => {
    const { api } = setup(BUSY)
    await screen.findByText(/12 calls/)
    fireEvent.click(screen.getByText('Clear'))

    const dialog = await screen.findByText(/Clear usage history\?/)
    const confirm = dialog.closest('[role="dialog"]')!.querySelectorAll('button')
    fireEvent.click([...confirm].find((b) => b.textContent === 'Clear')!)

    await waitFor(() => expect(api.clear).toHaveBeenCalled())
  })
})
