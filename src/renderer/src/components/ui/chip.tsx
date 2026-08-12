import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

// No ring: the tinted fill already separates a chip from the surface, and the
// edge on top of it read as a second border wherever chips sit inside a card.
const chipVariants = cva(
  'inline-flex shrink-0 items-center gap-1 rounded-sm px-2 h-4 text-[10px] font-semibold uppercase leading-none tracking-[0.08em]',
  {
    variants: {
      tone: {
        emerald: 'bg-success/12 text-success',
        amber: 'bg-warning/12 text-warning',
        rose: 'bg-danger/12 text-danger',
        sky: 'bg-info/12 text-info',
        accent: 'bg-accent-text/12 text-accent-text',
        orange: 'bg-orange/12 text-orange',
        neutral: 'bg-text-muted/12 text-text-muted'
      }
    },
    defaultVariants: { tone: 'neutral' }
  }
)

interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof chipVariants> {}

export function Chip({ className, tone, ...props }: ChipProps) {
  return <span className={cn(chipVariants({ tone }), className)} {...props} />
}
