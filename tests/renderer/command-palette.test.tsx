// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@renderer/components/ui/toast'
import { CommandPalette } from '@renderer/features/command-palette/components/command-palette'
import { ConnectionProvider } from '@renderer/features/connections/store/connection-store'
import { ThemeProvider } from '@renderer/features/settings/theme'
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
      app: { getTheme: () => ok('system') }
    }
  })
})

function setup() {
  const onOpenChange = vi.fn()
  render(
    <MemoryRouter>
      <ThemeProvider>
        <ToastProvider>
          <ConnectionProvider>
            <CommandPalette open onOpenChange={onOpenChange} />
          </ConnectionProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>
  )
  return { onOpenChange }
}

describe('connecting from the palette', () => {
  it('says why a connect failed once the palette has closed', async () => {
    // The palette closes before the connect is attempted and the page under
    // it is not the connections list, so nothing else would report the error.
    const { onOpenChange } = setup()
    fireEvent.click(await screen.findByText('Staging'))

    expect(await screen.findByText('Could not connect to Staging')).toBeTruthy()
    expect(await screen.findByText(/ECONNREFUSED 10\.0\.0\.5:5432/)).toBeTruthy()
    expect(connect).toHaveBeenCalledWith('c-staging')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
