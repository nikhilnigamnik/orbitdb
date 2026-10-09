import * as React from 'react'

import { ErrorState } from '@renderer/components/common/error-state'

interface ErrorBoundaryProps {
  children: React.ReactNode
  /**
   * Clears a caught error when it changes. The route boundary passes the
   * location, so navigating away recovers without remounting a healthy tree on
   * every navigation, which keying the boundary itself would do.
   */
  resetKey?: string
}

interface ErrorBoundaryState {
  error: Error | null
  resetKey: string | undefined
}

function reloadWindow(): void {
  window.location.reload()
}

/** Turns one bad render into an error card instead of a blank window. */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState
  ): Partial<ErrorBoundaryState> | null {
    if (props.resetKey === state.resetKey) return null
    return { error: null, resetKey: props.resetKey }
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('Render failed', error, info.componentStack)
  }

  render(): React.ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex h-full w-full items-start justify-center overflow-auto bg-surface p-6">
        <div className="w-full max-w-xl">
          <ErrorState
            title="This view failed to render"
            message={error.message || String(error)}
            secondaryAction={{ label: 'Reload', onClick: reloadWindow }}
          />
        </div>
      </div>
    )
  }
}
