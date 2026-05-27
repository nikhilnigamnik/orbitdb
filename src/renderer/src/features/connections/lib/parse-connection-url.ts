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
  // Neon / managed Postgres URLs frequently include sslmode=require but some
  // omit it and require SSL anyway. Heuristic: hosts ending in .neon.tech or
  // .supabase.co etc. need SSL. We avoid that guesswork and default false.
  void engine
  return false
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

  const host = url.hostname
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
