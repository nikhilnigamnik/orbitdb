import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

const chipVariants = cva(
  'inline-flex shrink-0 items-center gap-1 rounded-sm px-2 h-4 text-[10px] font-semibold uppercase leading-none tracking-[0.08em] ring-1 ring-inset',
  {
    variants: {
      tone: {
        emerald: 'bg-success/12 text-success ring-success/30',
        amber: 'bg-warning/12 text-warning ring-warning/30',
        rose: 'bg-danger/12 text-danger ring-danger/30',
        sky: 'bg-info/12 text-info ring-info/30',
        accent: 'bg-accent-text/12 text-accent-text ring-accent-text/30',
        orange: 'bg-orange/12 text-orange ring-orange/30',
        neutral: 'bg-text-muted/12 text-text-muted ring-text-muted/25'
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
