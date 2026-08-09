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
    isPrimaryKey: false,
    defaultValue: null,
    ordinalPosition: 1,
    characterMaximumLength: null,
    enumValues: null
  }
}

function setup(columns: ColumnInfo[], rows: Record<string, unknown>[], canMutate = false) {
  return render(
    <DataGrid
      columns={columns}
      rows={rows}
      orderBy={null}
      orderDir="asc"
      onSort={vi.fn()}
      onEditRow={vi.fn()}
      onDeleteRow={vi.fn()}
      canMutate={canMutate}
    />
  )
}

describe('blank strings', () => {
  it('quotes an empty string so it is not an empty cell', () => {
    setup([column('note')], [{ note: '' }])
    expect(screen.getByText("''")).toBeTruthy()
  })

  it('quotes whitespace, which is otherwise identical to empty', () => {
    setup([column('note')], [{ note: '  ' }])
    // The default matcher collapses whitespace, which would defeat the point.
    expect(screen.getByText("'  '", { normalizer: (text) => text })).toBeTruthy()
  })

  it('still names null distinctly', () => {
    setup([column('note')], [{ note: null }])
    expect(screen.getByText('NULL')).toBeTruthy()
  })

  it('leaves a value with visible characters unquoted', () => {
    setup([column('note')], [{ note: ' hi ' }])
    expect(screen.queryByText("' hi '")).toBeNull()
  })
})

describe('binary cells', () => {
  it('shows a size rather than the bytes', () => {
    setup([column('thumb', 'bytea')], [{ thumb: new Uint8Array([1, 2, 3]) }])
    expect(screen.getByText('<binary, 3 B>')).toBeTruthy()
  })
})

describe('timestamps', () => {
  it('carries the offset for a timestamptz, as the editor does', () => {
    setup([column('created_at', 'timestamptz')], [{ created_at: new Date('2026-08-09T12:00:00Z') }])
    expect(screen.getByText(/[+-]\d{2}:\d{2}$/)).toBeTruthy()
  })
})

describe('row controls', () => {
  it('reveals the row actions on keyboard focus, not on hover alone', () => {
    // Hover-only would leave anyone tabbing through the grid with invisible
    // controls.
    const { container } = setup([column('id')], [{ id: 1 }], true)
    const actions = container.querySelector('[class*="group-hover:opacity-100"]')
    expect(actions, 'no revealed-on-hover control found').not.toBeNull()
    expect(actions!.className).toContain('focus-within:opacity-100')
  })
})
