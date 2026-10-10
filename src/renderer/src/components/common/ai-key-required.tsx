import { useNavigate } from 'react-router-dom'
import { IconSettings, IconSparkles } from '@tabler/icons-react'
import { Button } from '@renderer/components/ui/button'
import { ROUTES } from '@renderer/config/routes'
import { AI_SETUP_COPY, isAiSetupMessage } from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'

/**
 * Distinguishes "you have not set this up" from "something went wrong". The
 * first is a state with an obvious next step; showing it as a red error, as it
 * used to be, tells the user something is broken when nothing is.
 */
export function isMissingAiKeyError(message: string | null | undefined): boolean {
  // A half-configured Cloudflare gateway is the same kind of state - set-up
  // that Settings finishes - so it gets the same prompt, not a red error.
  return isAiSetupMessage(message)
}

interface AiKeyRequiredProps {
  /** Runs before navigating - for closing the sheet or dialog this sits inside. */
  onNavigate?: () => void
  className?: string
}

export function AiKeyRequired({ onNavigate, className }: AiKeyRequiredProps) {
  const navigate = useNavigate()

  return (
    <div className={cn('flex flex-col items-center px-6 py-8 text-center', className)}>
      <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent-text">
        <IconSparkles size={20} />
      </span>
      <p className="text-sm font-medium text-text">{AI_SETUP_COPY.title}</p>
      <p className="mt-1 max-w-[34ch] text-xs text-text-muted">{AI_SETUP_COPY.description}</p>
      <Button
        size="sm"
        variant="outline"
        className="mt-4"
        onClick={() => {
          onNavigate?.()
          navigate(ROUTES.settings)
        }}
      >
        <IconSettings size={14} />
        {AI_SETUP_COPY.action}
      </Button>
    </div>
  )
}
