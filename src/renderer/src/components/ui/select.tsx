import * as React from 'react'
import { IconCheck, IconChevronDown } from '@tabler/icons-react'
import { Select as SelectPrimitive } from 'radix-ui'
import { cn } from '@renderer/lib/utils'

import { FIELD_FOCUS } from './focus-ring'

export interface SelectOption<T extends string = string> {
  value: T
  label: React.ReactNode
  disabled?: boolean
  /** Options sharing a group render under one heading, in first-seen order. */
  group?: string
}

function groupOptions<T extends string>(
  options: SelectOption<T>[]
): { group: string | undefined; options: SelectOption<T>[] }[] {
  const groups: { group: string | undefined; options: SelectOption<T>[] }[] = []
  for (const option of options) {
    const last = groups[groups.length - 1]
    const existing = groups.find((g) => g.group === option.group)
    if (existing && (option.group !== undefined || last === existing)) existing.options.push(option)
    else groups.push({ group: option.group, options: [option] })
  }
  return groups
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
          'flex w-fit cursor-pointer items-center justify-between gap-1.5 rounded-lg border border-border-strong bg-input px-2.5 text-text shadow-[0_1px_2px_0_rgba(0,0,0,0.03)] outline-none transition-[border-color,box-shadow,background-color]',
          'hover:border-text-subtle/45',
          FIELD_FOCUS,
          'disabled:cursor-not-allowed disabled:opacity-50',
          'data-[state=open]:border-accent data-[state=open]:ring-[3px] data-[state=open]:ring-accent/15',
          'data-placeholder:text-text-subtle',
          // h-7 to sit level with Input, which every form pairs it with.
          'data-[size=default]:h-7 data-[size=default]:text-xs',
          'data-[size=sm]:h-7 data-[size=sm]:text-xs',
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
            'animate-slide-up-fade z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-xl bg-surface text-text shadow-pop',
            contentClassName
          )}
        >
          <SelectPrimitive.Viewport className="p-1">
            {groupOptions(options).map(({ group, options: groupItems }, groupIndex) => (
              <SelectPrimitive.Group key={group ?? `ungrouped-${groupIndex}`}>
                {group && (
                  <SelectPrimitive.Label
                    className={cn(
                      'px-2 pt-1.5 pb-1 text-[12px] font-medium text-text-subtle',
                      groupIndex > 0 && 'mt-1 border-t border-border pt-2'
                    )}
                  >
                    {group}
                  </SelectPrimitive.Label>
                )}
                {groupItems.map((option) => (
                  <SelectPrimitive.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className={cn(
                      // min-h, not h: an option can carry a second line (a hint), and a
                      // fixed height let each one spill into the row below.
                      'relative flex min-h-8 cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pl-2 pr-7 text-xs text-text outline-none transition-colors',
                      'focus:bg-surface-elevated',
                      'data-[state=checked]:text-text',
                      'data-disabled:pointer-events-none data-disabled:opacity-50'
                    )}
                  >
                    <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center">
                      <IconCheck size={14} className="text-accent" />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Group>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
