// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ConnectionProvider,
  useConnection
} from '@renderer/features/connections/store/connection-store'

afterEach(cleanup)

function ok<T>(data: T) {
  return Promise.resolve({ success: true as const, data })
}

function fail(error: string) {
  return Promise.resolve({ success: false as const, error })
}

function meta(connectionId: string) {
  return { connectionId, serverVersion: '16', currentDatabase: 'app', currentUser: 'me' }
}

type Store = ReturnType<typeof useConnection>

function mount(db: { connect: (id: string) => unknown; disconnect: (id: string) => unknown }) {
  Object.assign(window, {
    api: { connections: { list: () => ok([]) }, db }
  })
  const handle: { current: Store | null } = { current: null }
  function Probe() {
    handle.current = useConnection()
    const { active, connectError, disconnectError } = handle.current
    return (
      <>
        <p data-testid="active">{active?.connectionId ?? 'none'}</p>
        <p data-testid="connect-error">{connectError ?? ''}</p>
        <p data-testid="disconnect-error">{disconnectError ?? ''}</p>
      </>
    )
  }
  render(
    <ConnectionProvider>
      <Probe />
    </ConnectionProvider>
  )
  return handle
}

describe('switching connections', () => {
  it('keeps the current one when the new one cannot be reached', async () => {
    const store = mount({
      connect: (id) => (id === 'down' ? fail('ECONNREFUSED') : ok(meta(id))),
      disconnect: () => ok(undefined)
    })

    await act(() => store.current!.connect('up'))
    await act(() => store.current!.connect('down').catch(() => undefined))

    expect(screen.getByTestId('active').textContent).toBe('up')
    expect(screen.getByTestId('connect-error').textContent).toBe('ECONNREFUSED')
  })

  it('closes the previous connection once the new one answers', async () => {
    const disconnect = vi.fn(() => ok(undefined))
    const store = mount({ connect: (id) => ok(meta(id)), disconnect })

    await act(() => store.current!.connect('a'))
    await act(() => store.current!.connect('b'))

    expect(screen.getByTestId('active').textContent).toBe('b')
    await waitFor(() => expect(disconnect).toHaveBeenCalledWith('a'))
  })
})

describe('disconnecting', () => {
  it('records a failure instead of rejecting', async () => {
    const store = mount({
      connect: (id) => ok(meta(id)),
      disconnect: () => fail('pool end failed')
    })
    await act(() => store.current!.connect('a'))

    // Callers fire this with `void`; a rejection here is an unhandled one.
    await act(() => expect(store.current!.disconnect()).resolves.toBeUndefined())

    expect(screen.getByTestId('active').textContent).toBe('none')
    expect(screen.getByTestId('disconnect-error').textContent).toBe('pool end failed')
  })
})
