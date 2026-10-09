/**
 * TLS options for the socket drivers, built from one place so Postgres and MySQL
 * cannot disagree about what "verify" means.
 */

import { isIP } from 'net'
import type { ConnectionInput } from '../../shared/types'

export interface PgTlsOptions {
  rejectUnauthorized: boolean
  servername?: string
}

export interface MysqlTlsOptions {
  rejectUnauthorized: boolean
  verifyIdentity: boolean
}

/** Absent means a connection saved before the option existed, which never verified. */
export function shouldVerifyTls(input: ConnectionInput): boolean {
  return input.sslVerify === true
}

/** SNI carries a host name; an IP literal there is a protocol violation some servers reject. */
function serverName(host: string): string | undefined {
  const trimmed = host.trim()
  if (!trimmed || isIP(trimmed) !== 0) return undefined
  return trimmed
}

export function pgTlsOptions(input: ConnectionInput): PgTlsOptions | false {
  if (!input.ssl) return false
  const options: PgTlsOptions = { rejectUnauthorized: shouldVerifyTls(input) }
  const servername = serverName(input.host)
  if (servername) options.servername = servername
  return options
}

/**
 * mysql2 checks the chain on `rejectUnauthorized` but skips the host name check
 * unless `verifyIdentity` is also set, so a certificate issued to any other host
 * by a trusted CA would pass. Verifying means both. It derives SNI from the host
 * itself and ignores a `servername` here.
 */
export function mysqlTlsOptions(input: ConnectionInput): MysqlTlsOptions | undefined {
  if (!input.ssl) return undefined
  const shouldVerify = shouldVerifyTls(input)
  return { rejectUnauthorized: shouldVerify, verifyIdentity: shouldVerify }
}
