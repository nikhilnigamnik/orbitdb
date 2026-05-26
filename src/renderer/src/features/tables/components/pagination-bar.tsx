import { useState } from 'react'
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
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
  totalEstimate: number | null
  onChangePage: (offset: number) => void
  onChangePageSize: (size: number) => void
}

export function PaginationBar({
  offset,
  pageSize,
  loadedCount,
  totalEstimate,
  onChangePage,
  onChangePageSize
}: PaginationBarProps) {
  const [isPageSizeOpen, setIsPageSizeOpen] = useState(false)
  const start = loadedCount === 0 ? 0 : offset + 1
  const end = offset + loadedCount
  const hasPrev = offset > 0
  const hasNext = loadedCount >= pageSize
  const currentPage = Math.floor(offset / pageSize) + 1

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface/40 px-5 py-2">
      <div className="flex items-center gap-2 text-[11.5px]">
        <span className="text-text">
          <span className="font-mono">{formatNumber(start)}</span>
          <span className="text-text-subtle"> – </span>
          <span className="font-mono">{formatNumber(end)}</span>
        </span>
        {totalEstimate != null && (
          <span className="text-text-subtle">
            of <span className="font-mono">~{formatNumber(totalEstimate)}</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-[11.5px] text-text-subtle">
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
                        'flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors',
                        isSelected
                          ? 'bg-surface-elevated text-text'
                          : 'text-text-muted hover:bg-surface-elevated/60 hover:text-text'
                      )}
                    >
                      <span className="font-mono">{size}</span>
                      {isSelected && <IconCheck size={12} className="text-accent" />}
                    </button>
                  )
                })}
              </div>
            }
          >
            <button
              type="button"
              aria-label="Rows per page"
              className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface-elevated/30 px-2 text-[11.5px] text-text transition-colors hover:bg-surface-elevated hover:text-text"
            >
              <span className="font-mono">{pageSize}</span>
              <IconSelector size={12} className="text-text-subtle" />
            </button>
          </Popover>
        </div>

        <div className="flex items-center gap-2 text-[11.5px] text-text-subtle">
          <span>
            Page <span className="font-mono text-text">{currentPage}</span>
          </span>
        </div>

        <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface-elevated/30 p-0.5">
          <PagerButton
            label="First page"
            disabled={!hasPrev}
            onClick={() => onChangePage(0)}
          >
            <IconChevronsLeft size={13} />
          </PagerButton>
          <PagerButton
            label="Previous page"
            disabled={!hasPrev}
            onClick={() => onChangePage(Math.max(0, offset - pageSize))}
          >
            <IconChevronLeft size={13} />
          </PagerButton>
          <PagerButton
            label="Next page"
            disabled={!hasNext}
            onClick={() => onChangePage(offset + pageSize)}
          >
            <IconChevronRight size={13} />
          </PagerButton>
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
            'flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors',
            disabled
              ? 'cursor-not-allowed text-text-subtle/40'
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
