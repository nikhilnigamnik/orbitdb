// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from '@renderer/components/ui/toast'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** Fires a toast on click, so the test drives the same API the app does. */
function Trigger({ fire }: { fire: (toast: ReturnType<typeof useToast>) => void }) {
  const toast = useToast()
  return (
    <button type="button" onClick={() => fire(toast)}>
      fire
    </button>
  )
}

function setup(fire: (toast: ReturnType<typeof useToast>) => void) {
  render(
    <ToastProvider>
      <Trigger fire={fire} />
    </ToastProvider>
  )
  fireEvent.click(screen.getByText('fire'))
}

describe('what a toast shows', () => {
  it('a success', async () => {
    setup((toast) => toast.success('Row deleted'))
    expect(await screen.findByText('Row deleted')).toBeTruthy()
  })

  it('a failure, with the driver message under it', async () => {
    setup((toast) =>
      toast.error('Delete failed', { description: 'violates foreign key constraint' })
    )
    expect(await screen.findByText('Delete failed')).toBeTruthy()
    expect(await screen.findByText(/violates foreign key constraint/)).toBeTruthy()
  })

  it('a repeat as a count, not as a second toast', async () => {
    setup((toast) => toast.error('Could not load rows'))
    fireEvent.click(screen.getByText('fire'))

    expect(await screen.findByText('×2')).toBeTruthy()
    expect(screen.getAllByText('Could not load rows')).toHaveLength(1)
  })
})

describe('the action button', () => {
  it('runs what it was given', async () => {
    const onRefresh = vi.fn()
    setup((toast) =>
      toast.error('Could not load rows', {
        action: { label: 'Refresh', onClick: onRefresh }
      })
    )

    fireEvent.click(await screen.findByText('Refresh'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})

describe('leaving', () => {
  it('on the close control', async () => {
    setup((toast) => toast.info('Copied'))
    await screen.findByText('Copied')

    fireEvent.click(screen.getByLabelText('Dismiss'))
    await waitFor(() => expect(screen.queryByText('Copied')).toBeNull())
  })

  it('on its own, once its time is up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup((toast) => toast.success('Saved', { duration: 1_000 }))
    await screen.findByText('Saved')

    await act(async () => {
      vi.advanceTimersByTime(1_500)
    })
    await waitFor(() => expect(screen.queryByText('Saved')).toBeNull())
  })
})

describe('without a provider', () => {
  it('says so, rather than failing somewhere later', () => {
    // Silently no-oping would lose errors the user needed to see.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger fire={() => {}} />)).toThrow(/ToastProvider/)
    quiet.mockRestore()
  })
})
