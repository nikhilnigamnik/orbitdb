const UNREACHABLE = 'Could not reach the server'

/** One failure's own words: its message, else its code. Empty if it has neither. */
function reason(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  if (err.message) return err.message
  const code = (err as NodeJS.ErrnoException).code
  if (code === 'ETIMEDOUT') return 'the connection timed out (ETIMEDOUT)'
  return code ?? ''
}

/**
 * A readable message for anything a driver throws.
 *
 * Node reports a connection that failed on every address of a host as an
 * `AggregateError` whose own message is empty - so the connection card said
 * "Unreachable" with nothing after it. Its parts carry the real reasons.
 */
export function describeError(err: unknown): string {
  const own = reason(err)
  if (own && (!(err instanceof Error) || err.message)) return own

  const parts =
    err instanceof AggregateError ? [...new Set(err.errors.map(reason).filter(Boolean))] : []
  if (parts.length > 0) return `${UNREACHABLE}: ${parts.join('; ')}`
  if (own) return `${UNREACHABLE}: ${own}`
  return err instanceof Error && err.name !== 'Error' ? `${UNREACHABLE} (${err.name})` : UNREACHABLE
}
