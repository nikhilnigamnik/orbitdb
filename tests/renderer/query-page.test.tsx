// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryPage } from '@renderer/features/query/components/query-page'
import { CommandPaletteProvider } from '@renderer/features/command-palette/store'
import { ToastProvider } from '@renderer/components/ui/toast'

const runQuery = vi.fn()
const generateSql = vi.fn()

// The page only renders an editor once a connection is active, and the store
// only becomes active by actually connecting - stub it rather than drive it.
vi.mock('@renderer/features/connections/store/connection-store', () => ({
  useConnection: () => ({
    active: {
      connectionId: 'c1',
      serverVersion: 'PostgreSQL 16',
      currentDatabase: 'app',
      currentUser: 'me'
    },
    current: CONNECTION,
    connections: [CONNECTION],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnecting: false,
    connectError: null
  })
}))

const CONNECTION = {
  id: 'c1',
  name: 'local',
  engine: 'postgres' as const,
  environment: 'dev' as const,
  host: 'localhost',
  port: 5432,
  database: 'app',
  user: 'me',
  password: '',
  ssl: false,
  createdAt: '',
  updatedAt: ''
}

const OK = {
  success: true,
  rows: [],
  fields: [],
  rowCount: 0,
  command: 'SELECT',
  durationMs: 1,
  truncated: false
}

beforeEach(() => {
  runQuery.mockReset().mockResolvedValue({ success: true, data: OK })
  generateSql.mockReset()
  localStorage.clear()
  Object.assign(window, {
    api: {
      db: {
        runQuery,
        cancelQuery: vi.fn().mockResolvedValue({ success: true, data: undefined })
      },
      ai: { generateSql }
    }
  })
})

afterEach(cleanup)

async function setup() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <CommandPaletteProvider>
          <QueryPage />
        </CommandPaletteProvider>
      </ToastProvider>
    </MemoryRouter>
  )
  await screen.findByPlaceholderText(/Write SQL here/)
}

/** The SQL editor textarea. */
function editor(): HTMLTextAreaElement {
  return screen.getByPlaceholderText(/Write SQL here/) as HTMLTextAreaElement
}

describe('running a destructive query', () => {
  it('asks first, and does not run until confirmed', async () => {
    await setup()
    const box = await screen.findByPlaceholderText(/Write SQL here/)
    fireEvent.change(box, { target: { value: 'delete from users' } })
    fireEvent.keyDown(box, { key: 'Enter', metaKey: true })

    expect(await screen.findByText(/Run this destructive query/)).toBeTruthy()
    expect(screen.getByText(/Delete every row in users/)).toBeTruthy()
    expect(runQuery, 'nothing should reach the database yet').not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /run anyway/i }))
    await waitFor(() => expect(runQuery).toHaveBeenCalled())
  })

  it('abandons the run when dismissed', async () => {
    await setup()
    const box = await screen.findByPlaceholderText(/Write SQL here/)
    fireEvent.change(box, { target: { value: 'drop table users' } })
    fireEvent.keyDown(box, { key: 'Enter', metaKey: true })

    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByText(/Run this destructive/)).toBeNull())
    expect(runQuery).not.toHaveBeenCalled()
  })

  it('does not interrupt a read', async () => {
    await setup()
    const box = await screen.findByPlaceholderText(/Write SQL here/)
    fireEvent.change(box, { target: { value: 'select * from users' } })
    fireEvent.keyDown(box, { key: 'Enter', metaKey: true })

    await waitFor(() => expect(runQuery).toHaveBeenCalled())
    expect(screen.queryByText(/Run this destructive/)).toBeNull()
  })
})

describe('generated SQL', () => {
  it('lands in the editor for review instead of running itself', async () => {
    // The model is told to prefer SELECT, but that is a preference in a prompt -
    // a misread request used to reach the database with nothing in between.
    generateSql.mockResolvedValue({
      success: true,
      data: { sql: 'delete from users', explanation: '' }
    })
    await setup()

    fireEvent.click(await screen.findByRole('button', { name: /ask ai/i }))
    const prompt = await screen.findByPlaceholderText(/Describe the query/)
    fireEvent.change(prompt, { target: { value: 'remove the test users' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    await waitFor(() => expect(editor().value).toBe('delete from users'))
    expect(runQuery, 'generated SQL must not execute itself').not.toHaveBeenCalled()
  })
})

describe('the draft', () => {
  it('survives leaving the page', async () => {
    await setup()
    const box = await screen.findByPlaceholderText(/Write SQL here/)
    fireEvent.change(box, { target: { value: 'select 42' } })

    await waitFor(() =>
      expect(localStorage.getItem('orbitdb:query-draft:c1')).toContain('select 42')
    )

    cleanup()
    await setup()
    await waitFor(() => expect(editor().value).toBe('select 42'))
  })

  it('starts from an engine-appropriate default', async () => {
    await setup()
    // now() does not exist in SQLite; postgres gets its own opener.
    await waitFor(() => expect(editor().value).toBe('select now();'))
  })
})

describe('generated SQL over an unsaved draft', () => {
  async function generateOver(draft: string) {
    generateSql.mockResolvedValue({ success: true, data: { sql: 'select 1' } })
    await setup()
    fireEvent.change(editor(), { target: { value: draft } })

    fireEvent.click(await screen.findByRole('button', { name: /ask ai/i }))
    const prompt = await screen.findByPlaceholderText(/Describe the query/)
    fireEvent.change(prompt, { target: { value: 'all users' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    await waitFor(() => expect(editor().value).toBe('select 1'))
  }

  it('offers a way back - the draft is persisted, and history only holds runs', async () => {
    await generateOver('select * from half_written')

    fireEvent.click(await screen.findByText('Undo'))

    expect(editor().value).toBe('select * from half_written')
  })

  it('says nothing when there was nothing to lose', async () => {
    await generateOver('   ')
    expect(screen.queryByText('Replaced the editor contents')).toBeNull()
  })
})
