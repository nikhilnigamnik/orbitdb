// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTableDestructiveActions } from '@renderer/features/database/lib/use-table-destructive-actions'
import { onSchemaTablesChanged } from '@renderer/features/database/lib/schema-events'
import { loadPinned, savePinned } from '@renderer/features/database/lib/table-prefs'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

function ok<T>(data: T) {
  return Promise.resolve({ success: true as const, data })
}

function Harness() {
  const { requestDrop, confirmDialog } = useTableDestructiveActions({
    connectionId: 'c1',
    schema: 'public',
    table: 'users'
  })
  return (
    <>
      <button onClick={requestDrop}>drop</button>
      {confirmDialog}
    </>
  )
}

describe('dropping a table', () => {
  it('unpins it before telling the sidebar the table list changed', async () => {
    Object.assign(window, {
      api: { db: { ddlPreview: () => ok('drop table users'), ddlExecute: () => ok(undefined) } }
    })
    savePinned('c1', [
      { schema: 'public', table: 'users' },
      { schema: 'public', table: 'orders' }
    ])
    const pinsSeenByListener: unknown[] = []
    const listener = vi.fn(() => pinsSeenByListener.push(loadPinned('c1')))
    const unsubscribe = onSchemaTablesChanged(listener)

    render(<Harness />)
    fireEvent.click(screen.getByText('drop'))
    fireEvent.click(await screen.findByRole('button', { name: 'Drop' }))

    await waitFor(() => expect(listener).toHaveBeenCalledWith('c1', 'public'))
    expect(pinsSeenByListener[0]).toEqual([{ schema: 'public', table: 'orders' }])
    unsubscribe()
  })
})
