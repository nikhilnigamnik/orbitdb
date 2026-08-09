'use client'

import * as React from 'react'
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'
import { IconChevronRight } from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'

const DropdownMenu = DropdownMenuPrimitive.Root
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
const DropdownMenuGroup = DropdownMenuPrimitive.Group
const DropdownMenuSub = DropdownMenuPrimitive.Sub

const MENU_PANEL =
  'z-50 min-w-[10rem] overflow-hidden rounded-lg border border-border-strong bg-surface p-1 shadow-2xl shadow-black/70'

function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn('animate-slide-up-fade', MENU_PANEL, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

const ITEM_BASE =
  'flex w-full cursor-pointer select-none items-center gap-2 rounded-[5px] px-2 py-1.5 text-xs outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40'

function DropdownMenuItem({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  variant?: 'default' | 'danger'
}) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        ITEM_BASE,
        variant === 'danger'
          ? 'text-danger data-highlighted:bg-danger/10 data-highlighted:text-danger'
          : 'text-text-muted data-highlighted:bg-surface-elevated data-highlighted:text-text',
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      className={cn(
        ITEM_BASE,
        'text-text-muted data-highlighted:bg-surface-elevated data-highlighted:text-text data-[state=open]:bg-surface-elevated data-[state=open]:text-text',
        className
      )}
      {...props}
    >
      {children}
      <IconChevronRight size={12} className="ml-auto text-text-subtle" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        sideOffset={sideOffset}
        className={cn('animate-slide-up-fade', MENU_PANEL, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent
}
