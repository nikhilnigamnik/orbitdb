import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

import { CONNECTION_TILE_CLASS } from '@renderer/config/site'

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

/** WCAG relative luminance and contrast ratio, for text-on-surface checks. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** A colour laid over white at the given alpha, as `bg-x/10` paints it. */
function tint(hex: string, alpha: number): string {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16)
    return Math.round(c * alpha + 255 * (1 - alpha))
  })
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// The light, Attio-style theme: the white canvas is the brightest surface, and
// every state steps down from it - sidebar, then hover, then selected.
describe('surface ramp', () => {
  it('steps down from the canvas through the sidebar to hover and selected', () => {
    const ordered = ['surface', 'bg', 'surface-elevated', 'surface-active']
    const lums = ordered.map((name) => luminance(token(name)))
    for (let i = 1; i < lums.length; i++) {
      expect(lums[i], `${ordered[i]} should be darker than ${ordered[i - 1]}`).toBeLessThan(
        lums[i - 1]
      )
    }
  })

  it('sinks code wells below the canvas', () => {
    expect(luminance(token('surface-sunken'))).toBeLessThan(luminance(token('surface')))
  })

  it('keeps text fields white, never tinted like a hovered row', () => {
    // A field filled with the hover grey reads as a button rather than a place
    // to type - Attio's fields are white with a border.
    expect(luminance(token('input'))).toBeGreaterThan(luminance(token('surface-elevated')))
    expect(luminance(token('input'))).toBeGreaterThanOrEqual(luminance(token('bg')))
  })

  it('draws hairlines visibly lighter than the field edges', () => {
    expect(luminance(token('border'))).toBeGreaterThan(luminance(token('border-strong')))
  })
})

describe('ink', () => {
  it('keeps body and muted text readable on the canvas and the sidebar', () => {
    for (const surface of ['surface', 'bg']) {
      expect(contrast(token('text'), token(surface))).toBeGreaterThanOrEqual(7)
      expect(contrast(token('text-muted'), token(surface))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps subtle text readable too, on white and on a hovered row', () => {
    // NULLs, hints, placeholders and key caps all wear text-subtle - it carries
    // information, so it is held to the body-text bar, not the decorative one.
    for (const surface of ['surface', 'bg', 'surface-elevated', 'surface-sunken']) {
      expect(
        contrast(token('text-subtle'), token(surface)),
        `text-subtle on ${surface}`
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('steps down from text through muted to subtle', () => {
    const ramp = ['text', 'text-muted', 'text-subtle'].map((name) => luminance(token(name)))
    expect(ramp[0]).toBeLessThan(ramp[1])
    expect(ramp[1]).toBeLessThan(ramp[2])
    // Visibly apart, not two names for one grey.
    expect(contrast(token('text-muted'), token('text-subtle'))).toBeGreaterThanOrEqual(1.4)
  })
})

describe('status text', () => {
  // Chips and badges set 12px text on a tint of the same colour; the bright
  // fill colour fails there, which is why each status has a *-text shade.
  const pairs: Array<[fill: string, text: string, alpha: number]> = [
    ['success', 'success-text', 0.1],
    ['warning', 'warning-text', 0.12],
    ['danger', 'danger-text', 0.1],
    ['info', 'info-text', 0.1],
    ['accent', 'info-text', 0.1],
    ['orange', 'orange-text', 0.1]
  ]

  it.each(pairs)('reads %s chips in %s on their own tint', (fill, text, alpha) => {
    expect(contrast(token(text), tint(token(fill), alpha))).toBeGreaterThanOrEqual(4.5)
    // The hover tint a toned button steps to.
    expect(contrast(token(text), tint(token(fill), 0.15))).toBeGreaterThanOrEqual(4.5)
  })

  it('reads danger text on the canvas, where the danger fill falls short', () => {
    expect(contrast(token('danger-text'), token('surface'))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('control boundaries', () => {
  it('draws unchecked checkboxes and off switches at 3:1 wherever they sit', () => {
    for (const surface of ['surface', 'bg', 'surface-elevated', 'row-hover', 'row-selected']) {
      expect(
        contrast(token('border-control'), token(surface)),
        `border-control on ${surface}`
      ).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps the white switch thumb visible on the off track', () => {
    expect(contrast('#ffffff', token('border-control'))).toBeGreaterThanOrEqual(3)
  })

  it('rings keyboard focus at 3:1 against the canvas and the sidebar', () => {
    expect(contrast(token('accent'), token('surface'))).toBeGreaterThanOrEqual(3)
    expect(contrast(token('accent'), token('bg'))).toBeGreaterThanOrEqual(3)
    expect(css).not.toMatch(/:focus-visible\s*\{[^}]*color-mix/)
  })
})

describe('accent', () => {
  it('stays readable as text on the white canvas', () => {
    expect(contrast(token('accent-text'), token('surface'))).toBeGreaterThanOrEqual(4.5)
  })

  it('carries white ink on its fill', () => {
    expect(contrast(token('accent-fg'), token('accent'))).toBeGreaterThanOrEqual(4.5)
  })

  it('darkens on hover and darker still when pressed', () => {
    expect(luminance(token('accent-hover'))).toBeLessThan(luminance(token('accent')))
    expect(luminance(token('accent-shade'))).toBeLessThan(luminance(token('accent-hover')))
  })
})

describe('connection tiles', () => {
  it.each(Object.entries(CONNECTION_TILE_CLASS))(
    'sets the %s initial at 4.5:1 on its fill',
    (_color, classes) => {
      const fill = /\bbg-(tag-[a-z-]+)/.exec(classes)?.[1]
      const ink = /\btext-(white|text)\b/.exec(classes)?.[1]
      expect(fill, `no tag fill in "${classes}"`).toBeDefined()
      expect(ink, `no ink in "${classes}"`).toBeDefined()
      const inkHex = ink === 'white' ? '#ffffff' : token('text')
      expect(contrast(inkHex, token(fill!))).toBeGreaterThanOrEqual(4.5)
    }
  )
})
