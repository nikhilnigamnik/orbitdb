import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  error: string | null
  isLoading: boolean
}

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: ReadonlyArray<unknown> = []
): AsyncState<T> & { refresh: () => Promise<void> } {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    isLoading: true
  })
  const fnRef = useRef(fn)
  fnRef.current = fn
  const mountedRef = useRef(true)
  // Only the latest request may write state: when the deps change mid-flight,
  // a slow reply for the old key must not overwrite the new one.
  const requestIdRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current
    const isCurrent = () => mountedRef.current && requestId === requestIdRef.current
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      const data = await fnRef.current()
      if (!isCurrent()) return
      setState({ data, error: null, isLoading: false })
    } catch (err) {
      if (!isCurrent()) return
      const message = err instanceof Error ? err.message : String(err)
      setState({ data: null, error: message, isLoading: false })
    }
  }, [])

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { ...state, refresh }
}
