import { IconSparkles } from '@tabler/icons-react'
import { Kbd } from '@renderer/components/ui/kbd'
import { modKeyLabel } from '@renderer/config/shortcuts'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

interface AiFilterButtonProps {
  onClick: () => void
}

/** The toolbar's "describe the rows you want" field, which opens the AI filter prompt. */
export function AiFilterButton({ onClick }: AiFilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Filter this table with natural language"
      className="group flex h-7 w-64 cursor-pointer items-center gap-2 rounded-lg bg-input px-2 text-left shadow-control transition-colors focus-visible:ring-[3px] focus-visible:ring-accent/20 focus-visible:outline-none"
    >
      <IconSparkles size={14} className="shrink-0 text-text-subtle" />
      <span className="flex-1 truncate text-xs text-text-subtle transition-colors group-hover:text-text-muted">
        Describe the rows you want…
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        <Kbd>{modKeyLabel(isMac)}</Kbd>
        <Kbd>I</Kbd>
      </span>
    </button>
  )
}
