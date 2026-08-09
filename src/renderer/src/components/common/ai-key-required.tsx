import { useNavigate } from 'react-router-dom'
import { IconSettings, IconSparkles } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { ROUTES } from '@renderer/config/routes'
import { MISSING_AI_KEY_MESSAGE } from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'

/**
 * Distinguishes "you have not set this up" from "something went wrong". The
 * first is a state with an obvious next step; showing it as a red error, as it
 * used to be, tells the user something is broken when nothing is.
 */
export function isMissingAiKeyError(message: string | null | undefined): boolean {
  return message === MISSING_AI_KEY_MESSAGE
}

interface AiKeyRequiredProps {
  /** Runs before navigating — for closing the sheet or dialog this sits inside. */
  onNavigate?: () => void
  className?: string
}

export function AiKeyRequired({ onNavigate, className }: AiKeyRequiredProps) {
  const navigate = useNavigate()

  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-8 text-center', className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent-text ring-1 ring-inset ring-accent/20">
        <IconSparkles size={16} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-text">Add an Anthropic API key</p>
        <p className="max-w-[34ch] text-xs leading-relaxed text-text-subtle">
          The AI features need your own key. It stays encrypted on this machine.
        </p>
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          onNavigate?.()
          navigate(ROUTES.settings)
        }}
      >
        <IconSettings size={12} />
        Open settings
      </Button>
    </div>
  )
}
