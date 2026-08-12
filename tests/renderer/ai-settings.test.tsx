// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiSettings } from '@renderer/features/settings/components/ai-settings'
import { ToastProvider } from '@renderer/components/ui/toast'
import type { AiGatewayIds, AiProviderView, AiSettingsView } from '@renderer/types'

afterEach(cleanup)

function ok<T>(data: T) {
  return Promise.resolve({ success: true as const, data })
}

function providerView(overrides: Partial<AiProviderView> & Pick<AiProviderView, 'id'>) {
  return {
    hasKey: false,
    keyHint: null,
    isKeyUnreadable: false,
    model: 'claude-sonnet-5',
    ...overrides
  } as AiProviderView
}

/** All three providers, with only the named one's fields overridden. */
function view(
  overrides: Partial<AiProviderView> & Pick<AiProviderView, 'id'>,
  gateway: AiGatewayIds = { accountId: '', gatewayId: '' }
): AiSettingsView {
  const base = [
    providerView({ id: 'anthropic' }),
    providerView({ id: 'openai', model: 'gpt-5.2' }),
    providerView({ id: 'google', model: 'gemini-3.6-flash' }),
    providerView({ id: 'cloudflare', model: 'anthropic/claude-sonnet-5' })
  ]
  return {
    active: 'anthropic',
    providers: base.map((p) => (p.id === overrides.id ? { ...p, ...overrides } : p)),
    gateway
  }
}

const DEFAULT = view({ id: 'anthropic' })

/**
 * `getAi` answers with whatever `state.current` holds, so a test can model main
 * accepting a write and the UI re-reading it.
 */
function setup(initial: AiSettingsView = DEFAULT, overrides: Record<string, unknown> = {}) {
  const state = { current: initial }
  const api = {
    getAi: vi.fn(() => ok(state.current)),
    setAiProvider: vi.fn(() => ok('openai')),
    setAiKey: vi.fn(() => ok(undefined)),
    clearAiKey: vi.fn(() => ok(undefined)),
    setAiModel: vi.fn(() => ok('claude-opus-5')),
    testAi: vi.fn(() => ok(undefined)),
    setGateway: vi.fn(() => ok(undefined)),
    clearGatewayToken: vi.fn(() => ok(undefined)),
    ...overrides
  }
  Object.assign(window, { api: { settings: api } })
  render(
    <ToastProvider>
      <AiSettings />
    </ToastProvider>
  )
  return { api, state }
}

/** A provider's card - a labelled region, so this asks the way a reader would. */
async function card(label: string): Promise<HTMLElement> {
  return screen.findByRole('region', { name: label })
}

/** Cards other than the active one start folded; unfold before reaching inside. */
async function openCard(label: string): Promise<HTMLElement> {
  const section = await card(label)
  const trigger = within(section).getByText(label)
  if (!within(section).queryByText('Model')) fireEvent.click(trigger)
  return section
}

describe('the layout', () => {
  it('gives every provider its own card', async () => {
    setup()

    expect(await card('Anthropic')).toBeTruthy()
    expect(await card('OpenAI')).toBeTruthy()
    expect(await card('Google')).toBeTruthy()
  })

  it('marks exactly one as active', async () => {
    setup()
    const anthropic = await card('Anthropic')

    expect(screen.getAllByText('Active')).toHaveLength(1)
    expect(within(anthropic).getByText('Active')).toBeTruthy()
  })

  it('shows each provider its own models, not another’s', async () => {
    setup()
    fireEvent.click(within(await openCard('Google')).getByLabelText('Google model'))

    // Scoped to the open list: every closed trigger also renders its own name.
    const list = await screen.findByRole('listbox')
    expect(within(list).getByText('Gemini 2.5 Flash')).toBeTruthy()
    expect(within(list).queryByText('Sonnet 5'), 'an Anthropic model must not appear').toBeNull()
  })
})

describe('the active toggle', () => {
  it('switches provider when turned on', async () => {
    const { api } = setup()

    fireEvent.click(await screen.findByLabelText('Use OpenAI'))

    await waitFor(() => expect(api.setAiProvider).toHaveBeenCalledWith('openai'))
  })

  it('cannot be turned off on the active card', async () => {
    // Exactly one provider is active, so switching this off would leave none -
    // something else has to be switched on instead.
    setup()
    const toggle = (await screen.findByLabelText('Use Anthropic')) as HTMLButtonElement

    expect(toggle.disabled).toBe(true)
  })

  it('is available on a provider with no key yet', async () => {
    // Activating first and pasting the key second is a reasonable order.
    setup()
    const toggle = (await screen.findByLabelText('Use Google')) as HTMLButtonElement

    expect(toggle.disabled).toBe(false)
  })
})

describe('a key', () => {
  it('is saved against the card it was typed into', async () => {
    const { api } = setup()
    const openai = await openCard('OpenAI')

    fireEvent.change(within(openai).getByLabelText('OpenAI API key'), {
      target: { value: 'sk-openai-123456' }
    })
    fireEvent.click(within(openai).getByText('Save'))

    await waitFor(() => expect(api.setAiKey).toHaveBeenCalledWith('openai', 'sk-openai-123456'))
  })

  it('is masked while being typed', async () => {
    setup()
    const field = within(await openCard('Google')).getByLabelText('Google API key')

    expect((field as HTMLInputElement).type).toBe('password')
  })

  it('shows only its last four characters once saved', async () => {
    setup(view({ id: 'anthropic', hasKey: true, keyHint: '…3456' }))
    const anthropic = await card('Anthropic')

    // The renderer is never given a key, so there is nothing here to leak.
    expect(within(anthropic).getByText('…3456')).toBeTruthy()
    expect(within(anthropic).queryByLabelText('Anthropic API key')).toBeNull()
  })

  it('is removed from the card it belongs to', async () => {
    const { api } = setup(view({ id: 'openai', model: 'gpt-5.2', hasKey: true, keyHint: '…9999' }))

    await openCard('OpenAI')

    fireEvent.click(await screen.findByLabelText('Remove OpenAI key'))

    await waitFor(() => expect(api.clearAiKey).toHaveBeenCalledWith('openai'))
  })
})

describe('testing a key', () => {
  it('tests the provider whose button was pressed, not the active one', async () => {
    // Each card has its own button, so a key can be checked before switching.
    const { api } = setup(view({ id: 'openai', model: 'gpt-5.2', hasKey: true, keyHint: '…9999' }))

    fireEvent.click(within(await openCard('OpenAI')).getByText('Test key'))

    await waitFor(() => expect(api.testAi).toHaveBeenCalledWith('openai'))
    expect(await screen.findByText(/OpenAI key works/)).toBeTruthy()
  })

  it('names the provider that rejected it', async () => {
    const { api } = setup(view({ id: 'anthropic', hasKey: true, keyHint: '…3456' }), {
      testAi: vi.fn(() => Promise.resolve({ success: false, error: 'invalid x-api-key' }))
    })

    fireEvent.click(within(await card('Anthropic')).getByText('Test key'))

    expect(await screen.findByText(/Anthropic rejected the key/)).toBeTruthy()
    expect(await screen.findByText(/invalid x-api-key/)).toBeTruthy()
    expect(api.testAi).toHaveBeenCalled()
  })

  it('cannot be pressed with no key to test', async () => {
    setup()
    const button = within(await openCard('Google'))
      .getByText('Test key')
      .closest('button')!

    expect(button.disabled).toBe(true)
  })
})

describe('a key sealed under another keychain', () => {
  it('says so on the card it belongs to, and only there', async () => {
    setup(view({ id: 'openai', model: 'gpt-5.2', hasKey: true, isKeyUnreadable: true }))

    expect(
      within(await card('OpenAI')).getByText(/can.t be decrypted on this machine/i),
      'a card whose key needs re-entering opens itself'
    ).toBeTruthy()
    expect(within(await card('Anthropic')).queryByText(/can.t be decrypted/i)).toBeNull()
  })
})

describe('a save that fails', () => {
  it('keeps what was typed, so it does not have to be fetched again', async () => {
    setup(DEFAULT, {
      setAiKey: vi.fn(() => Promise.resolve({ success: false, error: 'network unreachable' }))
    })
    const openai = await openCard('OpenAI')
    const field = within(openai).getByLabelText('OpenAI API key') as HTMLInputElement

    fireEvent.change(field, { target: { value: 'sk-openai-123456' } })
    fireEvent.click(within(openai).getByText('Save'))

    expect(await screen.findByText(/key could not be saved/)).toBeTruthy()
    expect(field.value, 'the pasted key must survive the failure').toBe('sk-openai-123456')
  })
})

describe('folding', () => {
  it('opens the provider in use, so the thing you came for is already there', async () => {
    setup()
    expect(within(await card('Anthropic')).getByText('Model')).toBeTruthy()
  })

  it('folds the rest, so three cards read as a list', async () => {
    setup()
    expect(within(await card('OpenAI')).queryByText('Model')).toBeNull()
  })

  it('opens a card whose stored key needs re-entering', async () => {
    // Folded, the warning would be invisible and the key would stay broken.
    setup(view({ id: 'google', model: 'gemini-3.6-flash', hasKey: true, isKeyUnreadable: true }))

    expect(within(await card('Google')).getByText(/can.t be decrypted/i)).toBeTruthy()
  })

  it('unfolds on the header without touching the active provider', async () => {
    // One press must not both activate a provider and fold its settings.
    const { api } = setup()
    const openai = await card('OpenAI')

    fireEvent.click(within(openai).getByText('OpenAI'))

    expect(within(openai).getByText('Model')).toBeTruthy()
    expect(api.setAiProvider, 'expanding is not choosing').not.toHaveBeenCalled()
  })
})

describe('the Cloudflare provider card', () => {
  const CLOUDFLARE = 'Cloudflare AI Gateway'

  function withGateway(gateway: Partial<AiGatewayIds> = {}) {
    return {
      ...view({ id: 'cloudflare', model: 'anthropic/claude-sonnet-5' }),
      gateway: { accountId: '', gatewayId: '', ...gateway }
    }
  }

  it('sits in the same list as the others, with the same Active switch', async () => {
    setup()
    const section = await card(CLOUDFLARE)

    expect(within(section).getByLabelText(`Use ${CLOUDFLARE}`)).toBeTruthy()
  })

  it('opens itself while the ids are missing, since folded they are invisible', async () => {
    setup()
    expect(within(await card(CLOUDFLARE)).getByText('Account ID')).toBeTruthy()
  })

  it('saves the two ids', async () => {
    const { api } = setup()
    const section = await card(CLOUDFLARE)

    fireEvent.change(within(section).getByLabelText('Cloudflare account ID'), {
      target: { value: 'acct-1' }
    })
    fireEvent.change(within(section).getByLabelText('Cloudflare gateway ID'), {
      target: { value: 'orbitdb' }
    })
    fireEvent.click(within(section).getAllByText('Save')[0])

    await waitFor(() =>
      expect(api.setGateway).toHaveBeenCalledWith({ accountId: 'acct-1', gatewayId: 'orbitdb' })
    )
  })

  it('calls its credential a gateway token and says what it authorises', async () => {
    // On the unified endpoint the Cloudflare token *is* the credential - it is
    // what releases the stored provider keys or the billing credits - so the
    // copy must not describe it as a bolt-on for authenticated gateways.
    setup()
    const section = await card(CLOUDFLARE)

    expect(within(section).getByText('Gateway token')).toBeTruthy()
    expect(within(section).getByText(/stored provider keys or credits/)).toBeTruthy()
  })

  it('cannot be tested until both ids are there', async () => {
    setup(withGateway({ accountId: 'acct-1' }))
    const section = await card(CLOUDFLARE)

    const test = within(section).getByText('Test key').closest('button')
    expect(test?.getAttribute('disabled')).not.toBeNull()
  })

  it('can be tested with the ids alone, no token needed', async () => {
    // Configured and not active, so it folds like any other settled card.
    setup(withGateway({ accountId: 'acct-1', gatewayId: 'orbitdb' }))
    const section = await openCard(CLOUDFLARE)

    const test = within(section).getByText('Test key').closest('button')
    expect(test?.getAttribute('disabled')).toBeNull()
  })

  it('offers catalog slugs as its models, not our own model ids', async () => {
    setup({ ...withGateway(), active: 'cloudflare' })
    fireEvent.click(within(await card(CLOUDFLARE)).getByLabelText(`${CLOUDFLARE} model`))

    const list = await screen.findByRole('listbox')
    expect(within(list).getByText('Gemini 3.6 Flash')).toBeTruthy()
    expect(within(list).getByText('Google - balanced')).toBeTruthy()
  })
})

describe('the other providers', () => {
  it('keep asking for an API key, not a gateway id', async () => {
    setup()
    const anthropic = await card('Anthropic')

    expect(within(anthropic).getByText('API key')).toBeTruthy()
    expect(within(anthropic).queryByText('Account ID')).toBeNull()
  })
})
