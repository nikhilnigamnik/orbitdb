/**
 * Scrolling the cursor back into view.
 *
 * `scrollIntoView` cannot be used here: the grid has sticky columns on both
 * edges and a sticky header, which overlay the scroll area rather than shrink
 * it. The browser would happily bring a cell to the left edge and leave it
 * underneath the frozen columns, which looks exactly like the cursor having
 * vanished. So the visible box is the container inset by whatever is covering
 * it, and the delta is worked out against that.
 */

export interface Box {
  top: number
  left: number
  right: number
  bottom: number
}

export interface StickyInsets {
  /** Frozen columns plus the checkbox and row-number columns. */
  left: number
  /** The row-actions column. */
  right: number
  /** The column headers. */
  top: number
}

export interface ScrollDelta {
  left: number
  top: number
}

/**
 * How far to scroll so `cell` is fully inside `container`, or zeroes when it
 * already is.
 *
 * Nearest-edge rather than centring: an arrow key should move the view by the
 * least it can, so a row of cells reads as a row rather than jumping the
 * viewport on every press.
 *
 * A cell wider than the visible box is aligned to its left edge - the start of
 * a value is the part worth seeing, and preferring the right edge would scroll
 * past the beginning of the very cell being revealed.
 */
export function revealDelta(container: Box, cell: Box, insets: StickyInsets): ScrollDelta {
  const visibleLeft = container.left + insets.left
  const visibleRight = container.right - insets.right
  const visibleTop = container.top + insets.top

  let left = 0
  if (cell.left < visibleLeft) left = cell.left - visibleLeft
  else if (cell.right > visibleRight) {
    const overflow = cell.right - visibleRight
    // Never scroll so far that the cell's own start goes under the frozen
    // columns; a value you cannot see the beginning of is not revealed.
    left = Math.min(overflow, Math.max(0, cell.left - visibleLeft))
  }

  let top = 0
  if (cell.top < visibleTop) top = cell.top - visibleTop
  else if (cell.bottom > container.bottom) {
    top = Math.min(cell.bottom - container.bottom, Math.max(0, cell.top - visibleTop))
  }

  return { left, top }
}

/**
 * Total width of the elements covering one edge of the scroll area.
 *
 * Read off the DOM rather than recomputed from the frozen-column preferences:
 * the leading checkbox and row-number columns only turn sticky when something
 * is frozen, and widths change as columns are dragged. Measuring what is
 * actually there cannot fall out of step with what is rendered.
 */
export function stickyWidth(cells: Iterable<Element>): number {
  let total = 0
  for (const cell of cells) total += cell.getBoundingClientRect().width
  return total
}
