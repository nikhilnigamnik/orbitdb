import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { PAGE_SIZE_OPTIONS } from '@renderer/config/site'
import { formatNumber } from '@renderer/lib/format'

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
  const start = loadedCount === 0 ? 0 : offset + 1
  const end = offset + loadedCount
  const hasPrev = offset > 0
  const hasNext = loadedCount >= pageSize

  return (
    <div className="flex items-center justify-between border-t border-neutral-800 px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <span>
          Rows {formatNumber(start)}–{formatNumber(end)}
        </span>
        {totalEstimate != null && (
          <span className="text-neutral-600">of ~{formatNumber(totalEstimate)} (estimate)</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-500">Page size</span>
        <Select value={String(pageSize)} onValueChange={(value) => onChangePageSize(Number(value))}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon-sm"
          variant="secondary"
          className="bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
          onClick={() => onChangePage(Math.max(0, offset - pageSize))}
          disabled={!hasPrev}
        >
          <IconChevronLeft size={14} />
        </Button>
        <Button
          size="icon-sm"
          variant="secondary"
          className="bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
          onClick={() => onChangePage(offset + pageSize)}
          disabled={!hasNext}
        >
          <IconChevronRight size={14} />
        </Button>
      </div>
    </div>
  )
}
