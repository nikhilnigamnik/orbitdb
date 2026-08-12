// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReferencedBy } from '@renderer/features/tables/components/referenced-by'
import type { ReferencingKeyInfo } from '@renderer/types'

const referencingKeys = vi.fn()
const countRows = vi.fn()

function key(overrides: Partial<ReferencingKeyInfo> = {}): ReferencingKeyInfo {
  return {
    name: 'orders_user_id_fkey',
    schema: 'public',
    table: 'orders',
    columns: ['user_id'],
    referencedSchema: 'public',
    referencedTable: 'users',
    referencedColumns: ['id'],
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
    ...overrides
  }
}

beforeEach(() => {
  referencingKeys.mockReset().mockResolvedValue({ success: true, data: [] })
  countRows.mockReset().mockResolvedValue({ success: true, data: 0 })
  Object.assign(window, { api: { db: { referencingKeys, countRows } } })
})

afterEach(cleanup)

function setup(row: Record<string, unknown> = { id: 42 }) {
  render(
    <MemoryRouter>
      <ReferencedBy
        connectionId="c1"
        schema="public"
        table="users"
        row={row}
        onNavigate={vi.fn()}
      />
    </MemoryRouter>
  )
}

describe('with nothing pointing at the row', () => {
  it('renders nothing at all, rather than an empty box', async () => {
    const { container } = render(
      <MemoryRouter>
        <ReferencedBy
          connectionId="c1"
          schema="public"
          table="users"
          row={{ id: 42 }}
          onNavigate={vi.fn()}
        />
      </MemoryRouter>
    )

    await waitFor(() => expect(container.textContent).not.toContain('Looking for related rows'))
    expect(container.textContent).toBe('')
  })
})

describe('with children', () => {
  it('counts them against the referenced value', async () => {
    referencingKeys.mockResolvedValue({ success: true, data: [key()] })
    countRows.mockResolvedValue({ success: true, data: 7 })
    setup()

    expect(await screen.findByText('7')).toBeTruthy()
    expect(countRows).toHaveBeenCalledWith({
      connectionId: 'c1',
      schema: 'public',
      table: 'orders',
      filters: [{ column: 'user_id', operator: '=', value: '42' }],
      filterJoin: 'and'
    })
  })

  it('flags a cascade, because those rows go too', async () => {
    referencingKeys.mockResolvedValue({ success: true, data: [key({ onDelete: 'CASCADE' })] })
    setup()

    expect(await screen.findByText('cascade')).toBeTruthy()
  })

  it('leaves a plain restrict unflagged', async () => {
    referencingKeys.mockResolvedValue({ success: true, data: [key({ onDelete: 'RESTRICT' })] })
    setup()

    await screen.findByText('orders')
    expect(screen.queryByText('cascade')).toBeNull()
  })

  it('still shows the link when the count fails', async () => {
    referencingKeys.mockResolvedValue({ success: true, data: [key()] })
    countRows.mockResolvedValue({ success: false, error: 'permission denied' })
    setup()

    expect(await screen.findByText('orders')).toBeTruthy()
    expect(screen.getByText('-')).toBeTruthy()
  })

  it('does not offer to follow a key with no value to match', async () => {
    // `user_id = NULL` matches nothing, so a count would read as a real zero.
    referencingKeys.mockResolvedValue({ success: true, data: [key()] })
    setup({ id: null })

    expect(await screen.findByText(/no value to match/)).toBeTruthy()
    expect(countRows).not.toHaveBeenCalled()
    expect((screen.getByText('orders').closest('button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('qualifies a child that lives in another schema', async () => {
    referencingKeys.mockResolvedValue({ success: true, data: [key({ schema: 'billing' })] })
    setup()

    expect(await screen.findByText('billing.orders')).toBeTruthy()
  })
})

describe('when introspection fails', () => {
  it('says so instead of implying there are no relationships', async () => {
    referencingKeys.mockResolvedValue({ success: false, error: 'permission denied' })
    setup()

    expect(await screen.findByText(/Could not read relationships/)).toBeTruthy()
  })
})
