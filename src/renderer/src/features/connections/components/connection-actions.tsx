import { IconArrowRight, IconPlug, IconPlugOff, IconRefresh } from '@tabler/icons-react'

import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'

export interface ConnectionActionsProps {
  name: string
  isActive: boolean
  isConnecting: boolean
  /** Another connection is mid-connect; starting a second one would race it. */
  isBusy: boolean
  /** This connection's last attempt failed - the button offers to try again. */
  hasFailed: boolean
  /** The connection open right now, which connecting here would replace. */
  activeName?: string | null
  onConnect: () => void
  onOpen: () => void
  onDisconnect: () => void
}

/**
 * The right-hand controls of a connection row. Each state gets its own control
 * rather than one button whose label changes under the pointer: the old
 * "Connected" turned into "Disconnect" on hover, so what a click would do was
 * only knowable once the cursor was already on it.
 *
 * Connected: Open (back into the database) and a separate Disconnect.
 * Otherwise: Connect, Retry after a failure, a spinner while connecting.
 */
export function ConnectionActions({
  name,
  isActive,
  isConnecting,
  isBusy,
  hasFailed,
  activeName,
  onConnect,
  onOpen,
  onDisconnect
}: ConnectionActionsProps) {
  if (isActive) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" onClick={onOpen} aria-label={`Open ${name}`} className="w-[88px]">
          Open
          <IconArrowRight size={14} />
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={onDisconnect}
              aria-label={`Disconnect from ${name}`}
              className="hover:bg-danger/10 hover:text-danger-text"
            >
              <IconPlugOff size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Disconnect</TooltipContent>
        </Tooltip>
      </div>
    )
  }

  if (isConnecting) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled
        aria-label={`Connecting to ${name}`}
        className="w-[122px] justify-center"
      >
        <Spinner size={12} className="text-current" />
        Connecting…
      </Button>
    )
  }

  // Connecting elsewhere replaces the open connection only once the new one
  // answers (connection-store.ts), so say what will happen, not "disconnect".
  const hint = isBusy
    ? 'Wait for the other connection to finish'
    : activeName
      ? `Switch from ${activeName}`
      : undefined

  const button = (
    <Button
      size="sm"
      variant="outline"
      onClick={onConnect}
      disabled={isBusy}
      aria-label={hasFailed ? `Retry connecting to ${name}` : `Connect to ${name}`}
      className="w-[122px] justify-center"
    >
      {hasFailed ? <IconRefresh size={14} /> : <IconPlug size={14} />}
      {hasFailed ? 'Retry' : 'Connect'}
    </Button>
  )

  if (!hint) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button fires no pointer events, so the tooltip hangs off
            a wrapper that still does. */}
        <span className="inline-flex shrink-0" tabIndex={isBusy ? 0 : undefined}>
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{hint}</TooltipContent>
    </Tooltip>
  )
}
