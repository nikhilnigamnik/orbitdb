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

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      const data = await fnRef.current()
      if (!mountedRef.current) return
      setState({ data, error: null, isLoading: false })
    } catch (err) {
      if (!mountedRef.current) return
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
