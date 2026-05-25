import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-neutral-800 text-neutral-200',
        outline: 'border border-neutral-700 text-neutral-300',
        success: 'bg-green-500/10 text-green-400',
        warning: 'bg-yellow-500/10 text-yellow-400',
        danger: 'bg-red-500/10 text-red-400',
        info: 'bg-blue-500/10 text-blue-400'
      }
    },
    defaultVariants: { variant: 'default' }
  }
)

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge }
