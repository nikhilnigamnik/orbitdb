// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { HashRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROUTES, tableRoute } from '@renderer/config/routes'
import {
  ConnectionProvider,
  useConnection
} from '@renderer/features/connections/store/connection-store'
import { DatabasePage } from '@renderer/features/database/components/database-page'
import {
  loadLastTable,
  loadRecent,
  saveLastTable
} from '@renderer/features/database/lib/table-prefs'

vi.mock('@renderer/features/database/components/connection-overview', () => ({
  ConnectionOverview: () => <p>Overview</p>
}))

function ok<T>(data: T) {
  return Promise.resolve({ success: true as const, data })
}

function meta(connectionId: string) {
  return { connectionId, serverVersion: '16', currentDatabase: 'app', currentUser: 'me' }
}

// Never settles: what matters is which table each connection is asked about.
const tableDetails = vi.fn<(connectionId: string, schema: string, table: string) => Promise<never>>(
  () => new Promise(() => {})
)

beforeEach(() => {
  localStorage.clear()
  window.location.hash = ''
  tableDetails.mockClear()
  Object.assign(window, {
    api: {
      connections: { list: () => ok([]) },
      db: {
        connect: (id: string) => ok(meta(id)),
        disconnect: () => ok(undefined),
        tableDetails,
        countRows: () => new Promise(() => {})
      }
    }
  })
})

afterEach(cleanup)

interface Harness {
  connect: (id: string) => Promise<void>
  switchTo: (id: string) => Promise<void>
  open: (schema: string, table: string) => void
}

function mount(hash = '#/database'): Harness {
  window.location.hash = hash
  const harness = {} as Harness
  // The sidebar's switcher: connect, then go to the browser.
  function Controls() {
    const navigate = useNavigate()
    const { connect } = useConnection()
    harness.connect = connect
    harness.switchTo = async (id) => {
      await connect(id)
      navigate(ROUTES.database)
    }
    harness.open = (schema, table) => navigate(tableRoute(schema, table))
    return null
  }
  render(
    <HashRouter>
      <ConnectionProvider>
        <Controls />
        <DatabasePage />
      </ConnectionProvider>
    </HashRouter>
  )
  return harness
}

function wasAsked(connectionId: string, schema: string, table: string): boolean {
  return tableDetails.mock.calls.some(
    ([c, s, t]) => c === connectionId && s === schema && t === table
  )
}

describe('switching connections from a table', () => {
  it("never opens or remembers the previous connection's table", async () => {
    const app = mount()
    await act(() => app.switchTo('d1'))
    act(() => app.open('main', 'devices'))
    await waitFor(() => expect(wasAsked('d1', 'main', 'devices')).toBe(true))

    await act(() => app.switchTo('pg'))

    expect(wasAsked('pg', 'main', 'devices')).toBe(false)
    expect(loadLastTable('pg')).toBeNull()
    expect(loadRecent('pg')).toEqual([])
    expect(window.location.hash).toBe(`#${ROUTES.database}`)
  })

  it("restores each connection's own last table", async () => {
    const app = mount()
    await act(() => app.switchTo('d1'))
    act(() => app.open('main', 'devices'))
    await act(() => app.switchTo('pg'))
    act(() => app.open('public', 'users'))
    await waitFor(() => expect(wasAsked('pg', 'public', 'users')).toBe(true))

    await act(() => app.switchTo('d1'))

    expect(window.location.hash).toBe(`#${tableRoute('main', 'devices')}`)
    expect(wasAsked('d1', 'public', 'users')).toBe(false)
    expect(loadLastTable('d1')).toEqual({ schema: 'main', table: 'devices' })
    expect(loadLastTable('pg')).toEqual({ schema: 'public', table: 'users' })
  })

  it('does not trust a table left in the URL by a reload', async () => {
    saveLastTable('pg', { schema: 'public', table: 'users' })
    // After a reload no connection is active, but the hash still names a table.
    const app = mount(`#${tableRoute('main', 'devices')}`)

    // The picker connects without navigating.
    await act(() => app.connect('pg'))

    expect(wasAsked('pg', 'main', 'devices')).toBe(false)
    expect(window.location.hash).toBe(`#${tableRoute('public', 'users')}`)
    await waitFor(() => expect(wasAsked('pg', 'public', 'users')).toBe(true))
  })
})
