// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SortChip } from '@renderer/features/tables/components/sort-chip'
import { columnTypeKind } from '@renderer/features/tables/components/column-type-icon'
import type { ColumnInfo, SortDirection } from '@renderer/types'

afterEach(cleanup)

function column(name: string, udtName = 'text', overrides: Partial<ColumnInfo> = {}): ColumnInfo {
  return {
    name,
    dataType: udtName,
    udtName,
    isNullable: true,
    isPrimaryKey: false,
    defaultValue: null,
    ordinalPosition: 1,
    characterMaximumLength: null,
    enumValues: null,
    ...overrides
  }
}

const columns = [column('id', 'int4'), column('name')]

function setup(orderBy: string | null, orderDir: SortDirection = 'asc') {
  const onChange = vi.fn()
  render(<SortChip columns={columns} orderBy={orderBy} orderDir={orderDir} onChange={onChange} />)
  return onChange
}

/** Radix opens on pointerdown, which fireEvent.click does not imply. */
function open(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
  fireEvent.click(trigger)
}

describe('the sort chip', () => {
  it('is a dashed prompt while nothing is sorted', () => {
    setup(null)
    const trigger = screen.getByText('Sort').closest('button')!
    expect(trigger.className).toContain('border-dashed')
  })

  it('sorts ascending by the column picked', async () => {
    const onChange = setup(null)
    open(screen.getByText('Sort').closest('button')!)
    fireEvent.click(await screen.findByText('name'))
    expect(onChange).toHaveBeenCalledWith('name', 'asc')
  })

  it('names the sorted column and its direction once applied', () => {
    setup('name', 'desc')
    expect(screen.getByText('name')).toBeTruthy()
    expect(screen.getByText('descending')).toBeTruthy()
  })

  it('removes the sort without opening the picker', () => {
    const onChange = setup('name', 'desc')
    fireEvent.click(screen.getByLabelText('Remove sort'))
    expect(onChange).toHaveBeenCalledWith(null, 'asc')
    expect(screen.queryByLabelText('Search columns to sort by')).toBeNull()
  })

  it('flips the direction from the picker, keeping the column', async () => {
    const onChange = setup('name', 'asc')
    open(screen.getByTitle('Change the sort'))
    fireEvent.click(await screen.findByText('Descending'))
    expect(onChange).toHaveBeenCalledWith('name', 'desc')
  })
})

describe('the column type icon', () => {
  it('reads the kind off the normalised udt name', () => {
    expect(columnTypeKind(column('n', 'int8'))).toBe('number')
    expect(columnTypeKind(column('n', 'float8'))).toBe('number')
    expect(columnTypeKind(column('b', 'bool'))).toBe('boolean')
    expect(columnTypeKind(column('t', 'timestamptz'))).toBe('date')
    expect(columnTypeKind(column('j', 'jsonb'))).toBe('json')
    expect(columnTypeKind(column('u', 'uuid'))).toBe('uuid')
    expect(columnTypeKind(column('a', '_int4'))).toBe('array')
    expect(columnTypeKind(column('s', 'text'))).toBe('text')
  })

  it('marks an enum by its labels, since Postgres calls every enum USER-DEFINED', () => {
    const status = column('status', 'mood', { dataType: 'USER-DEFINED', enumValues: ['a', 'b'] })
    expect(columnTypeKind(status)).toBe('enum')
  })

  it('lets a primary key win over its type', () => {
    expect(columnTypeKind(column('id', 'int4', { isPrimaryKey: true }))).toBe('key')
  })
})
