import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@renderer/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex  cursor-pointer shrink-0 rounded-lg items-center justify-center border border-transparent bg-clip-padding text-xs font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-accent-text focus-visible:ring-3 focus-visible:ring-accent-text/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-accent text-accent-fg shadow-[inset_0_-2px_0_0_var(--color-accent-shade),0_1px_3px_0_rgba(0,0,0,0.4)] hover:bg-accent-hover hover:shadow-none active:shadow-none active:not-aria-[haspopup]:scale-[.99]',
        outline:
          'border-border-strong bg-transparent text-text hover:border-text-muted/35 hover:bg-surface-elevated aria-expanded:bg-surface-elevated',
        secondary:
          'border border-border-strong bg-surface-elevated text-text hover:border-text-muted/35 hover:bg-surface-elevated/70 aria-expanded:bg-surface-elevated',
        ghost:
          'rounded-md border border-border-strong bg-surface-elevated/40 px-3 text-text-muted hover:border-text-muted/35 hover:bg-surface-elevated hover:text-text aria-expanded:bg-surface-elevated',
        // Kbd's hairline over a whisper — for controls that should sit quietly
        // beside a field. Keep these two tokens in step with kbd.tsx.
        subtle:
          'rounded-md border-text-muted/15 bg-text-muted/8 text-text-muted hover:bg-text-muted/15 hover:text-text aria-expanded:bg-text-muted/15',
        destructive:
          'bg-danger/10 text-danger hover:bg-danger/20 focus-visible:border-danger/40 focus-visible:ring-danger/20',
        link: 'text-accent-text underline-offset-4 hover:underline'
      },
      size: {
        default:
          "h-7 gap-1 px-3.5 rounded-[min(var(--radius-md),12px)]  text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-6 gap-1 px-3.5 rounded-[min(var(--radius-md),10px)] text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-3.5 rounded-[min(var(--radius-md),12px)] text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 gap-1.5 px-4.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        icon: 'size-8',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9'
      },
      tone: {
        default: '',
        emerald:
          'border-transparent bg-success/12 text-success ring-1 ring-inset ring-success/30 hover:bg-success/20 hover:brightness-110',
        amber:
          'border-transparent bg-warning/12 text-warning ring-1 ring-inset ring-warning/30 hover:bg-warning/20 hover:brightness-110',
        rose: 'border-transparent bg-danger/12 text-danger ring-1 ring-inset ring-danger/30 hover:bg-danger/20 hover:brightness-110',
        sky: 'border-transparent bg-info/12 text-info ring-1 ring-inset ring-info/30 hover:bg-info/20 hover:brightness-110',
        orange:
          'border-transparent bg-orange/12 text-orange ring-1 ring-inset ring-orange/30 hover:bg-orange/20 hover:brightness-110',
        neutral:
          'border-transparent bg-text-muted/12 text-text-muted ring-1 ring-inset ring-text-muted/25 hover:bg-text-muted/20 hover:text-text'
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
