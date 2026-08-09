// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { AiKeyRequired, isMissingAiKeyError } from '@renderer/components/common/ai-key-required'
import { QueryResults } from '@renderer/features/query/components/query-results'
import { MISSING_AI_KEY_MESSAGE } from '@renderer/config/site'
import { ROUTES } from '@renderer/config/routes'
import type { QueryResult } from '@renderer/types'

afterEach(cleanup)

function failedQuery(error: string): QueryResult {
  return {
    success: false,
    error,
    rows: [],
    fields: [],
    rowCount: null,
    command: null,
    durationMs: 0,
    truncated: false
  }
}

describe('telling "not set up" apart from "broken"', () => {
  it('recognises the message main actually throws', () => {
    // Both sides read the constant, so a reworded message cannot drift apart.
    expect(isMissingAiKeyError(MISSING_AI_KEY_MESSAGE)).toBe(true)
  })

  it('does not swallow a real failure that mentions a key', () => {
    expect(isMissingAiKeyError('invalid x-api-key')).toBe(false)
    expect(isMissingAiKeyError(null)).toBe(false)
  })
})

describe('the query pane', () => {
  it('offers the way in rather than a red error box', () => {
    render(
      <MemoryRouter>
        <QueryResults result={failedQuery(MISSING_AI_KEY_MESSAGE)} isRunning={false} />
      </MemoryRouter>
    )

    expect(screen.getByText('Add an Anthropic API key')).toBeTruthy()
    expect(screen.queryByText('Error'), 'nothing is broken, so nothing says so').toBeNull()
  })

  it('still shows a genuine query error as an error', () => {
    render(
      <MemoryRouter>
        <QueryResults result={failedQuery('relation "users" does not exist')} isRunning={false} />
      </MemoryRouter>
    )

    expect(screen.getByText('Error')).toBeTruthy()
    expect(screen.getByText(/relation "users" does not exist/)).toBeTruthy()
  })
})

describe('the prompt itself', () => {
  it('goes to Settings, closing whatever it sits inside first', () => {
    let wasClosed = false
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AiKeyRequired onNavigate={() => (wasClosed = true)} />} />
          <Route path={ROUTES.settings} element={<h1>Settings page</h1>} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText('Open settings'))

    expect(wasClosed, 'a sheet left open would cover the page it navigated to').toBe(true)
    expect(screen.getByText('Settings page')).toBeTruthy()
  })
})
