// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LogsPage } from '@renderer/features/logs/components/logs-page'
import { ToastProvider } from '@renderer/components/ui/toast'
import type { QueryLogEntry } from '@renderer/types'

vi.mock('@renderer/features/connections/store/connection-store', () => ({
  useConnection: () => ({ connections: [{ id: 'c1', name: 'local' }] })
}))

const listLogs = vi.fn()
const clearLogs = vi.fn()

function entry(overrides: Partial<QueryLogEntry> = {}): QueryLogEntry {
  return {
    origin: 'user',
    id: 'l1',
    connectionId: 'c1',
    engine: 'postgres',
    sql: 'select 1',
    params: [],
    durationMs: 4,
    rowCount: 1,
    success: true,
    ranAt: '2026-08-10T10:00:00.000Z',
    ...overrides
  }
}

beforeEach(() => {
  listLogs.mockReset().mockResolvedValue({ success: true, data: [entry()] })
  clearLogs.mockReset().mockResolvedValue({ success: true, data: undefined })
  Object.assign(window, { api: { db: { listLogs, clearLogs } } })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setup() {
  render(
    <ToastProvider>
      <LogsPage />
    </ToastProvider>
  )
}

describe('the status', () => {
  it('reads the same in the list and in the detail panel', async () => {
    listLogs.mockResolvedValue({
      success: true,
      data: [entry(), entry({ id: 'l2', sql: 'select broken', success: false, error: 'boom' })]
    })
    setup()

    const row = (await screen.findByText('select broken')).closest('button')!
    // The filter tabs say Success and Error, so the list's chips match them.
    expect(screen.getAllByText('Success').length).toBeGreaterThan(1)
    expect(row.getAttribute('aria-current')).toBeNull()

    fireEvent.click(row)
    expect(row.getAttribute('aria-current')).toBe('true')
    expect(await screen.findByText('boom')).toBeTruthy()
    expect(screen.queryByText('Failed')).toBeNull()
  })
})

describe('clearing', () => {
  it('reports a failure instead of leaving the dialog open in silence', async () => {
    clearLogs.mockResolvedValue({ success: false, error: 'buffer locked' })
    setup()
    await screen.findByText('select 1')

    fireEvent.click(screen.getByRole('button', { name: /^clear$/i }))
    fireEvent.click(await screen.findByRole('button', { name: /clear log/i }))

    expect(await screen.findByText('Could not clear the query log')).toBeTruthy()
    expect(screen.getByText('buffer locked')).toBeTruthy()
  })
})

describe('copying the SQL', () => {
  it('only says Copied once the clipboard actually took it', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
    })
    setup()
    fireEvent.click(await screen.findByText('select 1'))

    fireEvent.click(await screen.findByRole('button', { name: 'Copy SQL' }))

    expect(await screen.findByText('Could not copy the SQL')).toBeTruthy()
    expect(screen.queryByText('Copied')).toBeNull()
  })
})

describe('polling', () => {
  it('polls quietly, without flipping Refresh into a spinner every tick', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup()
    await screen.findByText('select 1')

    // Hold the poll open so its in-flight state is what gets rendered.
    listLogs.mockReturnValue(new Promise(() => {}))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })

    expect(listLogs.mock.calls.length).toBeGreaterThan(1)
    const refresh = screen.getByRole('button', { name: /refresh/i }) as HTMLButtonElement
    expect(refresh.disabled).toBe(false)
  })

  it('picks up a new entry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup()
    await screen.findByText('select 1')

    listLogs.mockResolvedValue({
      success: true,
      data: [entry({ id: 'l2', sql: 'select 2' }), entry()]
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })

    await waitFor(() => expect(screen.getByText('select 2')).toBeTruthy())
  })
})
