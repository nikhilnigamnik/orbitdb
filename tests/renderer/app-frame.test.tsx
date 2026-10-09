// @vitest-environment jsdom
import * as React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from '@renderer/components/common/error-boundary'
import { ErrorState } from '@renderer/components/common/error-state'
import { LoadingState } from '@renderer/components/common/loading-state'
import { SlidingHoverList } from '@renderer/components/ui/sliding-hover-list'
import { hasOpenOverlay, isTyping } from '@renderer/lib/keyboard'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Broken({ message }: { message: string }): React.ReactNode {
  throw new Error(message)
}

describe('ErrorBoundary', () => {
  it('turns a render failure into an error card with a way out', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary resetKey="a">
        <Broken message="Unknown provider: mistral" />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert').textContent).toContain('Unknown provider: mistral')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
  })

  it('recovers when the reset key changes, as navigating away does', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(
      <ErrorBoundary resetKey="settings">
        <Broken message="boom" />
      </ErrorBoundary>
    )
    expect(screen.queryByRole('alert')).not.toBeNull()

    rerender(
      <ErrorBoundary resetKey="connections">
        <p>Connections</p>
      </ErrorBoundary>
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Connections')).toBeTruthy()
  })

  it('does not remount a healthy tree when the key changes', () => {
    const mounts = vi.fn()
    function Probe() {
      React.useEffect(() => mounts(), [])
      return null
    }
    const { rerender } = render(
      <ErrorBoundary resetKey="a">
        <Probe />
      </ErrorBoundary>
    )
    rerender(
      <ErrorBoundary resetKey="b">
        <Probe />
      </ErrorBoundary>
    )
    expect(mounts).toHaveBeenCalledTimes(1)
  })
})

describe('live regions', () => {
  it('announces an error as an alert', () => {
    render(<ErrorState message="connection refused" />)
    expect(screen.getByRole('alert').textContent).toContain('connection refused')
  })

  it('announces loading as a status, labelled even without visible text', () => {
    render(<LoadingState />)
    expect(screen.getByRole('status').textContent).toBe('Loading')
  })

  it('uses the visible label when there is one', () => {
    render(<LoadingState label="Loading tables" />)
    expect(screen.getByRole('status').textContent).toBe('Loading tables')
  })
})

describe('keyboard helpers', () => {
  it('treats fields and the SQL editor as typing, and buttons as not', () => {
    render(
      <>
        <input aria-label="field" />
        <div className="cm-editor">
          <div data-testid="cm" />
        </div>
        <button type="button">Go</button>
      </>
    )
    expect(isTyping(screen.getByLabelText('field'))).toBe(true)
    expect(isTyping(screen.getByTestId('cm'))).toBe(true)
    expect(isTyping(screen.getByText('Go'))).toBe(false)
    expect(isTyping(document)).toBe(false)
  })

  it('sees an open dialog or menu, and ignores a closed one', () => {
    const { rerender } = render(<div role="dialog" data-state="closed" />)
    expect(hasOpenOverlay()).toBe(false)
    rerender(<div role="dialog" data-state="open" />)
    expect(hasOpenOverlay()).toBe(true)
    rerender(<div role="menu" data-state="open" />)
    expect(hasOpenOverlay()).toBe(true)
  })
})

describe('SlidingHoverList', () => {
  it('re-renders only the rows whose hover state changed', () => {
    const renders = new Map<number, number>()
    const items = Array.from({ length: 20 }, (_, i) => i)
    render(
      <SlidingHoverList as="div">
        {items.map((i) => (
          <SlidingHoverList.Item as="div" key={i} index={i}>
            {(isActive) => {
              renders.set(i, (renders.get(i) ?? 0) + 1)
              return <span data-testid={`row-${i}`}>{isActive ? 'on' : 'off'}</span>
            }}
          </SlidingHoverList.Item>
        ))}
      </SlidingHoverList>
    )
    const baseline = new Map(renders)

    act(() => {
      fireEvent.mouseEnter(screen.getByTestId('row-3').parentElement!)
    })
    act(() => {
      fireEvent.mouseEnter(screen.getByTestId('row-4').parentElement!)
    })

    expect(screen.getByTestId('row-4').textContent).toBe('on')
    expect(screen.getByTestId('row-3').textContent).toBe('off')
    const rerendered = items.filter((i) => renders.get(i) !== baseline.get(i))
    expect(rerendered).toEqual([3, 4])
  })
})
