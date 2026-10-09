import type { DatabaseEngine } from '@renderer/types'
import { DEFAULT_PORTS } from '@renderer/config/site'

export interface ParsedConnection {
  engine: DatabaseEngine
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean
}

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:'])
const MYSQL_PROTOCOLS = new Set(['mysql:', 'mariadb:'])

function detectEngine(protocol: string): DatabaseEngine | null {
  if (POSTGRES_PROTOCOLS.has(protocol)) return 'postgres'
  if (MYSQL_PROTOCOLS.has(protocol)) return 'mysql'
  return null
}

function detectSsl(url: URL, engine: DatabaseEngine): boolean {
  const mode = url.searchParams.get('sslmode') || url.searchParams.get('ssl-mode')
  if (mode) {
    const lowered = mode.toLowerCase()
    if (['disable', 'allow', 'prefer'].includes(lowered)) return false
    return true
  }
  const ssl = url.searchParams.get('ssl')
  if (ssl) {
    const lowered = ssl.toLowerCase()
    if (['0', 'false', 'no', 'disable', 'disabled'].includes(lowered)) return false
    return true
  }
  // No mode in the URL. These providers refuse an unencrypted connection
  // outright (Neon answers "connection is insecure"), so a URL copied without
  // its query string would otherwise save a connection that can never open.
  // Anywhere else stays off, since plenty of local servers have no TLS at all.
  void engine
  return isTlsOnlyHost(url.hostname)
}

/** Managed hosts that reject a connection without TLS. Suffixes, matched on a dot. */
const TLS_ONLY_HOST_SUFFIXES = ['neon.tech', 'supabase.co', 'supabase.com', 'psdb.cloud']

function isTlsOnlyHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return TLS_ONLY_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

export function parseConnectionUrl(input: string): ParsedConnection | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  const engine = detectEngine(url.protocol)
  if (!engine) return null

  // URL keeps IPv6 literals bracketed ([::1]); the drivers want the bare address.
  const host = url.hostname.replace(/^\[(.+)\]$/, '$1')
  if (!host) return null

  const portStr = url.port
  const port = portStr ? parseInt(portStr, 10) : DEFAULT_PORTS[engine]
  if (!Number.isFinite(port) || port <= 0) return null

  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  const user = url.username ? decodeURIComponent(url.username) : ''
  const password = url.password ? decodeURIComponent(url.password) : ''
  const ssl = detectSsl(url, engine)

  return { engine, host, port, database, user, password, ssl }
}
