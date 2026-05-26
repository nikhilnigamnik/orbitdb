'use client'

import * as React from 'react'
import { IconCheck, IconChevronDown } from '@tabler/icons-react'
import { Select as SelectPrimitive } from 'radix-ui'
import { cn } from '@renderer/lib/utils'

export interface SelectOption<T extends string = string> {
  value: T
  label: React.ReactNode
  disabled?: boolean
}

interface SelectProps<T extends string = string> {
  value: T
  onChange: (value: T) => void
  options: SelectOption<T>[]
  placeholder?: string
  size?: 'sm' | 'default'
  className?: string
  contentClassName?: string
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  disabled?: boolean
  ariaLabel?: string
  renderValue?: (option: SelectOption<T> | undefined) => React.ReactNode
}

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder,
  size = 'default',
  className,
  contentClassName,
  align = 'start',
  side = 'bottom',
  disabled,
  ariaLabel,
  renderValue
}: SelectProps<T>) {
  const selected = options.find((option) => option.value === value)

  return (
    <SelectPrimitive.Root value={value} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
      <SelectPrimitive.Trigger
        data-slot="select-trigger"
        data-size={size}
        aria-label={ariaLabel}
        className={cn(
          'flex w-fit cursor-pointer items-center justify-between gap-1.5 rounded-md border border-border bg-surface-elevated/30 px-2 text-text outline-none transition-colors',
          'hover:bg-surface-elevated hover:text-text',
          'focus-visible:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'data-[state=open]:border-accent/50 data-[state=open]:bg-surface-elevated',
          'data-placeholder:text-text-subtle',
          'data-[size=default]:h-8 data-[size=default]:text-[12.5px]',
          'data-[size=sm]:h-7 data-[size=sm]:text-[11.5px]',
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder}>
          {renderValue ? renderValue(selected) : (selected?.label ?? placeholder)}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon asChild>
          <IconChevronDown size={12} className="shrink-0 text-text-subtle" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          data-slot="select-content"
          position="popper"
          side={side}
          align={align}
          sideOffset={6}
          className={cn(
            'animate-slide-up-fade z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-lg border border-border bg-surface text-text drop-shadow-xs',
            contentClassName
          )}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={cn(
                  'relative flex cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pl-2 pr-7 text-[12px] text-text-muted outline-none transition-colors',
                  'focus:bg-surface-elevated focus:text-text',
                  'data-[state=checked]:text-text',
                  'data-disabled:pointer-events-none data-disabled:opacity-50'
                )}
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center">
                  <IconCheck size={12} className="text-accent" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
