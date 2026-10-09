import { useState } from 'react'
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconSelector
} from '@tabler/icons-react'
import { Popover } from '@renderer/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { PAGE_SIZE_OPTIONS } from '@renderer/config/site'
import { formatNumber } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'

interface PaginationBarProps {
  offset: number
  pageSize: number
  loadedCount: number
  /** Approximate, from table statistics - never used to navigate. */
  totalEstimate: number | null
  /** Real count for the current filters, once known. */
  totalExact: number | null
  onChangePage: (offset: number) => void
  onChangePageSize: (size: number) => void
}

export function PaginationBar({
  offset,
  pageSize,
  loadedCount,
  totalEstimate,
  totalExact,
  onChangePage,
  onChangePageSize
}: PaginationBarProps) {
  const [isPageSizeOpen, setIsPageSizeOpen] = useState(false)
  const start = loadedCount === 0 ? 0 : offset + 1
  const end = offset + loadedCount
  const hasPrev = offset > 0
  // A full page used to imply another one, which left Next live on a table whose
  // length is an exact multiple of the page size. The real count settles it.
  const hasNext = totalExact != null ? end < totalExact : loadedCount >= pageSize
  const currentPage = Math.floor(offset / pageSize) + 1
  // Paging is only offered against a real count - jumping to a page derived from
  // table statistics lands mid-table, or past the end.
  const totalPages = totalExact != null ? Math.max(1, Math.ceil(totalExact / pageSize)) : null
  const lastOffset = totalPages != null ? (totalPages - 1) * pageSize : null
  const shownTotal = totalExact ?? totalEstimate
  const isExact = totalExact != null

  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-4 text-xs text-text-muted">
      <div className="flex items-center gap-1">
        <span className="inline-flex items-center gap-0.5 font-medium text-text tabular-nums">
          {formatNumber(start)}
          <span className="text-text-subtle">-</span>
          {formatNumber(end)}
        </span>
        {shownTotal != null && (
          <span>
            of{' '}
            <span className="font-medium text-text tabular-nums">
              {isExact ? '' : '~'}
              {formatNumber(shownTotal)}
            </span>{' '}
            rows
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <Popover
            openPopover={isPageSizeOpen}
            setOpenPopover={setIsPageSizeOpen}
            align="end"
            side="top"
            sideOffset={6}
            popoverContentClassName="p-1 min-w-[7rem]"
            content={
              <div className="flex flex-col">
                {PAGE_SIZE_OPTIONS.map((size) => {
                  const isSelected = size === pageSize
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        onChangePageSize(size)
                        setIsPageSizeOpen(false)
                      }}
                      className={cn(
                        'flex h-8 cursor-pointer items-center justify-between gap-2 rounded-md px-2 text-xs text-text tabular-nums transition-colors hover:bg-surface-elevated',
                        isSelected && 'font-medium'
                      )}
                    >
                      <span>{size}</span>
                      {isSelected && <IconCheck size={14} className="text-accent-text" />}
                    </button>
                  )
                })}
              </div>
            }
          >
            <button
              type="button"
              aria-label="Rows per page"
              className="flex h-7 cursor-pointer items-center gap-1 rounded-lg bg-surface pr-1.5 pl-2 text-xs font-medium text-text shadow-control transition-colors hover:bg-surface-elevated aria-expanded:bg-surface-elevated"
            >
              <span className="tabular-nums">{pageSize}</span>
              <IconSelector size={14} className="text-text-subtle" />
            </button>
          </Popover>
        </div>

        <div className="flex items-center gap-0.5">
          <PagerButton label="First page" disabled={!hasPrev} onClick={() => onChangePage(0)}>
            <IconChevronsLeft size={14} />
          </PagerButton>
          <PagerButton
            label="Previous page"
            disabled={!hasPrev}
            onClick={() => onChangePage(Math.max(0, offset - pageSize))}
          >
            <IconChevronLeft size={14} />
          </PagerButton>

          <div className="flex select-none items-center gap-1 px-1.5 tabular-nums">
            <span className="font-medium text-text">{currentPage}</span>
            {totalPages != null && (
              <>
                <span className="text-text-subtle">of</span>
                <span className="font-medium text-text">{formatNumber(totalPages)}</span>
              </>
            )}
          </div>

          <PagerButton
            label="Next page"
            disabled={!hasNext}
            onClick={() => onChangePage(offset + pageSize)}
          >
            <IconChevronRight size={14} />
          </PagerButton>
          {lastOffset != null && (
            <PagerButton
              label="Last page"
              disabled={!hasNext}
              onClick={() => onChangePage(lastOffset)}
            >
              <IconChevronsRight size={14} />
            </PagerButton>
          )}
        </div>
      </div>
    </div>
  )
}

function PagerButton({
  label,
  disabled,
  onClick,
  children
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn(
            'flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors',
            disabled
              ? 'cursor-not-allowed text-text-subtle/50'
              : 'text-text-muted hover:bg-surface-elevated hover:text-text'
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}
