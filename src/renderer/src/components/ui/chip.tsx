import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

const chipVariants = cva(
  'inline-flex shrink-0 items-center gap-1 rounded-sm px-2 h-4 text-[9px] font-semibold uppercase leading-none tracking-[0.08em] ring-1 ring-inset bg-linear-to-b',
  {
    variants: {
      tone: {
        emerald:
          'from-emerald-500/20 to-emerald-500/5 text-emerald-200 ring-emerald-500/25 shadow-[inset_0_1px_0_rgba(110,231,183,0.35)]',
        amber:
          'from-amber-500/20 to-amber-500/5 text-amber-200 ring-amber-500/25 shadow-[inset_0_1px_0_rgba(252,211,77,0.35)]',
        rose: 'from-rose-500/20 to-rose-500/5 text-rose-200 ring-rose-500/25 shadow-[inset_0_1px_0_rgba(253,164,175,0.35)]',
        sky: 'from-sky-500/20 to-sky-500/5 text-sky-200 ring-sky-500/25 shadow-[inset_0_1px_0_rgba(125,211,252,0.35)]',
        accent:
          'from-accent/25 to-accent/5 text-accent ring-accent/30 shadow-[inset_0_1px_0_rgba(125,152,248,0.4)]',
        orange:
          'from-orange-500/20 to-orange-500/5 text-orange-200 ring-orange-500/25 shadow-[inset_0_1px_0_rgba(253,186,116,0.35)]',
        neutral:
          'from-neutral-500/20 to-neutral-500/5 text-neutral-200 ring-neutral-500/25 shadow-[inset_0_1px_0_rgba(229,229,229,0.25)]'
      }
    },
    defaultVariants: { tone: 'neutral' }
  }
)

interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {}

export function Chip({ className, tone, ...props }: ChipProps) {
  return <span className={cn(chipVariants({ tone }), className)} {...props} />
}
