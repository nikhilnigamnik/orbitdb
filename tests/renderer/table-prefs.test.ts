// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  forgetTableRef,
  loadPinned,
  loadRecent,
  pushRecent,
  renameTableRef,
  savePinned
} from '@renderer/features/database/lib/table-prefs'

beforeEach(() => localStorage.clear())

const users = { schema: 'public', table: 'users' }
const people = { schema: 'public', table: 'people' }
const orders = { schema: 'public', table: 'orders' }

describe('renameTableRef', () => {
  it('moves the pin and the recent entry to the new name, in place', () => {
    savePinned('c1', [orders, users])
    pushRecent('c1', users)

    renameTableRef('c1', users, people)

    expect(loadPinned('c1')).toEqual([orders, people])
    expect(loadRecent('c1')).toEqual([people])
  })

  it('leaves other connections alone', () => {
    savePinned('c2', [users])
    renameTableRef('c1', users, people)
    expect(loadPinned('c2')).toEqual([users])
  })
})

describe('forgetTableRef', () => {
  it('drops a dropped table from the pins and recents', () => {
    savePinned('c1', [orders, users])
    pushRecent('c1', users)
    pushRecent('c1', orders)

    forgetTableRef('c1', users)

    expect(loadPinned('c1')).toEqual([orders])
    expect(loadRecent('c1')).toEqual([orders])
  })
})
