import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@renderer/lib/utils'

import { FOCUS_RING } from './focus-ring'

const buttonVariants = cva(
  `group/button inline-flex cursor-pointer shrink-0 items-center justify-center rounded-lg border border-transparent text-xs font-medium whitespace-nowrap transition-[background-color,box-shadow,color] outline-none select-none ${FOCUS_RING} disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-[3px] aria-invalid:ring-danger/15 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
  {
    variants: {
      variant: {
        // Attio's primary: a flat blue fill with a blue-tinted drop rather than a bevel.
        default:
          'bg-accent text-accent-fg shadow-primary hover:bg-accent-hover active:bg-accent-shade',
        // The secondary family has no border at all - the hairline halo in
        // shadow-control draws the edge, which is what keeps Attio's controls light.
        outline:
          'bg-surface text-text shadow-control hover:bg-surface-elevated aria-expanded:bg-surface-elevated',
        secondary:
          'bg-surface text-text shadow-control hover:bg-surface-elevated aria-expanded:bg-surface-elevated',
        ghost:
          'bg-surface text-text shadow-control hover:bg-surface-elevated aria-expanded:bg-surface-elevated',
        subtle:
          'bg-transparent text-text-muted hover:bg-surface-elevated hover:text-text aria-expanded:bg-surface-elevated aria-expanded:text-text',
        destructive:
          'bg-danger-fill text-white shadow-[0_1px_2px_-1px_rgba(224,56,62,0.45)] hover:bg-danger-shade focus-visible:outline-danger',
        link: 'text-accent-text underline-offset-4 hover:underline'
      },
      size: {
        default:
          "h-7 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-6 gap-1 rounded-md px-2 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-8 gap-1.5 px-3 text-sm has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5',
        icon: 'size-8',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        'icon-sm': "size-7 [&_svg:not([class*='size-'])]:size-4",
        'icon-lg': 'size-9'
      },
      tone: {
        default: '',
        emerald: 'bg-success/10 text-success-text shadow-none hover:bg-success/15',
        amber: 'bg-warning/10 text-warning-text shadow-none hover:bg-warning/15',
        rose: 'bg-danger/10 text-danger-text shadow-none hover:bg-danger/15',
        sky: 'bg-info/10 text-info-text shadow-none hover:bg-info/15',
        orange: 'bg-orange/10 text-orange-text shadow-none hover:bg-orange/15',
        neutral:
          'bg-surface-elevated text-text-muted shadow-none hover:bg-surface-active hover:text-text'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      tone: 'default'
    }
  }
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  tone = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-tone={tone}
      className={cn(buttonVariants({ variant, size, tone, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
