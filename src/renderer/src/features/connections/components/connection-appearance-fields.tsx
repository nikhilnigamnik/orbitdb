import * as React from 'react'
import { IconFolder, IconX } from '@tabler/icons-react'
import { Input } from '@renderer/components/ui/input'
import { Popover } from '@renderer/components/ui/popover'
import { FormField } from '@renderer/components/forms/form-field'
import {
  CONNECTION_COLORS,
  CONNECTION_COLOR_CLASS,
  CONNECTION_COLOR_LABEL,
  MAX_FOLDER_NAME_LENGTH
} from '@renderer/config/site'
import { cn } from '@renderer/lib/utils'
import type { ConnectionColor } from '@renderer/types'

interface ConnectionAppearanceFieldsProps {
  folder: string
  color?: ConnectionColor
  /** Folders already in use, offered so the same group is not re-typed differently. */
  folders: string[]
  error?: string
  onChangeFolder: (folder: string) => void
  onChangeColor: (color: ConnectionColor | undefined) => void
}

export function ConnectionAppearanceFields({
  folder,
  color,
  folders,
  error,
  onChangeFolder,
  onChangeColor
}: ConnectionAppearanceFieldsProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false)

  // Suggestions are the point of the picker, so an exact match is not one - it
  // would offer the folder that is already in the box.
  const suggestions = folders.filter((name) => name.toLowerCase() !== folder.trim().toLowerCase())

  return (
    // Stacked rather than a two-column row: the sheet is 448px wide, and nine
    // swatches beside the input leave it too narrow to read a folder name in.
    <div className="flex flex-col gap-3">
      <FormField
        label="Folder"
        htmlFor="conn-folder"
        error={error}
        hint="Optional. Groups this connection on the list."
      >
        <div className="relative">
          <IconFolder
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle"
          />
          <Input
            id="conn-folder"
            value={folder}
            onChange={(e) => onChangeFolder(e.target.value)}
            maxLength={MAX_FOLDER_NAME_LENGTH}
            placeholder="Ungrouped"
            className={cn('pl-8', suggestions.length > 0 && 'pr-16')}
          />
          {suggestions.length > 0 && (
            <div className="absolute right-1 top-1/2 -translate-y-1/2">
              <Popover
                openPopover={pickerOpen}
                setOpenPopover={setPickerOpen}
                align="end"
                popoverContentClassName="w-48 overflow-hidden"
                content={
                  <div className="flex max-h-56 flex-col overflow-auto p-1">
                    {suggestions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          onChangeFolder(name)
                          setPickerOpen(false)
                        }}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs text-text-muted hover:bg-surface-elevated hover:text-text"
                      >
                        <IconFolder size={12} className="shrink-0" />
                        <span className="truncate">{name}</span>
                      </button>
                    ))}
                  </div>
                }
              >
                <button
                  type="button"
                  className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-text-subtle transition-colors hover:text-text"
                >
                  Existing
                </button>
              </Popover>
            </div>
          )}
        </div>
      </FormField>

      <FormField label="Colour">
        <div className="flex h-7 flex-wrap items-center gap-2">
          {CONNECTION_COLORS.map((swatch) => {
            const isSelected = color === swatch
            return (
              <button
                key={swatch}
                type="button"
                onClick={() => onChangeColor(swatch)}
                aria-pressed={isSelected}
                aria-label={CONNECTION_COLOR_LABEL[swatch]}
                title={CONNECTION_COLOR_LABEL[swatch]}
                className={cn(
                  'h-5 w-5 shrink-0 cursor-pointer rounded-full transition-transform hover:scale-110',
                  CONNECTION_COLOR_CLASS[swatch],
                  isSelected && 'ring-2 ring-text ring-offset-2 ring-offset-surface'
                )}
              />
            )
          })}
          {/* Clearing is its own control rather than a ninth swatch: "no colour"
              is the absence of a choice, and a grey circle beside eight coloured
              ones reads as picking grey. */}
          <button
            type="button"
            onClick={() => onChangeColor(undefined)}
            disabled={!color}
            aria-label="No colour"
            title="No colour"
            className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-strong text-text-subtle transition-colors hover:border-text-subtle hover:text-text disabled:cursor-default disabled:opacity-30 disabled:hover:border-border-strong disabled:hover:text-text-subtle"
          >
            <IconX size={10} />
          </button>
        </div>
      </FormField>
    </div>
  )
}
