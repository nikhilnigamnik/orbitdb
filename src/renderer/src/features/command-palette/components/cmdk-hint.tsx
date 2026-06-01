import { IconSearch } from '@tabler/icons-react'
import { Kbd } from '@renderer/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { useCommandPalette } from '@renderer/features/command-palette/store'
import { cn } from '@renderer/lib/utils'

interface CmdKHintProps {
  label?: string
  variant?: 'compact' | 'input'
  className?: string
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export function CmdKHint({ label = 'Open command palette', variant = 'compact', className }: CmdKHintProps) {
  const { open } = useCommandPalette()
  const modKey = isMac ? '⌘' : 'Ctrl'

  if (variant === 'input') {
    return (
      <button
        type="button"
        onClick={open}
        aria-label={label}
        className={cn(
          'flex h-8 w-64 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface-elevated/40 px-2.5 text-text-subtle transition-colors hover:border-border-strong hover:bg-surface-elevated',
          className
        )}
      >
        <IconSearch size={14} className="shrink-0" />
        <span className="flex-1 truncate text-left text-[12px]">{label}</span>
        <span className="flex shrink-0 items-center gap-1">
          <Kbd>{modKey}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={open}
          aria-label={label}
          className={cn(
            'flex h-7 cursor-pointer items-center gap-1 rounded-md border border-border bg-surface-elevated/40 px-1.5 transition-colors hover:border-border-strong hover:bg-surface-elevated',
            className
          )}
        >
          <Kbd>{modKey}</Kbd>
          <Kbd>K</Kbd>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
