// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { ConnectionsPage } from '@renderer/features/connections/components/connections-page'
import { ConnectionProvider } from '@renderer/features/connections/store/connection-store'
import { ROUTES } from '@renderer/config/routes'

afterEach(cleanup)

function ok<T>(data: T) {
  return Promise.resolve({ success: true as const, data })
}

function mount() {
  Object.assign(window, {
    api: {
      connections: { list: () => ok([]), test: () => ok({ ok: true }) },
      db: { connect: () => ok(undefined), disconnect: () => ok(undefined) }
    }
  })
  render(
    <MemoryRouter initialEntries={[ROUTES.connections]}>
      <ConnectionProvider>
        <Routes>
          <Route path={ROUTES.connections} element={<ConnectionsPage />} />
          <Route path={ROUTES.settings} element={<h1>Settings page</h1>} />
        </Routes>
      </ConnectionProvider>
    </MemoryRouter>
  )
}

describe('reaching Settings from the connections page', () => {
  it('is possible at all', async () => {
    // AppShell hides the sidebar on this route, so without this control there is
    // no way into Settings before a connection exists - and the AI key lives there.
    mount()
    expect(await screen.findByLabelText('Settings')).toBeTruthy()
  })

  it('goes to the settings route', async () => {
    mount()
    fireEvent.click(await screen.findByLabelText('Settings'))

    expect(await screen.findByText('Settings page')).toBeTruthy()
  })
})
