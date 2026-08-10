import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Input } from '@renderer/components/ui/input'
import { Kbd } from '@renderer/components/ui/kbd'
import { Select } from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { Textarea } from '@renderer/components/ui/textarea'
import { CmdKHint } from '@renderer/features/command-palette/components/cmdk-hint'
import { CommandPaletteProvider } from '@renderer/features/command-palette/store'
import { FiltersBar } from '@renderer/features/tables/components/filters-bar'
import type { RowFilter } from '@renderer/types'

// createElement rather than JSX so these stay plain .ts specs; the components are
// pure functions of their props, so static markup is enough to assert on classes.
function markupOf(element: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(element)
}

/** Classes on the control itself - the first element carrying a class attribute. */
function classesOf(markup: string): string {
  return /class="([^"]*)"/.exec(markup)?.[1] ?? ''
}

/**
 * Only the unprefixed classes - what the control looks like sitting there. Drops
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

// The Switch is a track, not a field - its unchecked fill stays a raised surface
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

describe('control heights', () => {
  const CONTROL_HEIGHT = 'h-7'

  it('stands buttons at the same height as fields, so a toolbar row lines up', () => {
    for (const size of ['default', 'sm'] as const) {
      const classes = classesOf(markupOf(createElement(Button, { size }, 'Go')))
      expect(classes.split(/\s+/)).toContain(CONTROL_HEIGHT)
    }
  })

  // Buttons shaped like a field - a search or filter box that opens a panel
  // instead of taking a caret. They are bespoke rather than primitives, so they
  // are checked at the source, keyed on the aria-label so they survive being
  // moved around their file.
  const fieldShapedTriggers = [
    {
      what: 'the AI filter field',
      file: 'src/renderer/src/features/tables/components/table-data-view.tsx',
      ariaLabel: 'Filter this table with natural language'
    },
    {
      what: 'the sidebar table search',
      file: 'src/renderer/src/features/database/components/schema-tree.tsx',
      ariaLabel: 'Open command palette'
    }
  ]

  it.each(fieldShapedTriggers)(
    'dresses $what as a field, at control height',
    ({ file, ariaLabel }) => {
      const source = readFileSync(resolve(file), 'utf8')
      const trigger = new RegExp(
        `aria-label="${ariaLabel}"[\\s\\S]{0,400}?className="([^"]*)"`
      ).exec(source)

      expect(trigger, `the trigger moved or lost its aria-label in ${file}`).not.toBeNull()
      const classes = trigger![1].split(/\s+/)
      expect(classes).toContain(CONTROL_HEIGHT)
      expect(classes).toContain('bg-input')
      expect(classes.filter((c) => c.startsWith('hover:border'))).toEqual([])
    }
  )

  it('dresses the command-palette hint as a field too', () => {
    const markup = markupOf(
      createElement(CommandPaletteProvider, null, createElement(CmdKHint, { variant: 'input' }))
    )
    const classes = classesOf(markup).split(/\s+/)
    expect(classes).toContain(CONTROL_HEIGHT)
    expect(classes).toContain('bg-input')
    expect(classes.filter((c) => c.startsWith('hover:border'))).toEqual([])
  })
})

describe('Kbd', () => {
  const kbdClasses = () => classesOf(markupOf(createElement(Kbd, null, '⌘'))).split(/\s+/)

  it('stays small enough to sit inside a control without crowding it', () => {
    expect(kbdClasses()).toContain('h-4')
    expect(kbdClasses()).toContain('min-w-4')
    expect(kbdClasses()).toContain('text-[10px]')
  })

  it('lends its hairline-over-a-whisper surface to the subtle button', () => {
    // The invariant is "these two match", not two copies of the same literal -
    // restyling Kbd should report the button as drifted, not pass quietly.
    const surface = kbdClasses().filter(
      (c) => c.startsWith('border-text-muted/') || c.startsWith('bg-text-muted/')
    )
    expect(surface).toHaveLength(2)

    const button = classesOf(markupOf(createElement(Button, { variant: 'subtle' }, 'Quiet'))).split(
      /\s+/
    )
    for (const token of surface) {
      expect(button, `the subtle button is missing ${token}`).toContain(token)
    }
  })
})

describe('the filter row', () => {
  const render = (filters: RowFilter[]) =>
    markupOf(
      createElement(FiltersBar, {
        connectionId: 'c',
        schema: 's',
        table: 't',
        columns: [],
        filters,
        onChange: () => {},
        onApply: () => {}
      })
    )

  const markup = () => render([{ column: 'id', operator: '=', value: '1' }])

  it('offers each applied filter for editing, not only for removal', () => {
    expect(markup()).toContain('aria-label="Edit filter on id"')
    expect(markup()).toContain('aria-label="Remove filter"')
  })

  it('offers clear-all only once a second filter makes it worth having', () => {
    expect(render([])).not.toContain('Clear all')
    expect(render([{ column: 'id', operator: '=', value: '1' }])).not.toContain('Clear all')
    expect(
      render([
        { column: 'id', operator: '=', value: '1' },
        { column: 'name', operator: 'like', value: '%a%' }
      ])
    ).toContain('Clear all')
  })

  it('shows a unary filter without an empty value segment', () => {
    const unary = render([{ column: 'deleted_at', operator: 'is null', value: '' }])
    expect(unary).toContain('is null')
    expect(unary).toContain('aria-label="Edit filter on deleted_at"')
  })

  it('stands the applied-filter chip at control height, level with the trigger', () => {
    // The chip used to size itself off py-1, leaving it 2px short of the button
    // beside it and the fields above it.
    const chip = /class="(inline-flex[^"]*)"/.exec(markup())
    expect(chip, 'could not find the applied-filter chip').not.toBeNull()
    expect(chip![1].split(/\s+/)).toContain('h-7')
  })

  it('wears the subtle surface on its trigger rather than a copy of it', () => {
    const trigger = /data-variant="([^"]*)"[^>]*data-size="([^"]*)"/.exec(markup())
    expect(trigger, 'the filter trigger is no longer a Button').not.toBeNull()
    expect(trigger![1]).toBe('subtle')
    expect(trigger![2]).toBe('icon-sm')
  })
})

describe('the floating selection toolbar', () => {
  /**
   * Rendering the bar needs a loaded table, so it is read from the source. The
   * class list is split so a test can assert on what is absent as well as
   * present - this button inherits from Button's `default` variant, and the bug
   * it keeps hitting is an accent token that was never overridden.
   */
  function deleteButtonClasses(): string[] {
    const source = readFileSync(
      resolve('src/renderer/src/features/tables/components/table-data-view.tsx'),
      'utf8'
    )
    const button = /className="([^"]*bg-danger-fill[^"]*)"/.exec(source)
    expect(button, 'could not find the solid delete button').not.toBeNull()
    return button![1].split(/\s+/)
  }

  it('is rounded, not a pill', () => {
    // Rendering it needs a loaded table, so it is checked at the source, keyed
    // on the entrance animation the bar is the only user of.
    const source = readFileSync(
      resolve('src/renderer/src/features/tables/components/table-data-view.tsx'),
      'utf8'
    )
    const bar = /className="(animate-slide-up-fade pointer-events-auto[^"]*)"/.exec(source)
    expect(bar, 'could not find the floating selection bar').not.toBeNull()
    expect(bar![1].split(/\s+/)).toContain('rounded-lg')
    expect(source, 'nothing in this view should be a pill any more').not.toMatch(/rounded-full/)
  })

  it('does not make the delete button glow', () => {
    // A coloured drop shadow under a red fill reads as a halo, not depth.
    const source = readFileSync(
      resolve('src/renderer/src/features/tables/components/table-data-view.tsx'),
      'utf8'
    )
    expect(source).not.toMatch(/shadow-danger/)
  })

  it('does not focus the delete button in accent blue', () => {
    // Button's base focus treatment is accent blue, and closing the confirm
    // dialog restores focus to the trigger - so a solid red fill has to override
    // it or the button sits there ringed in blue.
    const classes = deleteButtonClasses()
    expect(classes.some((c) => /^focus-visible:(border|ring)-white/.test(c))).toBe(true)
  })

  it('bevels the delete button in danger, not the accent blue it inherits', () => {
    // The real trap: `default` paints an inset bevel in --color-accent-shade,
    // which is blue. Overriding only bg- leaves that blue line along the bottom,
    // and it is invisible in the className until you look for what is *missing*.
    const shadow = deleteButtonClasses().find((c) => c.startsWith('shadow-['))
    expect(shadow, 'the delete button does not override the inherited bevel').toBeDefined()
    expect(shadow).toContain('--color-danger-shade')
    expect(shadow).not.toContain('accent')
  })
})

describe('the refresh-schemas button', () => {
  it('wears the subtle surface too', () => {
    // Lives inside a component needing router and palette context, so it is
    // checked at the source - keyed on the aria-label.
    const source = readFileSync(
      resolve('src/renderer/src/features/database/components/schema-tree.tsx'),
      'utf8'
    )
    const button = /variant="([^"]*)"[\s\S]{0,300}?aria-label="Refresh schemas"/.exec(source)
    expect(button, 'the refresh button moved or lost its aria-label').not.toBeNull()
    expect(button![1]).toBe('subtle')
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
