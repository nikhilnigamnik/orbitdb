import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Input } from '@renderer/components/ui/input'
import { Select } from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { Textarea } from '@renderer/components/ui/textarea'

// createElement rather than JSX so these stay plain .ts specs; the components are
// pure functions of their props, so static markup is enough to assert on classes.
function markupOf(element: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(element)
}

/** Classes on the control itself — the first element carrying a class attribute. */
function classesOf(markup: string): string {
  return /class="([^"]*)"/.exec(markup)?.[1] ?? ''
}

/**
 * Only the unprefixed classes — what the control looks like sitting there. Drops
 * `hover:`, `data-[state=open]:` and friends, which describe other states.
 */
function restingClassesOf(markup: string): string[] {
  return classesOf(markup)
    .split(/\s+/)
    .filter((token) => token.length > 0 && !token.includes(':'))
}

/** Controls that read as a field the user types or picks into. */
const fields = [
  { name: 'Input', element: () => createElement(Input) },
  { name: 'Textarea', element: () => createElement(Textarea) },
  { name: 'Checkbox', element: () => createElement(Checkbox) },
  {
    name: 'Select',
    element: () =>
      createElement(Select, {
        value: 'a',
        onChange: () => {},
        options: [{ value: 'a', label: 'A' }]
      })
  }
]

// The Switch is a track, not a field — its unchecked fill stays a raised surface
// so the white thumb reads against it. It shares the focus treatment only.
const controls = [...fields, { name: 'Switch', element: () => createElement(Switch) }]

describe.each(fields)('$name', ({ element }) => {
  it('fills with the input token, not a raised surface', () => {
    const resting = restingClassesOf(markupOf(element()))
    expect(resting).toContain('bg-input')
    expect(resting.filter((c) => c.startsWith('bg-surface-elevated'))).toEqual([])
  })
})

describe.each(controls)('$name', ({ element }) => {
  const classes = () => classesOf(markupOf(element()))

  it('does not shift its border on hover', () => {
    expect(classes()).not.toMatch(/hover:border/)
  })

  it('focuses to the same blue as a primary button, not the lighter text blue', () => {
    expect(classes()).toContain('focus-visible:border-accent ')
    expect(classes()).toContain('focus-visible:ring-accent/40')
    expect(classes()).not.toMatch(/accent-text/)
  })
})

describe('Select', () => {
  it('stands the same height as an Input, at either size', () => {
    const inputHeight = restingClassesOf(markupOf(createElement(Input))).find((c) =>
      c.startsWith('h-')
    )
    expect(inputHeight).toBe('h-7')

    for (const size of ['default', 'sm'] as const) {
      const classes = classesOf(
        markupOf(
          createElement(Select, {
            value: 'a',
            onChange: () => {},
            options: [{ value: 'a', label: 'A' }],
            size
          })
        )
      )
      expect(classes).toContain(`data-[size=${size}]:${inputHeight}`)
    }
  })
})

describe('Input', () => {
  it('still marks itself invalid in danger tones', () => {
    expect(classesOf(markupOf(createElement(Input)))).toContain('aria-invalid:border-danger/60')
  })

  it('merges a caller className instead of dropping it', () => {
    const markup = markupOf(createElement(Input, { className: 'pl-8 font-mono' }))
    expect(classesOf(markup)).toContain('pl-8 font-mono')
  })
})
