import { BrowserWindow, nativeTheme } from 'electron'
import type { ThemePreference } from '../../shared/types'
import { getThemePreference, setThemePreference } from '../store/appearance-store'

/**
 * The canvas colour of each theme, painted by the window before the renderer's
 * first frame. Must match `--color-surface` in main.css, or the window flashes
 * the wrong colour on launch and on every switch.
 */
const WINDOW_BACKGROUND = { light: '#ffffff', dark: '#1c1d20' } as const

export function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? WINDOW_BACKGROUND.dark : WINDOW_BACKGROUND.light
}

/**
 * The theme is applied through `nativeTheme.themeSource`, not a class on the
 * page. That one switch drives Chromium's `prefers-color-scheme` - which the
 * stylesheet reads - and the native parts the page cannot style: the traffic
 * lights, context menus and form controls. "system" hands it back to the OS,
 * so a scheduled macOS switch at sunset follows through on its own.
 */
export function applyStoredTheme(): void {
  nativeTheme.themeSource = getThemePreference()
  // Fires for an OS change as well as for ours.
  nativeTheme.on('updated', () => {
    const background = windowBackground()
    for (const window of BrowserWindow.getAllWindows()) window.setBackgroundColor(background)
  })
}

export function changeTheme(theme: ThemePreference): ThemePreference {
  const saved = setThemePreference(theme)
  nativeTheme.themeSource = saved
  return saved
}
