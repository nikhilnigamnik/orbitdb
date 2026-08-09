// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StructureAi } from '@renderer/features/database/components/structure-ai'

afterEach(cleanup)

function ok<T>(data: T) {
  return Promise.resolve({ success: true as const, data })
}

const SUGGESTION = {
  name: 'idx_users_email',
  columns: ['email'],
  isUnique: true,
  rationale: 'Looked up on every login.'
}

function setup(overrides: Record<string, unknown> = {}) {
  const ddlPreview = vi.fn(() =>
    ok('create unique index "idx_users_email" on "public"."users" ("email")')
  )
  const ddlExecute = vi.fn(() => ok(undefined))
  Object.assign(window, {
    api: {
      ai: { suggestIndexes: () => ok({ suggestions: [SUGGESTION] }) },
      db: { ddlPreview, ddlExecute, ...overrides }
    }
  })
  render(
    <MemoryRouter>
      <StructureAi connectionId="c1" schema="public" table="users" canEdit onApplied={vi.fn()} />
    </MemoryRouter>
  )
  return { ddlPreview, ddlExecute }
}

/** Opens the suggestions sheet from the structure toolbar. */
async function openSuggestions() {
  fireEvent.click(await screen.findByText('Suggest indexes'))
}

describe('an index the model suggested', () => {
  it('shows the statement it would run before you can run it', async () => {
    // Every other DDL path previews first, and this one is a guess — README
    // promises "every statement is previewed before it runs".
    setup()
    await openSuggestions()

    expect(await screen.findByText(/create unique index "idx_users_email"/)).toBeTruthy()
  })

  it('does not touch the database to build that preview', async () => {
    const { ddlExecute } = setup()
    await openSuggestions()
    await screen.findByText(/create unique index/)

    expect(ddlExecute, 'previewing must not execute').not.toHaveBeenCalled()
  })

  it('runs the same statement it showed, once created', async () => {
    const { ddlPreview, ddlExecute } = setup()
    await openSuggestions()
    await screen.findByText(/create unique index/)

    fireEvent.click(screen.getByText('Create'))

    await waitFor(() => expect(ddlExecute).toHaveBeenCalled())
    expect(ddlExecute.mock.calls[0][0]).toEqual(ddlPreview.mock.calls[0][0])
  })

  it('still lists the suggestion when the preview cannot be built', async () => {
    // A failed preview is not a reason to hide the suggestion entirely.
    setup({ ddlPreview: () => Promise.resolve({ success: false, error: 'unsupported' }) })
    await openSuggestions()

    expect(await screen.findByText('idx_users_email')).toBeTruthy()
  })
})
