// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CascadeDeleteDialog } from '@renderer/features/tables/components/cascade-delete-dialog'
import type { CascadeDeletePlan } from '@renderer/types'

const cascadePlan = vi.fn()
const cascadeDelete = vi.fn()

beforeEach(() => {
  cascadePlan.mockReset()
  cascadeDelete.mockReset()
  Object.assign(window, { api: { db: { cascadePlan, cascadeDelete } } })
})

afterEach(cleanup)

function plan(overrides: Partial<CascadeDeletePlan> = {}): CascadeDeletePlan {
  return {
    schema: 'public',
    table: 'users',
    targetRows: 1,
    steps: [],
    detached: [],
    totalRows: 0,
    isTruncated: false,
    failures: [],
    ...overrides
  }
}

function show(found: CascadeDeletePlan) {
  cascadePlan.mockResolvedValue({ success: true, data: found })
  render(
    <CascadeDeleteDialog
      isOpen
      onClose={vi.fn()}
      connectionId="c1"
      schema="public"
      table="users"
      pks={[{ id: 1 }]}
      onDeleted={vi.fn()}
    />
  )
}

describe('the cascade delete dialog', () => {
  it('does not claim nothing depends on a row that has detached children', async () => {
    // SET NULL children never become steps - they are kept with the reference
    // cleared - so gating the empty state on `steps` alone printed "nothing
    // depends on this" directly above a list of things that do.
    show(
      plan({
        detached: [
          {
            schema: 'public',
            table: 'audit_log',
            columns: ['user_id'],
            constraintName: 'audit_log_user_fk',
            onDelete: 'SET NULL',
            rowCount: 1204
          }
        ]
      })
    )

    await waitFor(() => expect(screen.getByText('Kept, reference cleared')).toBeTruthy())
    expect(screen.queryByText(/Nothing depends on/)).toBeNull()
    expect(screen.getByText('1,204')).toBeTruthy()
  })

  it('still says so when genuinely nothing depends on the row', async () => {
    show(plan())
    await waitFor(() => expect(screen.getByText(/Nothing depends on this row/)).toBeTruthy())
    expect(screen.queryByText('Kept, reference cleared')).toBeNull()
  })

  it('promises the row count the plan actually carries', async () => {
    show(
      plan({
        steps: [
          {
            schema: 'public',
            table: 'notifications',
            columns: ['recipient_id'],
            constraintName: 'notifications_recipient_fk',
            parentSchema: 'public',
            parentTable: 'users',
            depth: 1,
            rowCount: 2,
            onDelete: 'NO ACTION'
          }
        ],
        // Deliberately not the sum of the steps: a table reached twice is
        // counted once, and this is the number the button repeats.
        totalRows: 3
      })
    )

    // 3 dependents plus the target row.
    await waitFor(() => expect(screen.getByText('Delete 4')).toBeTruthy())
  })
})
