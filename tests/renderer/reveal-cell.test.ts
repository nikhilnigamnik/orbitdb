import { describe, expect, it } from 'vitest'
import { revealDelta, type Box, type StickyInsets } from '@renderer/features/tables/lib/reveal-cell'

const container: Box = { top: 0, left: 0, right: 500, bottom: 300 }
const none: StickyInsets = { left: 0, right: 0, top: 0 }

function cell(left: number, right: number, top = 10, bottom = 40): Box {
  return { left, right, top, bottom }
}

describe('scrolling the cursor back into view', () => {
  it('does nothing when the cell is already visible', () => {
    expect(revealDelta(container, cell(100, 200), none)).toEqual({ left: 0, top: 0 })
  })

  it('follows the cursor off the right edge', () => {
    // The bug: arrowing right moved the cursor without moving the view, so it
    // stepped off screen and left nothing to show where it had gone.
    expect(revealDelta(container, cell(480, 560), none).left).toBe(60)
  })

  it('follows the cursor off the left edge', () => {
    expect(revealDelta(container, cell(-30, 50), none).left).toBe(-30)
  })

  it('moves by the least it can, so a row reads as a row', () => {
    // Centring would jump the viewport on every press.
    expect(revealDelta(container, cell(490, 510), none).left).toBe(10)
  })
})

describe('the sticky columns that overlay the scroll area', () => {
  const frozen: StickyInsets = { left: 120, right: 80, top: 0 }

  it('does not tuck the cell under the frozen columns', () => {
    // scrollIntoView would happily bring this to the container's left edge,
    // which is underneath them - indistinguishable from the cursor vanishing.
    expect(revealDelta(container, cell(60, 140), frozen).left).toBe(-60)
  })

  it('does not tuck the cell under the actions column', () => {
    expect(revealDelta(container, cell(400, 440), frozen).left).toBe(20)
  })

  it('treats a cell between the two insets as already visible', () => {
    expect(revealDelta(container, cell(150, 300), frozen)).toEqual({ left: 0, top: 0 })
  })

  it('shows the start of a cell too wide to fit rather than its end', () => {
    // Scrolling far enough to reveal the right edge would push the beginning
    // under the frozen columns - a value you cannot read the start of.
    const wide = cell(130, 900)
    expect(revealDelta(container, wide, frozen).left).toBe(10)
  })
})

describe('vertical', () => {
  const header: StickyInsets = { left: 0, right: 0, top: 30 }

  it('does not leave the row under the sticky header', () => {
    expect(revealDelta(container, cell(0, 100, 10, 40), header).top).toBe(-20)
  })

  it('follows the cursor past the bottom', () => {
    expect(revealDelta(container, cell(0, 100, 290, 320), header).top).toBe(20)
  })

  it('scrolls both axes at once when a diagonal move needs it', () => {
    expect(revealDelta(container, cell(480, 560, 290, 320), header)).toEqual({
      left: 60,
      top: 20
    })
  })
})
