import * as React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { useCommandPalette } from '@renderer/features/command-palette/store'

interface CmdKHintProps {
  label?: string
  className?: string
}

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export function CmdKHint({ label = 'Open command palette', className }: CmdKHintProps) {
  const { open } = useCommandPalette()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={open}
          aria-label={label}
          className={
            'flex h-7 cursor-pointer items-center gap-1 rounded-md border border-border bg-surface-elevated/40 px-1.5 transition-colors hover:border-border-strong hover:bg-surface-elevated' +
            (className ? ` ${className}` : '')
          }
        >
          <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
          <Kbd>K</Kbd>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border bg-surface px-1 font-mono text-[10px] leading-none text-text-subtle">
      {children}
    </span>
  )
}
