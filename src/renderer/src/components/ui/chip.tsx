import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

// Attio's tag: a mixed-case pill on a soft tint of its own colour, no ring. The
// ink is the darker *-text shade, since the bright fill colour as 12px text on
// its own tint stays under 4.5:1.
const chipVariants = cva(
  'inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium leading-none tracking-normal',
  {
    variants: {
      tone: {
        emerald: 'bg-success/10 text-success-text',
        amber: 'bg-warning/12 text-warning-text',
        rose: 'bg-danger/10 text-danger-text',
        sky: 'bg-info/10 text-info-text',
        accent: 'bg-accent/10 text-info-text',
        orange: 'bg-orange/10 text-orange-text',
        neutral: 'bg-surface-active text-text-muted'
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
