// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HEALTH_CACHE_TTL_MS,
  resetConnectionHealthCache,
  useConnectionHealth
} from '@renderer/features/connections/lib/use-connection-health'
import type { SavedConnection } from '@renderer/types'

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
  hasPassword: true,
  ssl: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

let test: ReturnType<typeof vi.fn>

beforeEach(() => {
  resetConnectionHealthCache()
  test = vi.fn(() => Promise.resolve({ success: true, data: { success: true } }))
  Object.assign(window, { api: { connections: { test } } })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function mountOnce(connections: SavedConnection[]): Promise<void> {
  const { result, unmount } = renderHook(() => useConnectionHealth(connections))
  await waitFor(() => expect(result.current.health[connections[0].id]).toBe('ok'))
  unmount()
}

describe('checking connection health', () => {
  it('passes the id, so main can supply the password the renderer never holds', async () => {
    await mountOnce([connection])
    expect(test).toHaveBeenCalledWith(connection, 'c1')
  })

  it('does not re-test on every visit to the page', async () => {
    await mountOnce([connection])
    await mountOnce([connection])
    expect(test).toHaveBeenCalledTimes(1)
  })

  it('re-tests once the cached answer has expired', async () => {
    const start = Date.now()
    const now = vi.spyOn(Date, 'now').mockReturnValue(start)
    await mountOnce([connection])

    now.mockReturnValue(start + HEALTH_CACHE_TTL_MS)
    await mountOnce([connection])
    expect(test).toHaveBeenCalledTimes(2)
  })

  it('re-tests a connection that was edited since', async () => {
    await mountOnce([connection])
    await mountOnce([{ ...connection, updatedAt: '2026-02-01T00:00:00.000Z' }])
    expect(test).toHaveBeenCalledTimes(2)
  })
})
