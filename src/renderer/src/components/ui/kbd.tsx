import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

// Sized to sit inside an h-7 control with room to breathe: h-4, 2px radius,
// px-1, 10px mono, hairline border over a barely-there fill.
const kbdVariants = cva(
  'inline-flex h-4 min-w-4 items-center justify-center gap-0.5 rounded-[3px] border px-1 font-mono text-[10px] leading-none',
  {
    variants: {
      tone: {
        default: 'border-text-muted/15 bg-text-muted/8 text-text-muted',
        accent: 'border-white/20 bg-white/10 text-white'
      }
    },
    defaultVariants: { tone: 'default' }
  }
)

interface KbdProps extends React.HTMLAttributes<HTMLElement>, VariantProps<typeof kbdVariants> {}

export function Kbd({ className, tone, ...props }: KbdProps) {
  return <kbd className={cn(kbdVariants({ tone }), className)} {...props} />
}
