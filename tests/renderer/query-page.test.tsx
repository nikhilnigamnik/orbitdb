// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryPage } from '@renderer/features/query/components/query-page'
import { CommandPaletteProvider } from '@renderer/features/command-palette/store'
import { ToastProvider } from '@renderer/components/ui/toast'
import { EditorView } from '@codemirror/view'
import type { SavedQuery } from '@renderer/types'

const runQuery = vi.fn()
const generateSql = vi.fn()
const listQueries = vi.fn()
const recordQuery = vi.fn()
const updateQuery = vi.fn()
const deleteQuery = vi.fn()
const clearHistory = vi.fn()

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

function savedQuery(overrides: Partial<SavedQuery> = {}): SavedQuery {
  return {
    id: 'q1',
    connectionId: 'c1',
    sql: 'select 1',
    name: null,
    isStarred: false,
    ranAt: '2026-08-10T10:00:00.000Z',
    durationMs: 3,
    success: true,
    ...overrides
  }
}

beforeEach(() => {
  runQuery.mockReset().mockResolvedValue({ success: true, data: OK })
  generateSql.mockReset()
  listQueries.mockReset().mockResolvedValue({ success: true, data: [] })
  recordQuery.mockReset().mockResolvedValue({ success: true, data: savedQuery() })
  updateQuery.mockReset().mockResolvedValue({ success: true, data: savedQuery() })
  deleteQuery.mockReset().mockResolvedValue({ success: true, data: undefined })
  clearHistory.mockReset().mockResolvedValue({ success: true, data: undefined })
  localStorage.clear()
  Object.assign(window, {
    api: {
      db: {
        runQuery,
        cancelQuery: vi.fn().mockResolvedValue({ success: true, data: undefined })
      },
      ai: { generateSql },
      queries: {
        list: listQueries,
        record: recordQuery,
        update: updateQuery,
        delete: deleteQuery,
        clearHistory
      }
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
  await screen.findByTestId('sql-editor')
}

/**
 * The live CodeMirror instance. Reached through the DOM rather than a test seam
 * so these drive the same editor the app does.
 */
function view(): EditorView {
  const found = EditorView.findFromDOM(screen.getByTestId('sql-editor'))
  if (!found) throw new Error('The SQL editor is not mounted')
  return found
}

/** Stands in for typing: replaces the document, which fires the change listener. */
function typeSql(text: string) {
  const editor = view()
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } })
}

function editorText(): string {
  return view().state.doc.toString()
}

/**
 * Ctrl rather than Cmd: CodeMirror resolves `Mod` per platform, and jsdom does
 * not report a Mac, so Cmd would never match the binding here.
 */
function pressRun() {
  fireEvent.keyDown(view().contentDOM, { key: 'Enter', ctrlKey: true })
}

describe('running a destructive query', () => {
  it('asks first, and does not run until confirmed', async () => {
    await setup()
    typeSql('delete from users')
    pressRun()

    expect(await screen.findByText(/Run this destructive query/)).toBeTruthy()
    expect(screen.getByText(/Delete every row in users/)).toBeTruthy()
    expect(runQuery, 'nothing should reach the database yet').not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /run anyway/i }))
    await waitFor(() => expect(runQuery).toHaveBeenCalled())
  })

  it('abandons the run when dismissed', async () => {
    await setup()
    typeSql('drop table users')
    pressRun()

    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByText(/Run this destructive/)).toBeNull())
    expect(runQuery).not.toHaveBeenCalled()
  })

  it('does not interrupt a read', async () => {
    await setup()
    typeSql('select * from users')
    pressRun()

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

    await waitFor(() => expect(editorText()).toBe('delete from users'))
    expect(runQuery, 'generated SQL must not execute itself').not.toHaveBeenCalled()
  })
})

describe('the draft', () => {
  it('survives leaving the page', async () => {
    await setup()
    typeSql('select 42')

    await waitFor(() =>
      expect(localStorage.getItem('orbitdb:query-draft:c1')).toContain('select 42')
    )

    cleanup()
    await setup()
    await waitFor(() => expect(editorText()).toBe('select 42'))
  })

  it('starts from an engine-appropriate default', async () => {
    await setup()
    // now() does not exist in SQLite; postgres gets its own opener.
    await waitFor(() => expect(editorText()).toBe('select now();'))
  })
})

describe('the query library', () => {
  async function openLibrary() {
    fireEvent.click(await screen.findByRole('button', { name: /^queries/i }))
  }

  it('records a run in main rather than in the renderer', async () => {
    // History used to live in localStorage, which is the one piece of user state
    // that never reached userData.
    await setup()
    typeSql('select 42')
    pressRun()

    await waitFor(() =>
      expect(recordQuery).toHaveBeenCalledWith({
        connectionId: 'c1',
        sql: 'select 42',
        durationMs: 1,
        success: true
      })
    )
    expect(localStorage.getItem('orbitdb:query-history:c1'), 'no longer written').toBeNull()
  })

  it('shows what main returned, split into saved and recent', async () => {
    listQueries.mockResolvedValue({
      success: true,
      data: [
        savedQuery({ id: 'a', sql: 'select kept', isStarred: true, name: 'Daily count' }),
        savedQuery({ id: 'b', sql: 'select recent' })
      ]
    })
    await setup()
    await openLibrary()

    expect(await screen.findByText('Saved')).toBeTruthy()
    expect(screen.getByText('Recent')).toBeTruthy()
    expect((screen.getByLabelText('Query name') as HTMLInputElement).value).toBe('Daily count')
  })

  it('loads a picked query into the editor', async () => {
    listQueries.mockResolvedValue({
      success: true,
      data: [savedQuery({ sql: 'select from history' })]
    })
    await setup()
    await openLibrary()

    fireEvent.click(await screen.findByText('select from history'))

    await waitFor(() => expect(editorText()).toBe('select from history'))
  })

  it('stars a query, and re-reads the list afterwards', async () => {
    listQueries.mockResolvedValue({ success: true, data: [savedQuery({ id: 'b' })] })
    await setup()
    await openLibrary()

    fireEvent.click(await screen.findByRole('button', { name: /save this query/i }))

    await waitFor(() => expect(updateQuery).toHaveBeenCalledWith('b', { isStarred: true }))
    expect(listQueries.mock.calls.length).toBeGreaterThan(1)
  })

  it('names a starred query on Enter', async () => {
    listQueries.mockResolvedValue({
      success: true,
      data: [savedQuery({ id: 'a', isStarred: true })]
    })
    await setup()
    await openLibrary()

    const nameField = await screen.findByLabelText('Query name')
    fireEvent.change(nameField, { target: { value: 'Signups by day' } })
    fireEvent.keyDown(nameField, { key: 'Enter' })
    fireEvent.blur(nameField)

    await waitFor(() => expect(updateQuery).toHaveBeenCalledWith('a', { name: 'Signups by day' }))
  })

  it('will not clear a history that is entirely starred', async () => {
    // The button clears history only; offering it when there is none to clear
    // reads as an offer to delete the saved ones.
    listQueries.mockResolvedValue({
      success: true,
      data: [savedQuery({ id: 'a', isStarred: true })]
    })
    await setup()
    await openLibrary()

    const button = (await screen.findByLabelText('Clear history')) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('clears the history for this connection alone', async () => {
    listQueries.mockResolvedValue({ success: true, data: [savedQuery()] })
    await setup()
    await openLibrary()

    fireEvent.click(await screen.findByLabelText('Clear history'))

    await waitFor(() => expect(clearHistory).toHaveBeenCalledWith('c1'))
  })
})

describe('generated SQL over an unsaved draft', () => {
  async function generateOver(draft: string) {
    generateSql.mockResolvedValue({ success: true, data: { sql: 'select 1' } })
    await setup()
    typeSql(draft)

    fireEvent.click(await screen.findByRole('button', { name: /ask ai/i }))
    const prompt = await screen.findByPlaceholderText(/Describe the query/)
    fireEvent.change(prompt, { target: { value: 'all users' } })
    fireEvent.keyDown(prompt, { key: 'Enter' })

    await waitFor(() => expect(editorText()).toBe('select 1'))
  }

  it('offers a way back - the draft is persisted, and history only holds runs', async () => {
    await generateOver('select * from half_written')

    fireEvent.click(await screen.findByText('Undo'))

    expect(editorText()).toBe('select * from half_written')
  })

  it('says nothing when there was nothing to lose', async () => {
    await generateOver('   ')
    expect(screen.queryByText('Replaced the editor contents')).toBeNull()
  })
})
