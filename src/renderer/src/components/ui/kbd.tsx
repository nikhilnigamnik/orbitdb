import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

const kbdVariants = cva(
  'inline-flex h-4 min-w-4 items-center justify-center rounded px-1 font-mono text-xs leading-none',
  {
    variants: {
      tone: {
        default:
          'bg-linear-to-b from-neutral-500/20 to-neutral-500/5 text-neutral-200 ring-1 ring-inset ring-neutral-500/25 shadow-[inset_0_1px_0_rgba(229,229,229,0.25)]',
        accent: 'bg-white/15 text-white/90'
      }
    },
    defaultVariants: { tone: 'default' }
  }
)

interface KbdProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof kbdVariants> {}

export function Kbd({ className, tone, ...props }: KbdProps) {
  return <kbd className={cn(kbdVariants({ tone }), className)} {...props} />
}
