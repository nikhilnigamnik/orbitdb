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
      <div className="animate-slide-up-fade pointer-events-auto flex items-center gap-1 rounded-lg border border-border-strong/70 bg-surface/95 py-1.5 pl-2 pr-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl">
        <span className="flex items-center gap-2 pl-1 pr-1.5 text-xs">
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md bg-surface-elevated px-1.5 font-mono text-xs font-medium text-text ring-1 ring-inset ring-white/10">
            {count}
          </span>
          <span className="text-text-subtle">row{count === 1 ? '' : 's'} selected</span>
        </span>

        <span className="mx-1 h-4 w-px bg-white/10" />

        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 rounded-md px-2.5 text-text-muted hover:bg-surface-elevated hover:text-text"
          onClick={onClear}
        >
          <IconX size={12} />
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
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 rounded-md px-2.5 text-text-muted hover:bg-surface-elevated hover:text-text"
          >
            <IconDownload size={12} />
            Export {count}
          </Button>
        </ExportMenu>
        {canMutate && (
          <>
            <span className="mx-1 h-4 w-px bg-white/10" />
            <Button
              size="sm"
              className="h-7 gap-1 rounded-md bg-danger-fill px-3 text-white shadow-[inset_0_-2px_0_0_var(--color-danger-shade),0_1px_3px_0_rgba(0,0,0,0.4)] ring-1 ring-inset ring-white/15 hover:bg-danger hover:shadow-none active:shadow-none focus-visible:border-white/60 focus-visible:ring-2 focus-visible:ring-white/30"
              onClick={onDelete}
            >
              <IconTrash size={12} />
              Delete {count}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
