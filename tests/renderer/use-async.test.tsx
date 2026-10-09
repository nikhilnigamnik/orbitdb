// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useAsync } from '@renderer/hooks/use-async'

afterEach(cleanup)

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useAsync', () => {
  it('resolves to the data the function returns', async () => {
    const { result } = renderHook(() => useAsync(async () => 'rows', []))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toBe('rows')
    expect(result.current.error).toBeNull()
  })

  it('keeps the newer reply when an older one lands after it', async () => {
    const replies: Record<string, Deferred<string>> = {
      big: deferred<string>(),
      small: deferred<string>()
    }
    const { result, rerender } = renderHook(
      ({ schema }: { schema: string }) => useAsync(() => replies[schema].promise, [schema]),
      { initialProps: { schema: 'big' } }
    )

    rerender({ schema: 'small' })
    await act(async () => replies.small.resolve('small tables'))
    expect(result.current.data).toBe('small tables')

    await act(async () => replies.big.resolve('big tables'))
    expect(result.current.data).toBe('small tables')
    expect(result.current.isLoading).toBe(false)
  })

  it('ignores a stale failure too', async () => {
    const replies: Record<string, Deferred<string>> = {
      a: deferred<string>(),
      b: deferred<string>()
    }
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useAsync(() => replies[key].promise, [key]),
      { initialProps: { key: 'a' } }
    )

    rerender({ key: 'b' })
    await act(async () => replies.b.resolve('fresh'))
    await act(async () => replies.a.reject(new Error('old connection closed')))

    expect(result.current.data).toBe('fresh')
    expect(result.current.error).toBeNull()
  })

  it('lets a manual refresh supersede the request already in flight', async () => {
    const first = deferred<number>()
    const second = deferred<number>()
    const queue = [first, second]
    const { result } = renderHook(() => useAsync(() => queue.shift()!.promise, []))

    let refreshing: Promise<void> = Promise.resolve()
    act(() => {
      refreshing = result.current.refresh()
    })
    await act(async () => {
      second.resolve(2)
      await refreshing
    })
    await act(async () => first.resolve(1))

    expect(result.current.data).toBe(2)
  })
})
