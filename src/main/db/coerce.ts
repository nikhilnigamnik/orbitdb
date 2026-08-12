/**
 * Counts arrive typed differently per client - pg returns bigints as strings,
 * mysql2 may return either - so anything read as a number goes through here.
 */
export function toCount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}
