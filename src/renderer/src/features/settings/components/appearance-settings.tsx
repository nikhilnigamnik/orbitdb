import { RadioGroup } from 'radix-ui'

import { useToast } from '@renderer/components/ui/toast'
import { FOCUS_RING } from '@renderer/components/ui/focus-ring'
import { errorMessage } from '@renderer/lib/errors'
import { cn } from '@renderer/lib/utils'
import { APP_NAME, THEME_PREFERENCES, isThemePreference } from '@renderer/config/site'
import type { ThemePreference } from '@renderer/types'

import { useTheme } from '../theme'
import { SettingsCard } from './settings-card'

const THEME_LABEL: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark'
}

/**
 * The thumbnail colours are written out rather than read from tokens: the
 * Light card has to look light while the app is dark, and the other way round.
 * They mirror the canvas, sidebar, hairline and selected-row tokens of each
 * theme in main.css.
 */
const PREVIEW = {
  light: {
    canvas: 'bg-[#ffffff]',
    sidebar: 'bg-[#fbfbfb]',
    border: 'border-[#eeeff1]',
    line: 'bg-[#e3e4e8]',
    ink: 'bg-[#b9bbc0]',
    selected: 'bg-[#eeeff1]'
  },
  dark: {
    canvas: 'bg-[#1c1d20]',
    sidebar: 'bg-[#161719]',
    border: 'border-[#232428]',
    line: 'bg-[#303237]',
    ink: 'bg-[#5d6066]',
    selected: 'bg-[#2d2f33]'
  }
} as const

const PREVIEW_ROW_WIDTHS = ['w-6', 'w-8', 'w-5', 'w-7']

function MiniWindow({ scheme, className }: { scheme: 'light' | 'dark'; className?: string }) {
  const c = PREVIEW[scheme]
  return (
    <div aria-hidden className={cn('absolute inset-0 flex', c.canvas, className)}>
      <div className={cn('flex w-[32%] flex-col gap-1.5 border-r p-2', c.sidebar, c.border)}>
        <span className={cn('mb-1 h-1.5 w-7 rounded-full', c.ink)} />
        <span className={cn('-mx-1 flex h-3 items-center rounded px-1', c.selected)}>
          <span className={cn('h-1 w-8 rounded-full', c.ink)} />
        </span>
        <span className={cn('h-1 w-6 rounded-full', c.line)} />
        <span className={cn('h-1 w-9 rounded-full', c.line)} />
        <span className={cn('h-1 w-5 rounded-full', c.line)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className={cn('flex h-5 items-center border-b px-2', c.border)}>
          <span className={cn('h-1.5 w-10 rounded-full', c.ink)} />
          <span className="ml-auto h-2.5 w-6 rounded-sm bg-[#266df0]" />
        </div>
        {PREVIEW_ROW_WIDTHS.map((width, i) => (
          <div key={i} className={cn('flex h-4 items-center gap-2 border-b px-2', c.border)}>
            <span className={cn('h-1 rounded-full', width, c.line)} />
            <span className={cn('h-1 w-6 rounded-full', c.line)} />
          </div>
        ))}
      </div>
    </div>
  )
}

function ThemePreview({ theme }: { theme: ThemePreference }) {
  if (theme !== 'system') return <MiniWindow scheme={theme} />
  // System shows both halves, split on a diagonal as macOS draws its own
  // "Auto" appearance.
  return (
    <>
      <MiniWindow scheme="light" />
      <MiniWindow scheme="dark" className="[clip-path:polygon(58%_0,100%_0,100%_100%,42%_100%)]" />
    </>
  )
}

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const toast = useToast()

  async function choose(value: string) {
    if (!isThemePreference(value)) return
    try {
      await setTheme(value)
    } catch (err) {
      toast.error('Could not change the theme', { description: errorMessage(err) })
    }
  }

  return (
    <SettingsCard>
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-text">Theme</span>
          <span className="text-xs text-text-muted">
            Choose how {APP_NAME} looks. System follows your computer&rsquo;s appearance and
            switches with it.
          </span>
        </div>

        <RadioGroup.Root
          value={theme}
          onValueChange={(value) => void choose(value)}
          aria-label="Theme"
          className="grid max-w-xl grid-cols-3 gap-4"
        >
          {THEME_PREFERENCES.map((option) => {
            const isSelected = option === theme
            return (
              <RadioGroup.Item
                key={option}
                value={option}
                className={cn(
                  'group flex cursor-pointer flex-col gap-2 rounded-xl text-left',
                  FOCUS_RING
                )}
              >
                <span
                  className={cn(
                    // A border, not shadow-control: the Dark card on the dark canvas
                    // otherwise has no edge at all.
                    'relative block aspect-[16/10] w-full overflow-hidden rounded-lg border border-border-strong transition-shadow',
                    isSelected
                      ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface'
                      : 'group-hover:border-text-subtle/45'
                  )}
                >
                  <ThemePreview theme={option} />
                </span>
                <span className="flex items-center gap-2 px-0.5">
                  <span
                    className={cn(
                      'flex size-3.5 shrink-0 items-center justify-center rounded-full border transition-colors',
                      isSelected ? 'border-accent bg-accent' : 'border-border-control bg-surface'
                    )}
                  >
                    <RadioGroup.Indicator className="size-1.5 rounded-full bg-white" />
                  </span>
                  <span className="text-xs font-medium text-text">{THEME_LABEL[option]}</span>
                </span>
              </RadioGroup.Item>
            )
          })}
        </RadioGroup.Root>
      </div>
    </SettingsCard>
  )
}
