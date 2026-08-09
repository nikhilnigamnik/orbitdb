/**
 * The message to show a user for anything thrown. Non-Error throws reach the
 * renderer through the IPC envelope, so the narrow `err.message` is not enough.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return String(err)
}
