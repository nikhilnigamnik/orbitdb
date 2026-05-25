import { IconLoader2 } from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'

interface SpinnerProps {
  size?: number
  className?: string
}

export function Spinner({ size = 16, className }: SpinnerProps) {
  return <IconLoader2 size={size} className={cn('animate-spin text-neutral-400', className)} />
}
