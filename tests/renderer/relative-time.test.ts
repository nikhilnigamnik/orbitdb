import { describe, expect, it } from 'vitest'
import { formatShortAgo } from '../../src/renderer/src/features/logs/lib/relative-time'

const NOW = new Date('2026-10-09T12:00:00+05:30')
const ago = (ms: number) => new Date(NOW.getTime() - ms)
const MIN = 60_000

describe('the short "ran" time in the query log', () => {
  it('says just now under a minute, rather than a phrase the column truncates', () => {
    expect(formatShortAgo(ago(20_000), NOW)).toBe('just now')
  })

  it('counts minutes, hours and days in one short unit', () => {
    expect(formatShortAgo(ago(5 * MIN), NOW)).toBe('5m ago')
    expect(formatShortAgo(ago(3 * 60 * MIN), NOW)).toBe('3h ago')
    expect(formatShortAgo(ago(2 * 24 * 60 * MIN), NOW)).toBe('2d ago')
  })

  it('falls back to a date once it is over a week old', () => {
    expect(formatShortAgo(new Date('2026-09-01T09:00:00+05:30'), NOW)).toBe('1 Sep 2026')
  })
})
