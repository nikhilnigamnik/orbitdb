import * as React from 'react'

import { unwrap } from '@renderer/lib/ipc'
import { DEFAULT_THEME_PREFERENCE } from '@renderer/config/site'
import type { ThemePreference } from '@renderer/types'

interface ThemeContextValue {
  theme: ThemePreference
  /** Applies at once; rejects (and puts the old theme back) if it could not be saved. */
  setTheme: (theme: ThemePreference) => Promise<void>
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

/**
 * Holds the stored preference, not the colours. Main applies it through
 * `nativeTheme.themeSource`, and the stylesheet follows `prefers-color-scheme`
 * - so nothing here touches the DOM, and the first frame is already right
 * because main set the theme before the window opened.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<ThemePreference>(DEFAULT_THEME_PREFERENCE)
  const themeRef = React.useRef(theme)
  themeRef.current = theme

  React.useEffect(() => {
    let isCurrent = true
    void (async () => {
      try {
        const stored = await unwrap(window.api.app.getTheme())
        if (isCurrent) setThemeState(stored)
      } catch {
        // The page is already painted in the right theme; only the picker's
        // selection is missing, and it falls back to the default.
      }
    })()
    return () => {
      isCurrent = false
    }
  }, [])

  const setTheme = React.useCallback(async (next: ThemePreference) => {
    const previous = themeRef.current
    setThemeState(next)
    try {
      setThemeState(await unwrap(window.api.app.setTheme(next)))
    } catch (err) {
      setThemeState(previous)
      throw err
    }
  }, [])

  const value = React.useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
