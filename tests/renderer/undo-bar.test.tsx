// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataGrid } from '@renderer/features/tables/components/data-grid'
import type { ColumnInfo } from '@renderer/types'

afterEach(cleanup)

function column(name: string, udtName = 'text'): ColumnInfo {
  return {
    name,
    dataType: udtName,
    udtName,
    isNullable: true,
    isPrimaryKey: name === 'id',
    defaultValue: null,
    ordinalPosition: 1,
    characterMaximumLength: null,
    enumValues: null
  }
}

const rows = [
  { id: 1, status: 'active' },
  { id: 2, status: 'archived' }
]

function setup(pendingUndoRow: Record<string, unknown> | null) {
  return render(
    <DataGrid
      columns={[column('id', 'int4'), column('status')]}
      rows={rows}
      orderBy={null}
      orderDir="asc"
      onSort={vi.fn()}
      onEditRow={vi.fn()}
      onDeleteRow={vi.fn()}
      canMutate={false}
      pendingUndoRow={pendingUndoRow}
    />
  )
}

/** The <tr> holding a given cell value. */
function rowFor(text: string): HTMLElement {
  return screen.getByText(text).closest('tr')!
}

describe('the row a pending undo belongs to', () => {
  it('is marked out, since a truncated key could never identify it', () => {
    setup({ id: 2 })
    expect(rowFor('archived').className).toContain('outline-accent/40')
  })

  it('leaves the other rows alone', () => {
    setup({ id: 2 })
    expect(rowFor('active').className).not.toContain('outline-accent/40')
  })

  it('marks nothing when no undo is pending', () => {
    const { container } = setup(null)
    expect(container.innerHTML).not.toContain('outline-accent/40')
  })

  it('matches on every part of a composite key, not just the first', () => {
    // A partial match would light up the wrong row on a composite key.
    setup({ id: 2, status: 'something else' })
    expect(rowFor('archived').className).not.toContain('outline-accent/40')
  })
})
