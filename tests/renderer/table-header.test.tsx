// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TableHeader } from '@renderer/features/database/components/table-header'
import type { TableDetails } from '@renderer/types'

afterEach(cleanup)

function details(overrides: Partial<TableDetails> = {}): TableDetails {
  return {
    schema: 'public',
    name: 'users',
    type: 'table',
    columns: [
      {
        name: 'id',
        dataType: 'integer',
        udtName: 'int4',
        isNullable: false,
        isPrimaryKey: true,
        defaultValue: null,
        ordinalPosition: 1,
        characterMaximumLength: null,
        enumValues: null
      }
    ],
    primaryKey: ['id'],
    indexes: [],
    foreignKeys: [],
    estimatedRows: null,
    ...overrides
  }
}

function setup(overrides: Partial<TableDetails> = {}, totalRows: number | null = null) {
  render(
    <TableHeader
      details={details(overrides)}
      activeTab="data"
      onChangeTab={vi.fn()}
      totalRows={totalRows}
    />
  )
}

describe('the row count', () => {
  it('reports a counted total plainly', () => {
    setup({ estimatedRows: 1_000_000 }, 1234)
    expect(screen.getByText('1,234')).toBeTruthy()
    // The estimate must not win over a real count, or the header contradicts
    // the pagination bar on the same screen.
    expect(screen.queryByText(/1,000,000/)).toBeNull()
    expect(screen.queryByText(/~/)).toBeNull()
  })

  it('falls back to the estimate, marked approximate, when the count is skipped', () => {
    setup({ estimatedRows: 5_000_000 }, null)
    expect(screen.getByText(/~5,000,000/)).toBeTruthy()
  })

  it('says nothing rather than guessing when neither is known', () => {
    // D1 has no row statistic at all, so this used to be its permanent state.
    setup({ estimatedRows: null }, null)
    expect(screen.queryByText(/rows?$/)).toBeNull()
  })

  it('counts zero rows as a real answer, not as unknown', () => {
    setup({}, 0)
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('says row, not rows, for a single one', () => {
    setup({}, 1)
    expect(screen.getByText(/\brow\b/)).toBeTruthy()
  })
})

describe('what kind of relation it is', () => {
  it('badges a view, which cannot take DDL', () => {
    setup({ type: 'view' })
    expect(screen.getByText('View')).toBeTruthy()
  })

  it('badges a materialized view', () => {
    setup({ type: 'materialized_view' })
    expect(screen.getByText('Materialized view')).toBeTruthy()
  })

  it('leaves a plain table unbadged, since that is the default', () => {
    setup({ type: 'table' })
    expect(screen.queryByText(/^View$|^Materialized view$/)).toBeNull()
  })
})

describe('hierarchy', () => {
  it('sets the name apart from its metadata by size, not only weight', () => {
    setup({ estimatedRows: 10 })
    const name = screen.getByRole('heading', { level: 2 })
    expect(name.className).toContain('text-xs')

    const schema = screen.getByText('public')
    expect(schema.parentElement?.className).toContain('text-[10px]')
  })

  it('carries no leftover group class for a control that moved away', () => {
    const { container } = render(
      <TableHeader details={details()} activeTab="data" onChangeTab={vi.fn()} totalRows={null} />
    )
    expect(container.innerHTML).not.toContain('group/header')
  })
})
