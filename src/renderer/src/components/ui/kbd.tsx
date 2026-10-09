import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

// Attio's key hint: a small sans keycap on a soft grey fill with a 0.5px edge,
// sized to sit inside an h-7 control.
const kbdVariants = cva(
  'inline-flex h-[18px] min-w-[18px] items-center justify-center gap-0.5 rounded-[5px] px-1 font-sans text-[11px] font-medium leading-none',
  {
    variants: {
      tone: {
        default: 'bg-surface-sunken text-text-subtle shadow-kbd',
        accent: 'bg-white/20 text-white shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.25)]'
      }
    },
    defaultVariants: { tone: 'default' }
  }
)

interface KbdProps extends React.HTMLAttributes<HTMLElement>, VariantProps<typeof kbdVariants> {}

export function Kbd({ className, tone, ...props }: KbdProps) {
  return <kbd className={cn(kbdVariants({ tone }), className)} {...props} />
}
