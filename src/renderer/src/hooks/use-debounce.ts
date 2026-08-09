import * as React from 'react'

/**
 * The value, held back until it has stopped changing for `delayMs`. For keeping
 * a keystroke-driven input from firing a query per character.
 */
export function useDebounce<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = React.useState(value)

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
