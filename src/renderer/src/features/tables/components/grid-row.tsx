/**
 * One body row of the data grid.
 *
 * Memoised, and handed only what this row needs - its own slice of the cursor
 * and range, whether it is selected, which of its cells is being edited. An
 * arrow key used to re-render every row on the page; now it re-renders the two
 * rows the cursor left and entered.
 */

import * as React from 'react'
import { IconLayoutSidebarRightExpand, IconPencil, IconTrash } from '@tabler/icons-react'
import { cn } from '@renderer/lib/utils'
import { formatCellValue } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import type { ColumnInfo } from '@renderer/types'
import { isNumericType } from '../lib/cell-value'
import { INDEX_COLUMN_WIDTH, SELECT_COLUMN_WIDTH } from '../lib/frozen-columns'
import type { ForeignKeyTarget, Row } from '../lib/grid-types'
import { CellInlineEditor } from './cell-inline-editor'
import { GridCellContent } from './grid-cell-content'

/** Stable for the life of the grid, so passing them never re-renders a row. */
export interface GridRowHandlers {
  selectCell: (rowIndex: number, columnIndex: number, extend: boolean) => void
  startEditing: (rowIndex: number, columnId: string) => void
  closeEditor: () => void
  saveCell: (rowIndex: number, row: Row, columnId: string, value: unknown) => Promise<void>
  moveEditing: (rowIndex: number, columnId: string, direction: 'next' | 'prev') => void
  setIsEditorDirty: (isDirty: boolean) => void
  toggleRow: (rowIndex: number, isSelected: boolean) => void
  inspectRow?: (row: Row) => void
  editRow: (row: Row) => void
  deleteRow: (row: Row) => void
  openForeignKey?: (column: string, value: unknown) => void
}

/** What every row shares and what only changes with the columns or the page. */
export interface GridRowLayout {
  gridId: string
  columns: ColumnInfo[]
  cellStyles: Map<string, React.CSSProperties>
  frozen: Set<string>
  isAnyFrozen: boolean
  canMutate: boolean
  canEditCells: boolean
  hasActions: boolean
  rowOffset: number
  fkColumns?: Map<string, ForeignKeyTarget>
}

interface GridRowProps {
  row: Row
  rowIndex: number
  layout: GridRowLayout
  handlers: GridRowHandlers
  isSelected: boolean
  isPendingUndo: boolean
  /** The cursor's column when it is on this row, otherwise -1. */
  cursorColumn: number
  /** The multi-cell range's columns when it covers this row, otherwise -1. */
  rangeStart: number
  rangeEnd: number
  editingColumnId: string | null
  isEditorDirty: boolean
  savedColumnId: string | null
}

const FIXED_WIDTH = (width: number): React.CSSProperties => ({
  width,
  minWidth: width,
  maxWidth: width
})
const SELECT_STYLE = FIXED_WIDTH(SELECT_COLUMN_WIDTH)
const INDEX_STYLE = FIXED_WIDTH(INDEX_COLUMN_WIDTH)

export function gridCellId(gridId: string, rowIndex: number, columnIndex: number): string {
  return `${gridId}-r${rowIndex}-c${columnIndex}`
}

export const GridRow = React.memo(function GridRow({
  row,
  rowIndex,
  layout,
  handlers,
  isSelected,
  isPendingUndo,
  cursorColumn,
  rangeStart,
  rangeEnd,
  editingColumnId,
  isEditorDirty,
  savedColumnId
}: GridRowProps) {
  const { columns, cellStyles, frozen, isAnyFrozen, canEditCells } = layout
  // Roving tab stops: only the cursor row's controls are in the tab order, so
  // Tab leaves the grid in one step instead of three per row.
  const tabIndex = cursorColumn >= 0 ? 0 : -1
  const stickyBg = isSelected
    ? 'bg-row-selected'
    : isPendingUndo
      ? 'bg-surface'
      : 'bg-surface group-hover:bg-row-hover'

  return (
    <tr
      role="row"
      aria-rowindex={layout.rowOffset + rowIndex + 2}
      className={cn(
        // transition-colors would animate outline-color from currentColor on
        // select - only transition the background
        'group cursor-default transition-[background-color]',
        isSelected
          ? // Neutral, never accent blue - a selected row is grey.
            'bg-row-selected'
          : isPendingUndo
            ? // Points at the row the undo prompt is about: a truncated key
              // could never identify it, and the row is on screen anyway.
              'bg-accent/8 outline outline-accent/40 -outline-offset-1'
            : 'hover:bg-row-hover'
      )}
    >
      <td
        role="gridcell"
        data-sticky={isAnyFrozen ? 'left' : undefined}
        style={SELECT_STYLE}
        className={cn(
          'h-9 border-b border-border px-0 text-center text-text',
          isAnyFrozen && cn('sticky left-0 z-10', stickyBg)
        )}
      >
        <Checkbox
          className="mx-auto"
          checked={isSelected}
          tabIndex={tabIndex}
          onCheckedChange={(value) => handlers.toggleRow(rowIndex, !!value)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select row ${layout.rowOffset + rowIndex + 1}`}
        />
      </td>
      <td
        role="gridcell"
        data-sticky={isAnyFrozen ? 'left' : undefined}
        style={INDEX_STYLE}
        className={cn(
          'h-9 border-r border-b border-border px-2 text-right text-[12px] text-text-subtle tabular-nums',
          isAnyFrozen && cn('sticky left-9 z-10', stickyBg)
        )}
      >
        {rowIndex + 1 + layout.rowOffset}
      </td>
      {columns.map((column, columnIndex) => {
        const value = row[column.name]
        const isEditingThis = editingColumnId === column.name
        const isCursor = cursorColumn === columnIndex
        const isRangeCell = rangeStart >= 0 && columnIndex >= rangeStart && columnIndex <= rangeEnd
        const isFrozen = frozen.has(column.name)
        const isNumeric = isNumericType(column.udtName)
        // Once per cell: the title and the content both show it.
        const display = isEditingThis ? '' : formatCellValue(value, column.udtName)
        return (
          <td
            key={column.name}
            id={gridCellId(layout.gridId, rowIndex, columnIndex)}
            role="gridcell"
            aria-selected={isCursor || isRangeCell || undefined}
            // Read by the reveal maths: these overlay the scroll area rather than
            // shrink it, so a cell brought to the edge would otherwise land
            // underneath them.
            data-sticky={isFrozen ? 'left' : undefined}
            data-cursor={isCursor || undefined}
            style={cellStyles.get(column.name)}
            className={cn(
              'h-9 max-w-xs truncate border-r border-b border-border px-3 text-text',
              // Sticky cells are opaque, or the scrolling columns show through -
              // so they take the row's tint as an opaque colour, and hover or
              // selection runs the full width.
              isFrozen && cn('sticky z-10', stickyBg),
              isNumeric && !isEditingThis && 'text-right tabular-nums',
              canEditCells && 'cursor-text',
              // Range fill first, so the cursor's own ring wins on the cell that
              // has both.
              isRangeCell && !isEditingThis && 'bg-accent/8',
              isCursor && !isEditingThis && 'ring-1 ring-inset ring-accent-text/70',
              isEditingThis && 'bg-accent/10 ring-1 ring-inset',
              isEditingThis && (isEditorDirty ? 'ring-accent' : 'ring-accent-text/50'),
              savedColumnId === column.name && 'animate-cell-saved'
            )}
            title={isEditingThis ? undefined : display}
            onMouseDown={
              // While the editor popover is open its portal events bubble through
              // this td in the React tree - skip the handler so double-click text
              // selection inside the editor still works.
              isEditingThis
                ? undefined
                : (e) => {
                    // Stop the browser's double-click word-selection while
                    // keeping single-click selection intact.
                    if (canEditCells && e.detail > 1) e.preventDefault()
                    handlers.selectCell(rowIndex, columnIndex, e.shiftKey)
                  }
            }
            onDoubleClick={
              canEditCells && !isEditingThis
                ? () => handlers.startEditing(rowIndex, column.name)
                : undefined
            }
          >
            {isEditingThis ? (
              <CellInlineEditor
                column={column}
                value={value}
                onSave={(newValue) => handlers.saveCell(rowIndex, row, column.name, newValue)}
                onClose={handlers.closeEditor}
                onNavigate={(direction) => handlers.moveEditing(rowIndex, column.name, direction)}
                onDirtyChange={handlers.setIsEditorDirty}
              />
            ) : (
              <GridCellContent
                column={column}
                columnIndex={columnIndex}
                value={value}
                display={display}
                fkTarget={layout.fkColumns?.get(column.name)}
                onOpenForeignKey={handlers.openForeignKey}
                tabIndex={tabIndex}
              />
            )}
          </td>
        )
      })}
      {layout.hasActions && (
        <td
          role="gridcell"
          data-sticky="right"
          className={cn('sticky right-0 h-9 border-b border-border px-2 text-text', stickyBg)}
        >
          <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {handlers.inspectRow && (
              <Button
                size="icon-xs"
                variant="subtle"
                tabIndex={tabIndex}
                onClick={(e) => {
                  e.stopPropagation()
                  handlers.inspectRow?.(row)
                }}
                title="View record"
                aria-label="View record"
              >
                <IconLayoutSidebarRightExpand stroke={2} />
              </Button>
            )}
            {layout.canMutate && (
              <>
                <Button
                  size="icon-xs"
                  variant="subtle"
                  tabIndex={tabIndex}
                  onClick={(e) => {
                    e.stopPropagation()
                    handlers.editRow(row)
                  }}
                  title="Edit row"
                  aria-label="Edit row"
                >
                  <IconPencil stroke={2} />
                </Button>
                <Button
                  size="icon-xs"
                  variant="subtle"
                  tabIndex={tabIndex}
                  className="hover:bg-danger/8 hover:text-danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    handlers.deleteRow(row)
                  }}
                  title="Delete row"
                  aria-label="Delete row"
                >
                  <IconTrash stroke={2} />
                </Button>
              </>
            )}
          </div>
        </td>
      )}
    </tr>
  )
})
