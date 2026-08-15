import * as React from 'react'
import { IconDatabase, IconDeviceLaptop, IconServerBolt } from '@tabler/icons-react'
import { Chip } from '@renderer/components/ui/chip'
import { ENGINE_LABEL } from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'
import type { DatabaseEngine } from '@renderer/types'

interface SshTunnelRouteProps {
  sshUser: string
  sshHost: string
  sshPort: number
  host: string
  port: number
  engine: DatabaseEngine
}

interface RouteStopProps {
  icon: React.ReactNode
  address: string
  isPlaceholder?: boolean
  note: string
  chip?: React.ReactNode
  isLast?: boolean
}

function RouteStop({ icon, address, isPlaceholder, note, chip, isLast }: RouteStopProps) {
  return (
    <li className="flex gap-2.5">
      <div className="flex flex-col items-center">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface text-text-subtle">
          {icon}
        </span>
        {!isLast && <span aria-hidden className="w-px flex-1 bg-border" />}
      </div>
      <div className={cn('min-w-0 flex-1', !isLast && 'pb-2.5')}>
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'truncate font-mono text-xs leading-5',
              isPlaceholder ? 'text-text-subtle italic' : 'text-text'
            )}
          >
            {address}
          </span>
          {chip}
        </div>
        <p className="truncate text-xs leading-4 text-text-subtle">{note}</p>
      </div>
    </li>
  )
}

/**
 * The one thing that is actually confusing about a tunnel is which host is
 * reached from where - so the hops are drawn rather than explained in prose.
 */
export function SshTunnelRoute({
  sshUser,
  sshHost,
  sshPort,
  host,
  port,
  engine
}: SshTunnelRouteProps) {
  const bastion = sshHost.trim()
  const user = sshUser.trim()
  const target = host.trim()

  return (
    <ol className="flex flex-col">
      <RouteStop
        icon={<IconDeviceLaptop size={12} />}
        address="This machine"
        note="A local port, reachable only from here"
      />
      <RouteStop
        icon={<IconServerBolt size={12} />}
        address={bastion ? `${user ? `${user}@` : ''}${bastion}:${sshPort || 22}` : 'bastion host'}
        isPlaceholder={!bastion}
        note={bastion ? 'Forwards the connection onward' : 'Set the SSH host below'}
        chip={<Chip tone="sky">SSH</Chip>}
      />
      <RouteStop
        icon={<IconDatabase size={12} />}
        address={target ? `${target}:${port}` : 'database host'}
        isPlaceholder={!target}
        note="Resolved on the bastion, so it can be private"
        chip={<Chip tone="neutral">{ENGINE_LABEL[engine]}</Chip>}
        isLast
      />
    </ol>
  )
}
