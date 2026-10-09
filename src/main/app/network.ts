import { setDefaultAutoSelectFamilyAttemptTimeout } from 'net'

/**
 * How long each address gets when a host name resolves to several.
 *
 * Node tries a host's addresses in turn ("happy eyeballs") and gives each one
 * only 250 ms by default. On a link with a round trip longer than that - a phone
 * hotspot, a distant region - every attempt is abandoned just before it would
 * have answered, and a reachable database reports "connection timeout". Neon
 * from India over a hotspot measured 275 ms and failed every time; at 1 s it
 * connected in 1.7 s. Still well inside the drivers' own 8 s connect timeout,
 * so a dead address (IPv6 on a network that does not route it) costs little.
 */
export const ADDRESS_ATTEMPT_TIMEOUT_MS = 2_000

export function configureNetwork(): void {
  setDefaultAutoSelectFamilyAttemptTimeout(ADDRESS_ATTEMPT_TIMEOUT_MS)
}
