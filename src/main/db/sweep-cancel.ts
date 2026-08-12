/**
 * Ids the user has asked to abandon.
 *
 * A sweep cannot be cancelled the way a single query can - it is many small
 * queries rather than one long one - so it is polled between steps instead, and
 * the work already done is still returned. Shared by every sweep in the app
 * (value search, reference check) so they cannot drift apart.
 */
const cancelled = new Set<string>()

export function requestSweepCancel(sweepId: string): void {
  cancelled.add(sweepId)
}

export function isSweepCancelled(sweepId?: string): boolean {
  return sweepId ? cancelled.has(sweepId) : false
}

/** Called when a sweep finishes, so an id cannot poison a later reuse. */
export function clearSweepCancel(sweepId?: string): void {
  if (sweepId) cancelled.delete(sweepId)
}
