'use client'

import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

const checkboxVariants = cva(
  'group relative flex cursor-pointer items-center justify-center rounded-md border border-border-strong bg-input outline-none transition-colors data-[state=checked]:border-0 data-[state=checked]:bg-accent focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        xs: 'size-4 p-[1.5px]',
        sm: 'size-5 p-[2px]',
        default: 'size-4 p-[2px]',
        lg: 'size-7 p-[4px]'
      },
      radius: {
        none: 'rounded-none',
        sm: 'rounded-xs',
        default: '',
        lg: '',
        xl: '',
        full: 'rounded-full'
      }
    },
    defaultVariants: {
      size: 'default',
      radius: 'default'
    }
  }
)

interface CheckboxRootProps
  extends React.ComponentPropsWithRef<typeof CheckboxPrimitive.Root>,
    VariantProps<typeof checkboxVariants> {}

function CheckboxRoot({ className, size, radius, ref, ...props }: Readonly<CheckboxRootProps>) {
  return (
    <CheckboxPrimitive.Root
      data-size={size}
      data-radius={radius}
      ref={ref}
      className={cn(checkboxVariants({ size, radius, className }))}
      {...props}
    />
  )
}
CheckboxRoot.displayName = CheckboxPrimitive.Root.displayName

export type CheckboxIndicatorProps = React.ComponentPropsWithRef<typeof CheckboxPrimitive.Indicator>

function CheckboxIndicator({ className, children, ref, ...props }: CheckboxIndicatorProps) {
  return (
    <CheckboxPrimitive.Indicator
      ref={ref}
      className={cn(
        'flex h-full w-full items-center justify-center text-white',
        className
      )}
      {...props}
    >
      {children ?? (
        <svg
          data-slot="checkbox-indicator"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="3.5"
          stroke="currentColor"
          className="size-3.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
            className="group-data-[state=indeterminate]:hidden"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 12h14"
            className="hidden group-data-[state=indeterminate]:block"
          />
        </svg>
      )}
    </CheckboxPrimitive.Indicator>
  )
}
CheckboxIndicator.displayName = CheckboxPrimitive.Indicator.displayName

export interface CheckboxProps
  extends React.ComponentPropsWithRef<typeof CheckboxPrimitive.Root>,
    VariantProps<typeof checkboxVariants> {}

function Checkbox({ className, size, radius, children, ref, ...props }: Readonly<CheckboxProps>) {
  return (
    <CheckboxRoot ref={ref} className={className} size={size} radius={radius} {...props}>
      <CheckboxIndicator>{children}</CheckboxIndicator>
    </CheckboxRoot>
  )
}
Checkbox.displayName = 'Checkbox'

export { Checkbox, CheckboxRoot, CheckboxIndicator }
