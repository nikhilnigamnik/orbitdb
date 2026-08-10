/**
 * Handing a string to the OS URL handler is a shell-launch primitive: a
 * `file:`, `smb:` or custom-scheme URL can open an application rather than a
 * page. Every path out of the app goes through this check.
 *
 * It matters because the renderer displays content the app does not author -
 * database identifiers, and AI output grounded in them - and a link in that
 * content reaches `setWindowOpenHandler` via `target="_blank"`.
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/** The URL to open, or null when it must not be handed to the OS. */
export function safeExternalUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  return ALLOWED_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : null
}
