// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectionCard } from '@renderer/features/connections/components/connection-card'
import type { SavedConnection } from '@renderer/types'

afterEach(cleanup)

const connection: SavedConnection = {
  id: 'c1',
  name: 'Local',
  engine: 'postgres',
  environment: 'dev',
  host: 'localhost',
  port: 5432,
  database: 'app',
  user: 'me',
  password: '',
  ssl: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

function setup(
  state: {
    isActive?: boolean
    isConnecting?: boolean
    isBusy?: boolean
    connectError?: string
    activeName?: string | null
    overrides?: Partial<SavedConnection>
  } = {}
) {
  const onConnect = vi.fn()
  const onOpen = vi.fn()
  const onDisconnect = vi.fn()
  render(
    <ConnectionCard
      connection={{ ...connection, ...state.overrides }}
      isActive={state.isActive ?? false}
      isConnecting={state.isConnecting ?? false}
      isBusy={state.isBusy}
      connectError={state.connectError}
      activeName={state.activeName}
      onConnect={onConnect}
      onOpen={onOpen}
      onDisconnect={onDisconnect}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />
  )
  return { onConnect, onOpen, onDisconnect, container: document.body }
}

function button(name: string | RegExp): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement
}

describe('the connect control', () => {
  it('offers to connect when idle, naming the connection', () => {
    const { onConnect } = setup()
    fireEvent.click(button('Connect to Local'))
    expect(onConnect).toHaveBeenCalled()
  })

  it('reports progress while connecting, and cannot be pressed again', () => {
    setup({ isConnecting: true })
    expect(screen.getByText('Connecting…')).toBeTruthy()
    expect(button('Connecting to Local').disabled).toBe(true)
  })

  it('waits while another connection is mid-connect', () => {
    // Starting a second connect would race the first for the active slot.
    setup({ isBusy: true })
    expect(button('Connect to Local').disabled).toBe(true)
  })

  it('still connects when something else is open - the store switches over', () => {
    setup({ activeName: 'Staging' })
    expect(button('Connect to Local').disabled).toBe(false)
  })
})

describe('after a failed attempt', () => {
  it('shows the error on the row that failed, with a Retry', () => {
    // It used to be a banner at the top of the page that named no connection.
    const { onConnect } = setup({ connectError: 'password authentication failed' })
    expect(screen.getByRole('alert').textContent).toContain('password authentication failed')
    fireEvent.click(button('Retry connecting to Local'))
    expect(onConnect).toHaveBeenCalled()
  })

  it('shows no error on a row that did not fail', () => {
    setup()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('once connected', () => {
  it('offers Open and Disconnect as two controls, both visible without hovering', () => {
    // The old single button read "Connected" and turned into "Disconnect" only
    // under the pointer, so what a click would do was unknowable until then.
    const { onOpen, onDisconnect } = setup({ isActive: true })
    fireEvent.click(button('Open Local'))
    expect(onOpen).toHaveBeenCalled()
    fireEvent.click(button('Disconnect from Local'))
    expect(onDisconnect).toHaveBeenCalled()
    expect(screen.queryByText('Connected')).toBeNull()
  })

  it('makes Open the primary action and keeps Disconnect quiet', () => {
    setup({ isActive: true })
    expect(button('Open Local').className).toContain('bg-accent')
    const disconnect = button('Disconnect from Local')
    expect(disconnect.className).not.toContain('bg-accent')
    expect(disconnect.className).not.toMatch(/bg-success|bg-danger-fill/)
  })

  it('never offers to connect to what is already open', () => {
    setup({ isActive: true })
    expect(screen.queryByRole('button', { name: /Connect to/ })).toBeNull()
  })
})

describe('the colour tag', () => {
  it('draws a rail in the chosen accent', () => {
    const { container } = setup({ overrides: { color: 'violet' } })
    expect(container.querySelector('.bg-tag-violet')).toBeTruthy()
  })

  it('draws nothing when the connection was never tagged', () => {
    const { container } = setup()
    expect(container.querySelector('[class*="bg-tag-"]')).toBeNull()
  })
})

describe('the health dot', () => {
  function renderHealth(health: 'ok' | 'fail', healthError?: string) {
    const onRefreshHealth = vi.fn()
    render(
      <ConnectionCard
        connection={connection}
        isActive={false}
        isConnecting={false}
        health={health}
        healthError={healthError}
        onConnect={vi.fn()}
        onOpen={vi.fn()}
        onDisconnect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onRefreshHealth={onRefreshHealth}
      />
    )
    return { onRefreshHealth }
  }

  it('is a 24px target around a 10px dot', () => {
    renderHealth('ok')
    const button = screen.getByRole('button', { name: 'Reachable' })
    expect(button.className).toContain('size-6')
    expect(button.querySelector('span')!.className).toContain('size-2.5')
  })

  it('names the error, which used to live only in a hover tooltip', () => {
    const { onRefreshHealth } = renderHealth('fail', 'connect ECONNREFUSED')
    const button = screen.getByRole('button', { name: /Unreachable: connect ECONNREFUSED/ })
    fireEvent.click(button)
    expect(onRefreshHealth).toHaveBeenCalled()
  })
})

describe('the SSL lock', () => {
  it('is announced as an image with a name', () => {
    setup({ overrides: { ssl: true } })
    expect(screen.getByRole('img', { name: 'SSL enabled' })).toBeTruthy()
  })
})
