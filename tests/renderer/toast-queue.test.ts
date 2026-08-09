import { describe, expect, it } from 'vitest'
import { dismissToast, durationFor, pushToast, type Toast } from '@renderer/lib/toast-queue'
import { MAX_TOASTS, TOAST_ACTION_MIN_MS, TOAST_DURATION_MS } from '@renderer/config/site'

function push(list: Toast[], options: Parameters<typeof pushToast>[1], id = `t${list.length}`) {
  return pushToast(list, options, id)
}

describe('how long a toast stays up', () => {
  it('is longer for a failure than for a confirmation', () => {
    expect(durationFor({ title: 'Saved', tone: 'success' })).toBe(TOAST_DURATION_MS.success)
    expect(durationFor({ title: 'Failed', tone: 'error' })).toBeGreaterThan(
      TOAST_DURATION_MS.success
    )
  })

  it('never expires before an action on it could be clicked', () => {
    // A Refresh button that vanishes in four seconds is decoration.
    const withAction = durationFor({
      title: 'Could not load rows',
      tone: 'success',
      action: { label: 'Refresh', onClick: () => {} }
    })
    expect(withAction).toBe(TOAST_ACTION_MIN_MS)
  })

  it('honours an explicit duration over both', () => {
    expect(durationFor({ title: 'x', tone: 'error', duration: 500 })).toBe(500)
  })
})

describe('a message that fires again', () => {
  it('counts up in place rather than stacking copies', () => {
    // A failing poll would otherwise paper the screen with one error.
    let list = push([], { title: 'Could not load rows', tone: 'error' })
    list = push(list, { title: 'Could not load rows', tone: 'error' })
    list = push(list, { title: 'Could not load rows', tone: 'error' })

    expect(list).toHaveLength(1)
    expect(list[0].count).toBe(3)
  })

  it('keeps the newest action, so a stale closure is not left behind', () => {
    const first = () => {}
    const second = () => {}
    let list = push([], {
      title: 'Failed',
      tone: 'error',
      action: { label: 'Refresh', onClick: first }
    })
    list = push(list, {
      title: 'Failed',
      tone: 'error',
      action: { label: 'Refresh', onClick: second }
    })

    expect(list[0].action?.onClick).toBe(second)
  })

  it('is a separate toast when the detail differs', () => {
    let list = push([], { title: 'Delete failed', tone: 'error', description: 'row 1' })
    list = push(list, { title: 'Delete failed', tone: 'error', description: 'row 2' })

    expect(list).toHaveLength(2)
  })

  it('is a separate toast when something else came in between', () => {
    // Only the newest collapses: counting up a toast buried under two others
    // would bump a number nobody is looking at.
    let list = push([], { title: 'Saved', tone: 'success' })
    list = push(list, { title: 'Deleted', tone: 'success' })
    list = push(list, { title: 'Saved', tone: 'success' })

    expect(list).toHaveLength(3)
  })
})

describe('the stack', () => {
  it('drops the oldest once it is full', () => {
    let list: Toast[] = []
    for (let i = 0; i < MAX_TOASTS + 2; i++) {
      list = push(list, { title: `message ${i}`, tone: 'info' })
    }

    expect(list).toHaveLength(MAX_TOASTS)
    expect(list[0].title).toBe('message 2')
    expect(list[list.length - 1].title).toBe(`message ${MAX_TOASTS + 1}`)
  })

  it('drops just the one dismissed', () => {
    let list = push([], { title: 'a', tone: 'info' }, 'id-a')
    list = push(list, { title: 'b', tone: 'info' }, 'id-b')

    expect(dismissToast(list, 'id-a').map((t) => t.title)).toEqual(['b'])
  })

  it('is unchanged by dismissing something already gone', () => {
    const list = push([], { title: 'a', tone: 'info' }, 'id-a')
    expect(dismissToast(list, 'id-x')).toHaveLength(1)
  })
})

describe('defaults', () => {
  it('treats a toast with no tone as information', () => {
    const [toast] = push([], { title: 'Copied' })
    expect(toast.tone).toBe('info')
    expect(toast.count).toBe(1)
  })
})
