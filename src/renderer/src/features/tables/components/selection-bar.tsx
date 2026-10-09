/**
 * The floating bar over a multi-row selection.
 *
 * Floating rather than a band above the grid: it appears only when there is a
 * selection, and a band would push the rows down every time one was made.
 */

import { IconDownload, IconTrash, IconX } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { ExportMenu } from './export-menu'
import type { DatabaseEngine } from '@renderer/types'

interface SelectionBarProps {
  count: number
  rows: Record<string, unknown>[]
  columns: string[]
  schema: string
  table: string
  engine: DatabaseEngine
  canMutate: boolean
  onClear: () => void
  onDelete: () => void
  onCopied: (label: string) => void
  onCopyFailed: (error: unknown) => void
}

export function SelectionBar({
  count,
  rows,
  columns,
  schema,
  table,
  engine,
  canMutate,
  onClear,
  onDelete,
  onCopied,
  onCopyFailed
}: SelectionBarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
      <div className="animate-slide-up-fade pointer-events-auto flex items-center gap-1 rounded-xl bg-surface p-1.5 pl-3 shadow-pop">
        <span className="flex items-center gap-1.5 pr-1 text-xs text-text-muted">
          <span className="font-medium text-text tabular-nums">{count}</span>
          row{count === 1 ? '' : 's'} selected
        </span>

        <span aria-hidden className="mx-1 h-4 w-px bg-border-strong" />

        <Button size="sm" variant="subtle" onClick={onClear}>
          <IconX size={14} />
          Clear
        </Button>
        <ExportMenu
          rows={rows}
          columns={columns}
          filenameParts={[schema, table]}
          side="top"
          align="center"
          insertTarget={{ schema, table, engine }}
          onCopied={onCopied}
          onCopyFailed={onCopyFailed}
        >
          <Button size="sm" variant="outline">
            <IconDownload size={14} className="text-text-subtle" />
            Export {count}
          </Button>
        </ExportMenu>
        {canMutate && (
          <Button size="sm" variant="destructive" onClick={onDelete}>
            <IconTrash size={14} />
            Delete {count}
          </Button>
        )}
      </div>
    </div>
  )
}
