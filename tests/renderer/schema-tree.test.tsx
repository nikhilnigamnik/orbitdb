// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SchemaTree } from '@renderer/features/database/components/schema-tree'
import { CommandPaletteProvider } from '@renderer/features/command-palette/store'
import type { TableInfo } from '@renderer/types'

const listTables = vi.fn()

beforeEach(() => {
  listTables.mockReset()
  listTables.mockResolvedValue({ success: true, data: [] })
  Object.assign(window, { api: { db: { listTables } } })
  localStorage.clear()
})

afterEach(cleanup)

function table(name: string, overrides: Partial<TableInfo> = {}): TableInfo {
  return { schema: 'public', name, type: 'table', estimatedRows: null, ...overrides }
}

function setup(schemas: string[]) {
  render(
    <MemoryRouter>
      <CommandPaletteProvider>
        <SchemaTree connectionId="c1" schemas={schemas} onRefresh={vi.fn()} isLoading={false} />
      </CommandPaletteProvider>
    </MemoryRouter>
  )
}

describe('what is open on arrival', () => {
  it('opens the conventional schema on Postgres', async () => {
    setup(['public', 'auth'])
    await waitFor(() => expect(listTables).toHaveBeenCalledWith('c1', 'public'))
    expect(listTables).not.toHaveBeenCalledWith('c1', 'auth')
  })

  it('opens the only schema there is, whatever it is called', async () => {
    // D1 calls its single schema 'main'; hardcoding 'public' left it collapsed
    // on every launch.
    setup(['main'])
    await waitFor(() => expect(listTables).toHaveBeenCalledWith('c1', 'main'))
  })

  it('opens the only schema on MySQL too, where schemas are database names', async () => {
    setup(['app_production'])
    await waitFor(() => expect(listTables).toHaveBeenCalledWith('c1', 'app_production'))
  })

  it('leaves several unconventional schemas closed rather than guessing', async () => {
    setup(['alpha', 'beta'])
    // Nothing to prefer, and opening every one would fetch every table list.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(listTables).not.toHaveBeenCalled()
  })
})

describe('row counts', () => {
  it('marks them approximate, as the table header does', async () => {
    listTables.mockResolvedValue({
      success: true,
      data: [table('users', { estimatedRows: 1234 })]
    })
    setup(['public'])
    expect(await screen.findByText('~1,234')).toBeTruthy()
  })

  it('shows zero rather than hiding it as unknown', async () => {
    listTables.mockResolvedValue({ success: true, data: [table('empty', { estimatedRows: 0 })] })
    setup(['public'])
    expect(await screen.findByText('~0')).toBeTruthy()
  })

  it('says nothing when the engine keeps no statistic', async () => {
    // D1 has none at all.
    listTables.mockResolvedValue({ success: true, data: [table('t', { estimatedRows: null })] })
    setup(['public'])
    await screen.findByText('t')
    expect(screen.queryByText(/^~/)).toBeNull()
  })

  it('keeps showing the count once the table is pinned', async () => {
    // The count used to be suppressed for pinned tables because the pin icon
    // took the same slot — pinning silently removed information.
    localStorage.setItem(
      'orbitdb:pinned-tables:c1',
      JSON.stringify([{ schema: 'public', table: 'users' }])
    )
    listTables.mockResolvedValue({
      success: true,
      data: [table('users', { estimatedRows: 99 })]
    })
    setup(['public'])

    // Prove the pin actually took, or this passes without testing anything.
    expect(await screen.findAllByLabelText('Unpin table')).not.toHaveLength(0)
    expect(await screen.findAllByText('~99')).not.toHaveLength(0)
  })
})

describe('a schema that fails to load', () => {
  it('offers a retry instead of stranding the tree', async () => {
    listTables.mockResolvedValue({ success: false, error: 'permission denied for schema public' })
    setup(['public'])

    expect(await screen.findByText(/permission denied/)).toBeTruthy()
    const retry = await screen.findByRole('button', { name: /retry|try again/i })

    listTables.mockResolvedValue({ success: true, data: [table('users')] })
    retry.click()
    expect(await screen.findByText('users')).toBeTruthy()
  })
})
