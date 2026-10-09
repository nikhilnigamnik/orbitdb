// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RowEditorSheet } from '@renderer/features/tables/components/row-editor-sheet'
import type { ColumnInfo } from '@renderer/types'

afterEach(cleanup)

const COLUMNS: ColumnInfo[] = [
  {
    name: 'note',
    dataType: 'text',
    udtName: 'text',
    isNullable: true,
    isPrimaryKey: false,
    defaultValue: null,
    ordinalPosition: 1,
    characterMaximumLength: null,
    enumValues: null
  }
]

function mount() {
  const onClose = vi.fn()
  render(
    <RowEditorSheet
      isOpen
      onClose={onClose}
      mode="edit"
      columns={COLUMNS}
      initialValues={{ note: 'hello' }}
      onSubmit={vi.fn()}
    />
  )
  return { onClose }
}

describe('closing the row editor', () => {
  it('closes at once when nothing was changed', () => {
    const { onClose } = mount()
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('asks before throwing away an edit on Escape', async () => {
    const { onClose } = mount()
    fireEvent.change(screen.getByDisplayValue('hello'), { target: { value: 'changed' } })
    fireEvent.keyDown(screen.getByDisplayValue('changed'), { key: 'Escape' })

    expect(await screen.findByText('Discard unsaved changes?')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Keep editing'))
    await waitFor(() => expect(screen.queryByText('Discard unsaved changes?')).toBeNull())
    expect(screen.getByDisplayValue('changed')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes once the discard is confirmed', async () => {
    const { onClose } = mount()
    fireEvent.change(screen.getByDisplayValue('hello'), { target: { value: 'changed' } })
    fireEvent.click(screen.getByText('Cancel'))

    fireEvent.click(await screen.findByText('Discard'))
    expect(onClose).toHaveBeenCalled()
  })

  it('names each NULL switch after its column', () => {
    mount()
    expect(screen.getByRole('switch', { name: 'note is NULL' })).toBeTruthy()
  })
})
