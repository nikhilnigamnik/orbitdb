import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@renderer/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex  cursor-pointer shrink-0 rounded-lg items-center justify-center border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-red-500 aria-invalid:ring-3 aria-invalid:ring-red-500/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'relative isolate  overflow-hidden bg-accent before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:-z-10 before:h-1/2 before:bg-gradient-to-b before:from-white/22 before:to-transparent [a]:hover:bg-accent/80',
        outline:
          'border-border bg-surface text-text hover:bg-surface-elevated aria-expanded:bg-surface-elevated',
        secondary:
          'border border-border bg-surface-elevated text-text hover:bg-surface-elevated/80 aria-expanded:bg-surface-elevated',
        ghost:
          'rounded-md border border-border bg-surface px-3 text-text-muted hover:bg-surface-elevated hover:text-text aria-expanded:bg-surface',
        destructive:
          'bg-red-500/10 text-red-500 hover:bg-red-500/20 focus-visible:border-red-500/40 focus-visible:ring-red-500/20',
        link: 'text-accent underline-offset-4 hover:underline'
      },
      size: {
        default:
          "h-7 gap-1 px-3.5 rounded-[min(var(--radius-md),12px)]  text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
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
          'border-transparent bg-linear-to-b from-emerald-500/20 to-emerald-500/5 text-emerald-200 ring-1 ring-inset ring-emerald-500/25 shadow-[inset_0_1px_0_rgba(110,231,183,0.35)] hover:from-emerald-500/30 hover:to-emerald-500/10 hover:text-emerald-100',
        amber:
          'border-transparent bg-linear-to-b from-amber-500/20 to-amber-500/5 text-amber-200 ring-1 ring-inset ring-amber-500/25 shadow-[inset_0_1px_0_rgba(252,211,77,0.35)] hover:from-amber-500/30 hover:to-amber-500/10 hover:text-amber-100',
        rose: 'border-transparent bg-linear-to-b from-rose-500/20 to-rose-500/5 text-rose-200 ring-1 ring-inset ring-rose-500/25 shadow-[inset_0_1px_0_rgba(253,164,175,0.35)] hover:from-rose-500/30 hover:to-rose-500/10 hover:text-rose-100',
        sky: 'border-transparent bg-linear-to-b from-sky-500/20 to-sky-500/5 text-sky-200 ring-1 ring-inset ring-sky-500/25 shadow-[inset_0_1px_0_rgba(125,211,252,0.35)] hover:from-sky-500/30 hover:to-sky-500/10 hover:text-sky-100',
        orange:
          'border-transparent bg-linear-to-b from-orange-500/20 to-orange-500/5 text-orange-200 ring-1 ring-inset ring-orange-500/25 shadow-[inset_0_1px_0_rgba(253,186,116,0.35)] hover:from-orange-500/30 hover:to-orange-500/10 hover:text-orange-100',
        neutral:
          'border-transparent bg-linear-to-b from-neutral-500/20 to-neutral-500/5 text-neutral-200 ring-1 ring-inset ring-neutral-500/25 shadow-[inset_0_1px_0_rgba(229,229,229,0.25)] hover:from-neutral-500/30 hover:to-neutral-500/10 hover:text-neutral-100'
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
