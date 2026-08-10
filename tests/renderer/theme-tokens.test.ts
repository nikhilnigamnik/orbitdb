import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve('src/renderer/src/assets/main.css'), 'utf8')

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)
  if (!match) throw new Error(`--color-${name} is not defined in main.css`)
  return match[1]
}

/** Rough perceived brightness - enough to order greys on one hue ramp. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('surface ramp', () => {
  it('darkens from the raised rows down to the window chrome', () => {
    const ordered = ['surface-elevated', 'surface', 'bg', 'surface-sunken']
    const lums = ordered.map((name) => luminance(token(name)))
    for (let i = 1; i < lums.length; i++) {
      expect(lums[i], `${ordered[i]} should be darker than ${ordered[i - 1]}`).toBeLessThan(
        lums[i - 1]
      )
    }
  })

  it('keeps text fields reading as a well, never as a raised chip', () => {
    // The regression this guards: an input lighter than the hover/selected tone
    // makes every form look like a row of buttons.
    expect(luminance(token('input'))).toBeLessThan(luminance(token('surface-elevated')))
    expect(luminance(token('input'))).toBeGreaterThanOrEqual(luminance(token('bg')))
  })
})

describe('accent', () => {
  it('separates the fill blue from the lighter blue used for accent text', () => {
    expect(luminance(token('accent-text'))).toBeGreaterThan(luminance(token('accent')))
  })

  it('darkens on hover and bevels darker still', () => {
    expect(luminance(token('accent-hover'))).toBeLessThan(luminance(token('accent')))
    expect(luminance(token('accent-shade'))).toBeLessThan(luminance(token('accent-hover')))
  })
})
