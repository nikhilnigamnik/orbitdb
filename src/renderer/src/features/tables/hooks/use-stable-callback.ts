import * as React from 'react'

/**
 * A function whose identity never changes but which always runs the latest
 * `fn`. For handlers handed to memoised grid rows: an inline closure is a new
 * prop on every render, and that alone re-rendered every row.
 */
export function useStableCallback<A extends unknown[], R>(
  fn: (...args: A) => R
): (...args: A) => R {
  const ref = React.useRef(fn)
  React.useLayoutEffect(() => {
    ref.current = fn
  })
  return React.useCallback((...args: A) => ref.current(...args), [])
}
