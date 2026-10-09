import { describe, expect, it } from 'vitest'
import { mysqlTlsOptions, pgTlsOptions, shouldVerifyTls } from '../../../src/main/db/tls'
import type { ConnectionInput } from '../../../src/shared/types'

function input(overrides: Partial<ConnectionInput> = {}): ConnectionInput {
  return {
    name: 'db',
    engine: 'postgres',
    environment: 'dev',
    host: 'db.example.com',
    port: 5432,
    database: 'app',
    user: 'app',
    password: 'secret',
    ssl: true,
    ...overrides
  }
}

describe('whether to verify', () => {
  it('keeps the old behaviour for a connection saved before the option existed', () => {
    expect(shouldVerifyTls(input())).toBe(false)
  })

  it('verifies only when asked to', () => {
    expect(shouldVerifyTls(input({ sslVerify: true }))).toBe(true)
    expect(shouldVerifyTls(input({ sslVerify: false }))).toBe(false)
  })
})

describe('Postgres TLS options', () => {
  it('is off when TLS is off, whatever verify says', () => {
    expect(pgTlsOptions(input({ ssl: false, sslVerify: true }))).toBe(false)
  })

  it('checks the certificate and names the host when verifying', () => {
    expect(pgTlsOptions(input({ sslVerify: true }))).toEqual({
      rejectUnauthorized: true,
      servername: 'db.example.com'
    })
  })

  it('accepts any certificate when not verifying', () => {
    expect(pgTlsOptions(input())).toEqual({
      rejectUnauthorized: false,
      servername: 'db.example.com'
    })
  })

  it('sends no SNI for an IP literal, which the protocol does not allow', () => {
    expect(pgTlsOptions(input({ host: '10.0.0.5', sslVerify: true }))).toEqual({
      rejectUnauthorized: true
    })
    expect(pgTlsOptions(input({ host: '::1', sslVerify: true }))).toEqual({
      rejectUnauthorized: true
    })
  })
})

describe('MySQL TLS options', () => {
  it('is absent when TLS is off', () => {
    expect(mysqlTlsOptions(input({ engine: 'mysql', ssl: false, sslVerify: true }))).toBeUndefined()
  })

  it('checks the host name too when verifying, which mysql2 skips by default', () => {
    expect(mysqlTlsOptions(input({ engine: 'mysql', sslVerify: true }))).toEqual({
      rejectUnauthorized: true,
      verifyIdentity: true
    })
  })

  it('checks neither when not verifying', () => {
    expect(mysqlTlsOptions(input({ engine: 'mysql' }))).toEqual({
      rejectUnauthorized: false,
      verifyIdentity: false
    })
  })
})
