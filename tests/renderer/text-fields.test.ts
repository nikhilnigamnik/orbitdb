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

// The Switch is a track, not a field - its unchecked fill is a grey track so
// the white thumb reads against it. It shares the focus treatment only.
const controls = [...fields, { name: 'Switch', element: () => createElement(Switch) }]

describe.each(fields)('$name', ({ element }) => {
  it('sits white on the canvas, not on a raised grey surface', () => {
    const resting = restingClassesOf(markupOf(element()))
    expect(resting.some((c) => c === 'bg-input' || c === 'bg-surface')).toBe(true)
    expect(resting.filter((c) => c.startsWith('bg-surface-elevated'))).toEqual([])
  })

  it('answers hover by darkening its edge, as Attio fields do, not by filling', () => {
    const classes = classesOf(markupOf(element()))
    expect(classes).toMatch(/hover:border-/)
    expect(classes).not.toMatch(/hover:bg-/)
  })
})

describe.each(controls)('$name', ({ element }) => {
  const classes = () => classesOf(markupOf(element()))

  it('focuses to a solid ring in the primary blue, not the text blue', () => {
    // Solid, not a translucent halo: keyboard focus has to clear 3:1, which
    // accent/20 never did.
    expect(classes()).toMatch(/focus-visible:(ring|outline)-accent(\s|$)/)
    expect(classes()).not.toMatch(/focus-visible:(ring|outline)-accent\//)
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
      file: 'src/renderer/src/features/tables/components/ai-filter-button.tsx',
      ariaLabel: 'Filter this table with natural language'
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
    // 18px inside a 28px (h-7) control leaves 5px either side.
    expect(kbdClasses()).toContain('h-[18px]')
    expect(kbdClasses()).toContain('text-[11px]')
  })

  it('sets keys in the UI face, as Attio does, not monospace', () => {
    expect(kbdClasses()).toContain('font-sans')
    expect(kbdClasses()).not.toContain('font-mono')
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
    // The label carries the whole condition, not just the column, so a screen
    // reader hears what the chip shows.
    expect(markup()).toContain('aria-label="Edit filter: id = 1"')
    expect(markup()).toContain('aria-label="Remove filter on id"')
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
    expect(unary).toContain('aria-label="Edit filter: deleted_at is null"')
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

  it('draws the empty trigger as an Attio dashed chip that names itself', () => {
    const empty = render([])
    const trigger = /<button[^>]*aria-label="Open filters"[^>]*>/.exec(empty)
    expect(trigger, 'the filter trigger lost its aria-label').not.toBeNull()
    const classes = /class="([^"]*)"/.exec(trigger![0])![1].split(/\s+/)
    expect(classes).toContain('border-dashed')
    expect(classes).toContain('border-border-strong')
    expect(empty).toContain('Filter')
  })

  it('draws an applied filter as a white chip on the hairline halo, not a grey fill', () => {
    const chip = /class="(inline-flex[^"]*)"/.exec(markup())![1].split(/\s+/)
    expect(chip).toContain('bg-surface')
    expect(chip).toContain('shadow-control')
    expect(chip.filter((c) => c.startsWith('bg-surface-elevated'))).toEqual([])
  })
})

describe('the floating selection toolbar', () => {
  // Rendering the bar needs a loaded table, so it is read from the source.
  const source = () =>
    readFileSync(resolve('src/renderer/src/features/tables/components/selection-bar.tsx'), 'utf8')

  it('floats as a light card: white, soft shadow, rounded rather than a pill', () => {
    // Keyed on the entrance animation the bar is the only user of.
    const bar = /className="(animate-slide-up-fade pointer-events-auto[^"]*)"/.exec(source())
    expect(bar, 'could not find the floating selection bar').not.toBeNull()
    const classes = bar![1].split(/\s+/)
    expect(classes).toContain('rounded-xl')
    expect(classes).toContain('bg-surface')
    expect(classes).toContain('shadow-pop')
    expect(source(), 'nothing in this view should be a pill any more').not.toMatch(/rounded-full/)
  })

  it('carries nothing left over from the dark theme', () => {
    expect(source()).not.toMatch(/white\/|black\/|backdrop-blur|shadow-2xl/)
  })

  it('does not make the delete button glow', () => {
    // A coloured drop shadow under a red fill reads as a halo, not depth.
    expect(source()).not.toMatch(/shadow-danger/)
  })

  it('takes the delete button from the destructive variant instead of repainting the primary', () => {
    // Repainting `default` was a trap: its blue bevel and blue focus ring had to
    // be overridden one by one, and closing the confirm dialog restores focus to
    // this button. The destructive variant has neither to begin with.
    const button = /<Button[^>]*variant="([^"]*)"[^>]*onClick=\{onDelete\}/.exec(source())
    expect(button, 'could not find the delete button').not.toBeNull()
    expect(button![1]).toBe('destructive')

    const classes = classesOf(markupOf(createElement(Button, { variant: 'destructive' }, 'Delete')))
    expect(classes).toContain('bg-danger-fill')
    expect(classes).not.toMatch(/accent/)
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
