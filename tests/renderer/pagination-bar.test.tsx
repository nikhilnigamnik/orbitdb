// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaginationBar } from '@renderer/features/tables/components/pagination-bar'

afterEach(cleanup)

interface Overrides {
  offset?: number
  pageSize?: number
  loadedCount?: number
  totalEstimate?: number | null
  totalExact?: number | null
}

function setup(overrides: Overrides = {}) {
  const onChangePage = vi.fn()
  render(
    <PaginationBar
      offset={overrides.offset ?? 0}
      pageSize={overrides.pageSize ?? 50}
      loadedCount={overrides.loadedCount ?? 50}
      totalEstimate={overrides.totalEstimate ?? null}
      totalExact={overrides.totalExact ?? null}
      onChangePage={onChangePage}
      onChangePageSize={vi.fn()}
    />
  )
  return { onChangePage }
}

function pager(label: string): HTMLButtonElement {
  return screen.getByLabelText(label) as HTMLButtonElement
}

describe('the total it reports', () => {
  it('marks a statistic as approximate', () => {
    setup({ totalEstimate: 12345, totalExact: null })
    expect(screen.getByText(/~12,345/)).toBeTruthy()
  })

  it('drops the tilde once a real count arrives, and prefers it', () => {
    setup({ totalEstimate: 12345, totalExact: 87 })
    expect(screen.getByText('87')).toBeTruthy()
    expect(screen.queryByText(/~/)).toBeNull()
    expect(screen.queryByText(/12,345/)).toBeNull()
  })
})

describe('jumping to the last page', () => {
  it('is not offered against an estimate', () => {
    // Navigating to an offset derived from table statistics lands mid-table, or
    // past the end — the estimate is for reading, not for paging.
    setup({ totalEstimate: 10_000, totalExact: null })
    // Not merely disabled — the control is absent, so nothing suggests the jump
    // is available at all.
    expect(screen.queryByLabelText('Last page')).toBeNull()
  })

  it('lands on the final page when the count is real', () => {
    const { onChangePage } = setup({ pageSize: 50, totalExact: 120 })
    fireEvent.click(pager('Last page'))
    // 120 rows at 50 a page → three pages, the last starting at 100.
    expect(onChangePage).toHaveBeenCalledWith(100)
  })
})

describe('the next control', () => {
  it('stops at the end when the row count is an exact multiple of the page size', () => {
    // The old rule — "a full page means there is another" — left this enabled
    // onto an empty page.
    setup({ offset: 50, pageSize: 50, loadedCount: 50, totalExact: 100 })
    expect(pager('Next page').disabled).toBe(true)
  })

  it('stays live while rows remain', () => {
    setup({ offset: 0, pageSize: 50, loadedCount: 50, totalExact: 120 })
    expect(pager('Next page').disabled).toBe(false)
  })

  it('falls back to a full page meaning more when no count is known', () => {
    setup({ offset: 0, pageSize: 50, loadedCount: 50, totalExact: null })
    expect(pager('Next page').disabled).toBe(false)

    cleanup()
    setup({ offset: 0, pageSize: 50, loadedCount: 20, totalExact: null })
    expect(pager('Next page').disabled).toBe(true)
  })
})

describe('going back', () => {
  it('is disabled on the first page and live after it', () => {
    setup({ offset: 0 })
    expect(pager('Previous page').disabled).toBe(true)
    expect(pager('First page').disabled).toBe(true)

    cleanup()
    setup({ offset: 50 })
    expect(pager('Previous page').disabled).toBe(false)
  })
})
