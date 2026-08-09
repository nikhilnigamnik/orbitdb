// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CellInlineEditor } from '@renderer/features/tables/components/cell-inline-editor'
import type { ColumnInfo } from '@renderer/types'

afterEach(cleanup)

function column(overrides: Partial<ColumnInfo> = {}): ColumnInfo {
  return {
    name: 'status',
    dataType: 'text',
    udtName: 'text',
    isNullable: true,
    isPrimaryKey: false,
    defaultValue: null,
    ordinalPosition: 1,
    characterMaximumLength: null,
    enumValues: null,
    ...overrides
  }
}

function setup(col: ColumnInfo, value: unknown, onSave = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn()
  const onDirtyChange = vi.fn()
  render(
    <CellInlineEditor
      column={col}
      value={value}
      onSave={onSave}
      onClose={onClose}
      onDirtyChange={onDirtyChange}
    />
  )
  return { onSave, onClose, onDirtyChange }
}

describe('a rejected write', () => {
  it('is reported on a text cell', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('violates check constraint'))
    setup(column(), 'a', onSave)

    const input = screen.getByDisplayValue('a')
    fireEvent.change(input, { target: { value: 'b' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByText(/violates check constraint/)).toBeTruthy()
  })

  it('is reported on an enum cell, which used to fail in silence', async () => {
    // The select branch never rendered the error state, so a rejected write on
    // a bool or enum cell showed nothing at all.
    const onSave = vi.fn().mockRejectedValue(new Error('invalid input value for enum'))
    const { onClose } = setup(column({ enumValues: ['draft', 'live'] }), 'draft', onSave)

    fireEvent.click(await screen.findByText('live'))

    expect(await screen.findByText(/invalid input value for enum/)).toBeTruthy()
    expect(onClose, 'a failed save must not look like a successful one').not.toHaveBeenCalled()
  })

  it('is reported on a boolean cell', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('not-null violation'))
    setup(column({ udtName: 'bool' }), true, onSave)

    fireEvent.click(await screen.findByText('false'))
    expect(await screen.findByText(/not-null violation/)).toBeTruthy()
  })
})

describe('dirtiness', () => {
  it('is reported so the cell can show unsaved changes', () => {
    const { onDirtyChange } = setup(column(), 'a')
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)

    fireEvent.change(screen.getByDisplayValue('a'), { target: { value: 'ab' } })
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })

  it('is cleared again when the value is typed back', () => {
    const { onDirtyChange } = setup(column(), 'a')
    const input = screen.getByDisplayValue('a')
    fireEvent.change(input, { target: { value: 'ab' } })
    fireEvent.change(input, { target: { value: 'a' } })
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })
})

describe('committing', () => {
  it('does not write when nothing was typed', () => {
    const { onSave, onClose } = setup(column(), 'a')
    fireEvent.keyDown(screen.getByDisplayValue('a'), { key: 'Enter' })

    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('writes the typed value on Enter', async () => {
    const { onSave } = setup(column(), 'a')
    const input = screen.getByDisplayValue('a')
    fireEvent.change(input, { target: { value: 'b' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('b'))
  })

  it('abandons the edit on Escape', () => {
    const { onSave, onClose } = setup(column(), 'a')
    const input = screen.getByDisplayValue('a')
    fireEvent.change(input, { target: { value: 'b' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('leaves an IME candidate alone rather than treating Enter as a commit', () => {
    const { onSave } = setup(column(), 'a')
    const input = screen.getByDisplayValue('a')
    fireEvent.change(input, { target: { value: 'b' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })

    expect(onSave).not.toHaveBeenCalled()
  })

  it('writes null on the null shortcut, for a column that allows it', async () => {
    const { onSave } = setup(column(), 'a')
    fireEvent.keyDown(screen.getByDisplayValue('a'), { key: 'Backspace', metaKey: true })

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null))
  })

  it('ignores the null shortcut on a column that forbids it', () => {
    const { onSave } = setup(column({ isNullable: false }), 'a')
    fireEvent.keyDown(screen.getByDisplayValue('a'), { key: 'Backspace', metaKey: true })

    expect(onSave).not.toHaveBeenCalled()
  })
})
