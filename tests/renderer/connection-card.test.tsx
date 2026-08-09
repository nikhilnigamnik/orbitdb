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

function setup(state: { isActive?: boolean; isConnecting?: boolean } = {}) {
  const onConnect = vi.fn()
  const onDisconnect = vi.fn()
  render(
    <ConnectionCard
      connection={connection}
      isActive={state.isActive ?? false}
      isConnecting={state.isConnecting ?? false}
      onConnect={onConnect}
      onDisconnect={onDisconnect}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />
  )
  return { onConnect, onDisconnect }
}

describe('the connect control', () => {
  it('offers to connect when idle', () => {
    const { onConnect } = setup()
    const button = screen.getByLabelText('Connect')
    fireEvent.click(button)
    expect(onConnect).toHaveBeenCalled()
  })

  it('reports progress while connecting, and cannot be pressed again', () => {
    setup({ isConnecting: true })
    expect(screen.getByText('Connecting…')).toBeTruthy()
    expect((screen.getByLabelText('Connecting') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('once connected', () => {
  it('says what it does, not only what it is', () => {
    // The old button was a green "Connected" that quietly performed a disconnect
    // — it named a state and gave no hint of the action behind it.
    setup({ isActive: true })
    expect(screen.getByText('Connected')).toBeTruthy()
    expect(screen.getByText('Disconnect')).toBeTruthy()
  })

  it('disconnects when pressed', () => {
    const { onDisconnect } = setup({ isActive: true })
    fireEvent.click(screen.getByLabelText('Disconnect'))
    expect(onDisconnect).toHaveBeenCalled()
  })

  it('reveals the action on hover and on keyboard focus alike', () => {
    setup({ isActive: true })
    const state = screen.getByText('Connected')
    const action = screen.getByText('Disconnect')

    // Hover-only would strand anyone tabbing through the page.
    expect(state.className).toContain('group-focus-visible/button:hidden')
    expect(action.className).toContain('group-focus-visible/button:flex')
  })

  it('does not dress the button as a success badge', () => {
    // Green competed with the health dot and the dev environment chip in the
    // same row, and read as status rather than as a control.
    const { container } = render(
      <ConnectionCard
        connection={connection}
        isActive
        isConnecting={false}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    const button = container.querySelector('[data-slot="button"]')!
    expect(button.getAttribute('data-tone')).toBe('default')
    expect(button.className).not.toMatch(/bg-success\//)
  })
})
