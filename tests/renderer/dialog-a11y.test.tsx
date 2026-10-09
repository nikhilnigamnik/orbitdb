// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConfirmDialog } from '@renderer/components/common/confirm-dialog'
import { Dialog, DialogDescription, DialogTitle } from '@renderer/components/ui/dialog'
import { Sheet, SheetTitle } from '@renderer/components/ui/sheet'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Dialog', () => {
  it('is announced by the title it is given, not as "Dialog"', async () => {
    render(
      <Dialog open setOpen={() => {}} title="Rename table" content={<input aria-label="Name" />} />
    )
    const dialog = await screen.findByRole('dialog', { name: 'Rename table' })
    // No stand-in "Dialog content" description read after the name.
    expect(dialog.hasAttribute('aria-describedby')).toBe(false)
    expect(screen.queryByText('Dialog content')).toBeNull()
  })

  it('reads a hidden description when given one', async () => {
    render(
      <Dialog
        open
        setOpen={() => {}}
        title="Find a value"
        description="Searches every table in this schema"
        content={<button type="button">Search</button>}
      />
    )
    const dialog = await screen.findByRole('dialog', { name: 'Find a value' })
    const describedBy = dialog.getAttribute('aria-describedby')
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      'Searches every table in this schema'
    )
  })

  it('takes its name from a visible DialogTitle, without a hidden duplicate', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <Dialog
        open
        setOpen={() => {}}
        content={
          <>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Press ? any time</DialogDescription>
          </>
        }
      />
    )
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
    const labelledBy = dialog.getAttribute('aria-labelledby')!
    expect(document.querySelectorAll(`[id="${labelledBy}"]`)).toHaveLength(1)
    expect(screen.queryByText('Dialog')).toBeNull()
    await waitFor(() => expect(consoleError).not.toHaveBeenCalled())
  })
})

describe('ConfirmDialog', () => {
  it('interrupts as an alertdialog named by its question', async () => {
    render(
      <ConfirmDialog
        isOpen
        onClose={() => {}}
        onConfirm={() => {}}
        title="Drop table users?"
        description="This cannot be undone."
        variant="danger"
      />
    )
    const dialog = await screen.findByRole('alertdialog', { name: 'Drop table users?' })
    const describedBy = dialog.getAttribute('aria-describedby')!
    expect(document.getElementById(describedBy)?.textContent).toBe('This cannot be undone.')
  })
})

describe('Sheet', () => {
  it('is announced by its title', async () => {
    render(<Sheet openSheet setOpenSheet={() => {}} title="Edit row" content={<p>fields</p>} />)
    expect(await screen.findByRole('dialog', { name: 'Edit row' })).toBeTruthy()
  })

  it('can name itself with a visible SheetTitle', async () => {
    render(
      <Sheet openSheet setOpenSheet={() => {}} content={<SheetTitle>New connection</SheetTitle>} />
    )
    expect(await screen.findByRole('dialog', { name: 'New connection' })).toBeTruthy()
  })

  it('moves focus inside on open, as a modal must', async () => {
    render(
      <Sheet
        openSheet
        setOpenSheet={() => {}}
        title="Edit row"
        content={<input aria-label="First field" />}
      />
    )
    const field = await screen.findByLabelText('First field')
    await waitFor(() => expect(document.activeElement).toBe(field))
  })

  it('leaves focus alone when the caller opts out', async () => {
    render(
      <Sheet
        openSheet
        setOpenSheet={() => {}}
        title="Edit row"
        onOpenAutoFocus={(event) => event.preventDefault()}
        content={<input aria-label="First field" />}
      />
    )
    const field = await screen.findByLabelText('First field')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(document.activeElement).not.toBe(field)
  })
})
