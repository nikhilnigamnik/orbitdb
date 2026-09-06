/**
 * The floating "one edit back" bar.
 *
 * It names the change itself rather than its coordinates: a truncated key told
 * you where an edit happened but never what it did, which is the only question
 * this control exists to answer. The edited row is highlighted in the grid,
 * which identifies it far better than a fragment of a UUID could.
 */

import { IconArrowBackUp, IconArrowNarrowRight } from '@tabler/icons-react'
import { Chip } from '@renderer/components/ui/chip'
import { Kbd } from '@renderer/components/ui/kbd'
import { cn } from '@renderer/lib/utils'
import { formatCellValue } from '@renderer/lib/format'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

interface UndoPromptProps {
  edit: { column: string; previousValue: unknown; newValue: unknown }
  isUndoing: boolean
  onUndo: () => void
}

export function UndoPrompt({ edit, isUndoing, onUndo }: UndoPromptProps) {
  return (
    // Sits where the selection bar sits, and only when that is absent - two
    // stacked floating bars would fight for the same corner.
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="animate-slide-up-fade pointer-events-auto flex min-w-0 items-center gap-1 rounded-lg border border-border-strong/70 bg-surface/95 py-1 pl-3 pr-1 text-xs shadow-2xl shadow-black/60 backdrop-blur-xl">
        <span className="flex min-w-0 items-center gap-1.5">
          {/* Not uppercased or letter-spaced like the categorical chips: this is
              a real identifier, and in Postgres case is load-bearing. */}
          <Chip
            tone="neutral"
            className="h-5 max-w-32 truncate rounded-md font-mono text-[11px] font-medium normal-case tracking-normal"
            title={edit.column}
          >
            {edit.column}
          </Chip>
          <UndoValue value={edit.previousValue} muted />
          <IconArrowNarrowRight size={12} className="shrink-0 text-text-subtle/60" />
          <UndoValue value={edit.newValue} />
        </span>
        <button
          type="button"
          onClick={onUndo}
          disabled={isUndoing}
          className="ml-1 flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-text-muted transition-colors hover:bg-surface-elevated hover:text-text focus-visible:bg-surface-elevated focus-visible:text-text focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          <IconArrowBackUp size={12} className="shrink-0" />
          {isUndoing ? 'Undoing…' : 'Undo'}
          <Kbd className="ml-0.5">{isMac ? '⌘' : 'Ctrl'}Z</Kbd>
        </button>
      </div>
    </div>
  )
}

/**
 * One side of an edit, in the same shape the grid uses: NULL named rather than
 * shown as a blank, and anything long clipped with the whole value in the title.
 */
function UndoValue({ value, muted }: { value: unknown; muted?: boolean }) {
  const display = formatCellValue(value)
  const isNull = value === null
  return (
    <span
      title={display}
      className={cn(
        'max-w-28 truncate font-mono text-[11px]',
        isNull && 'italic',
        muted ? 'text-text-subtle' : 'text-text'
      )}
    >
      {display}
    </span>
  )
}
