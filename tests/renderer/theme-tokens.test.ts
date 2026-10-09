import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

import { CONNECTION_TILE_CLASS } from '@renderer/config/site'

const css = readFileSync(resolve('src/renderer/src/assets/main.css'), 'utf8')

const DARK_MARKER = '@media (prefers-color-scheme: dark)'
const darkStart = css.indexOf(DARK_MARKER)
const lightCss = css.slice(0, darkStart)
const darkCss = css.slice(darkStart)

type Theme = 'light' | 'dark'

function readToken(source: string, name: string): string | undefined {
  return new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(source)?.[1]
}

/** A token as the theme paints it: the dark block where it overrides, light otherwise. */
function token(name: string, theme: Theme = 'light'): string {
  const value =
    (theme === 'dark' ? readToken(darkCss, name) : undefined) ?? readToken(lightCss, name)
  if (!value) throw new Error(`--color-${name} is not defined in main.css`)
  return value
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

/** A colour laid over a surface at the given alpha, as `bg-x/10` paints it. */
function tint(hex: string, alpha: number, over = '#ffffff'): string {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16)
    const base = parseInt(over.slice(i, i + 2), 16)
    return Math.round(c * alpha + base * (1 - alpha))
  })
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

it('has a dark theme block', () => {
  expect(darkStart).toBeGreaterThan(0)
  expect(readToken(darkCss, 'surface')).toBeDefined()
})

// Attio's light theme: the white canvas is the brightest surface, and every
// state steps down from it - sidebar, then hover, then selected.
describe('light surface ramp', () => {
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
})

// The dark theme inverts the ramp: the sidebar is the darkest surface, and
// hover, selection and anything floating step up towards the light.
describe('dark surface ramp', () => {
  it('steps up from the sidebar through the canvas to hover and selected', () => {
    const ordered = ['bg', 'surface', 'surface-elevated', 'surface-active']
    const lums = ordered.map((name) => luminance(token(name, 'dark')))
    for (let i = 1; i < lums.length; i++) {
      expect(lums[i], `${ordered[i]} should be lighter than ${ordered[i - 1]}`).toBeGreaterThan(
        lums[i - 1]
      )
    }
  })

  it('lifts menus and popovers off the canvas', () => {
    // A shadow barely shows on a near-black page, so a floating surface has to
    // be lighter than what it floats over.
    expect(luminance(token('popover', 'dark'))).toBeGreaterThan(luminance(token('surface', 'dark')))
  })

  it('fills controls a step above the canvas, so a chip is visible on the toolbar', () => {
    // The light theme's halo alone vanished here: chips melted into the page.
    const surface = luminance(token('surface', 'dark'))
    expect(luminance(token('control', 'dark'))).toBeGreaterThan(surface)
    expect(luminance(token('control-hover', 'dark'))).toBeGreaterThan(
      luminance(token('control', 'dark'))
    )
    // The groove a segmented control slides in sits below the pill.
    expect(luminance(token('track', 'dark'))).toBeLessThan(luminance(token('control', 'dark')))
  })

  it('keeps text fields apart from a hovered row', () => {
    expect(luminance(token('input', 'dark'))).toBeLessThan(
      luminance(token('surface-elevated', 'dark'))
    )
  })

  it('paints the window the canvas colour, so launch does not flash', () => {
    const main = readFileSync(resolve('src/main/app/theme.ts'), 'utf8')
    expect(main).toContain(`dark: '${token('surface', 'dark')}'`)
    expect(main).toContain(`light: '${token('surface')}'`)
  })
})

describe.each<Theme>(['light', 'dark'])('%s theme', (theme) => {
  const t = (name: string): string => token(name, theme)
  const surface = t('surface')

  it('draws field edges more visibly than hairlines', () => {
    expect(contrast(t('border-strong'), surface)).toBeGreaterThan(contrast(t('border'), surface))
  })

  it('keeps body and muted text readable on the canvas and the sidebar', () => {
    for (const name of ['surface', 'bg', 'popover']) {
      expect(contrast(t('text'), t(name))).toBeGreaterThanOrEqual(7)
      expect(contrast(t('text-muted'), t(name))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps subtle text readable too, wherever rows and menus put it', () => {
    // NULLs, hints, placeholders and key caps all wear text-subtle - it carries
    // information, so it is held to the body-text bar, not the decorative one.
    for (const name of [
      'surface',
      'bg',
      'popover',
      'surface-elevated',
      'surface-sunken',
      'row-hover',
      'row-selected',
      'control',
      'control-hover'
    ]) {
      expect(contrast(t('text-subtle'), t(name)), `text-subtle on ${name}`).toBeGreaterThanOrEqual(
        4.5
      )
    }
  })

  it('steps down from text through muted to subtle', () => {
    const ramp = ['text', 'text-muted', 'text-subtle'].map((name) => contrast(t(name), surface))
    expect(ramp[0]).toBeGreaterThan(ramp[1])
    expect(ramp[1]).toBeGreaterThan(ramp[2])
    // Visibly apart, not two names for one grey.
    expect(contrast(t('text-muted'), t('text-subtle'))).toBeGreaterThanOrEqual(1.4)
  })

  // Chips and badges set 12px text on a tint of the same colour; the bright
  // fill colour fails there, which is why each status has a *-text shade.
  it.each([
    ['success', 'success-text', 0.1],
    ['warning', 'warning-text', 0.12],
    ['danger', 'danger-text', 0.1],
    ['info', 'info-text', 0.1],
    ['accent', 'info-text', 0.1],
    ['orange', 'orange-text', 0.1]
  ] as const)('reads %s chips in %s on their own tint', (fill, text, alpha) => {
    expect(contrast(t(text), tint(t(fill), alpha, surface))).toBeGreaterThanOrEqual(4.5)
    // The hover tint a toned button steps to.
    expect(contrast(t(text), tint(t(fill), 0.15, surface))).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ['blue', 0.1],
    ['green', 0.1],
    ['violet', 0.1],
    ['amber', 0.12],
    ['cyan', 0.1],
    ['rose', 0.1],
    ['orange', 0.1]
  ] as const)('reads %s enum pills on their own tint', (tag, alpha) => {
    for (const over of [surface, t('row-hover'), t('row-selected')]) {
      expect(
        contrast(t(`tag-${tag}-text`), tint(t(`tag-${tag}`), alpha, over))
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('reads danger as text on the canvas', () => {
    expect(contrast(t('danger-text'), surface)).toBeGreaterThanOrEqual(4.5)
    // text-danger is used directly for inline errors, too.
    if (theme === 'dark') expect(contrast(t('danger'), surface)).toBeGreaterThanOrEqual(4.5)
  })

  it('draws unchecked checkboxes and off switches at 3:1 wherever they sit', () => {
    for (const name of ['surface', 'bg', 'surface-elevated', 'row-hover', 'row-selected']) {
      expect(
        contrast(t('border-control'), t(name)),
        `border-control on ${name}`
      ).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps the white switch thumb visible on the off track', () => {
    expect(contrast('#ffffff', t('border-control'))).toBeGreaterThanOrEqual(3)
  })

  it('rings keyboard focus at 3:1 against the canvas and the sidebar', () => {
    expect(contrast(t('accent'), surface)).toBeGreaterThanOrEqual(3)
    expect(contrast(t('accent'), t('bg'))).toBeGreaterThanOrEqual(3)
  })

  it('keeps accent text readable on the canvas and its ink readable on the fill', () => {
    expect(contrast(t('accent-text'), surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t('accent-fg'), t('accent'))).toBeGreaterThanOrEqual(4.5)
  })

  it('darkens the accent on hover and darker still when pressed', () => {
    expect(luminance(t('accent-hover'))).toBeLessThan(luminance(t('accent')))
    expect(luminance(t('accent-shade'))).toBeLessThan(luminance(t('accent-hover')))
  })

  it('sets tooltips at 4.5:1', () => {
    expect(contrast(t('tooltip-fg'), t('tooltip'))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('shadows', () => {
  // Tailwind copies a literal --shadow-* value into every shadow-* class, so a
  // dark override of the variable never reached the page: dialogs and menus
  // kept the light theme's navy shadow, a blue glow on a near-black canvas.
  const themeShadows = [...css.matchAll(/^\s*--shadow-([a-z]+):\s*([^;]+);/gm)]

  it('point every shadow utility at a variable the themes set', () => {
    expect(themeShadows.length).toBeGreaterThan(0)
    for (const [, name, value] of themeShadows) {
      expect(value.trim(), `--shadow-${name}`).toBe(`var(--elevation-${name})`)
    }
  })

  it('give each one a dark value, free of the light theme navy', () => {
    for (const [, name] of themeShadows) {
      const dark = new RegExp(`--elevation-${name}:\\s*([^;]+);`).exec(darkCss)?.[1]
      expect(dark, `no dark --elevation-${name}`).toBeDefined()
      expect(dark).not.toContain('28, 40, 64')
    }
  })
})

it('never rings focus in a colour-mix', () => {
  expect(css).not.toMatch(/:focus-visible\s*\{[^}]*color-mix/)
})

describe('connection tiles', () => {
  it('keeps the tag fills and their ink fixed across themes', () => {
    // CONNECTION_TILE_CLASS pairs ink with fill once; a dark override of either
    // would silently break the pairing.
    expect(darkCss).not.toMatch(
      /--color-tag-(slate|blue|violet|cyan|green|amber|orange|rose)(-deep)?:/
    )
    expect(darkCss).not.toMatch(/--color-tag-ink:/)
  })

  it.each(Object.entries(CONNECTION_TILE_CLASS))(
    'sets the %s initial at 4.5:1 on its fill',
    (_color, classes) => {
      const fill = /\bbg-(tag-[a-z-]+)/.exec(classes)?.[1]
      const ink = /\btext-(white|tag-ink)\b/.exec(classes)?.[1]
      expect(fill, `no tag fill in "${classes}"`).toBeDefined()
      expect(ink, `no ink in "${classes}"`).toBeDefined()
      const inkHex = ink === 'white' ? '#ffffff' : token('tag-ink')
      expect(contrast(inkHex, token(fill!))).toBeGreaterThanOrEqual(4.5)
    }
  )
})
