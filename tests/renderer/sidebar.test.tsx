// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from '@renderer/components/layout/sidebar'
import { ToastProvider } from '@renderer/components/ui/toast'
import { APP_NAME } from '@renderer/config/site'
import { ROUTES } from '@renderer/config/routes'
import { CommandPaletteProvider } from '@renderer/features/command-palette/store'
import { ConnectionProvider } from '@renderer/features/connections/store/connection-store'
import { UpdateCheckProvider } from '@renderer/features/settings/store'
import type { SavedConnection } from '@renderer/types'

afterEach(cleanup)

function ok<T>(data: T) {
  return Promise.resolve({ success: true as const, data })
}

function fail(error: string) {
  return Promise.resolve({ success: false as const, error })
}

const STAGING: SavedConnection = {
  id: 'c-staging',
  name: 'Staging',
  engine: 'postgres',
  environment: 'dev',
  host: 'db.example.com',
  port: 5432,
  database: 'app',
  user: 'app',
  password: '',
  hasPassword: true,
  ssl: true,
  sslVerify: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

const connect = vi.fn()

beforeEach(() => {
  connect.mockReset().mockImplementation(() => fail('ECONNREFUSED 10.0.0.5:5432'))
  Object.assign(window, {
    api: {
      connections: { list: () => ok([STAGING]) },
      db: { connect },
      app: {
        getVersion: () => ok('0.3.0'),
        checkUpdate: () =>
          ok({
            currentVersion: '0.3.0',
            latestVersion: null,
            hasUpdate: false,
            releaseUrl: null,
            publishedAt: null
          })
      }
    }
  })
})

function LocationProbe() {
  const { pathname } = useLocation()
  return <p data-testid="path">{pathname}</p>
}

function setup() {
  render(
    <MemoryRouter initialEntries={[ROUTES.query]}>
      <ToastProvider>
        <ConnectionProvider>
          <UpdateCheckProvider>
            <CommandPaletteProvider>
              <Sidebar />
              <LocationProbe />
            </CommandPaletteProvider>
          </UpdateCheckProvider>
        </ConnectionProvider>
      </ToastProvider>
    </MemoryRouter>
  )
}

describe('switching connections from the sidebar', () => {
  it('says why a connect failed, rather than landing on a page that stays silent', async () => {
    // The connections page shows a failure only beside the Connect pressed on
    // the page itself, so a switch that failed here used to navigate there and
    // leave nothing to read.
    setup()
    const trigger = (await screen.findByText(APP_NAME)).closest('button')!
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: /Staging/ }))

    expect(await screen.findByText('Could not connect to Staging')).toBeTruthy()
    expect(await screen.findByText(/ECONNREFUSED 10\.0\.0\.5:5432/)).toBeTruthy()
    expect(connect).toHaveBeenCalledWith('c-staging')
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe(ROUTES.connections))
  })
})
