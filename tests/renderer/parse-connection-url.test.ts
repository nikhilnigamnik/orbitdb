import { describe, expect, it } from 'vitest'
import { parseConnectionUrl } from '../../src/renderer/src/features/connections/lib/parse-connection-url'

describe('parseConnectionUrl', () => {
  it('parses a postgres URL', () => {
    expect(parseConnectionUrl('postgres://me:s3cret@db.example.com:5432/app')).toEqual({
      engine: 'postgres',
      host: 'db.example.com',
      port: 5432,
      database: 'app',
      user: 'me',
      password: 's3cret',
      ssl: false
    })
  })

  it('accepts the postgresql:, mysql: and mariadb: schemes', () => {
    expect(parseConnectionUrl('postgresql://h/db')?.engine).toBe('postgres')
    expect(parseConnectionUrl('mysql://h/db')?.engine).toBe('mysql')
    expect(parseConnectionUrl('mariadb://h/db')?.engine).toBe('mysql')
  })

  it('falls back to the engine default port', () => {
    expect(parseConnectionUrl('postgres://h/db')?.port).toBe(5432)
    expect(parseConnectionUrl('mysql://h/db')?.port).toBe(3306)
  })

  it('percent-decodes credentials and the database name', () => {
    const parsed = parseConnectionUrl('postgres://a%40b:p%40ss%2Fword@h:5432/my%20db')
    expect(parsed?.user).toBe('a@b')
    expect(parsed?.password).toBe('p@ss/word')
    expect(parsed?.database).toBe('my db')
  })

  it('reads sslmode, treating the non-verifying modes as off', () => {
    expect(parseConnectionUrl('postgres://h/db?sslmode=require')?.ssl).toBe(true)
    expect(parseConnectionUrl('postgres://h/db?sslmode=verify-full')?.ssl).toBe(true)
    expect(parseConnectionUrl('postgres://h/db?sslmode=disable')?.ssl).toBe(false)
    expect(parseConnectionUrl('postgres://h/db?sslmode=prefer')?.ssl).toBe(false)
    expect(parseConnectionUrl('mysql://h/db?ssl=true')?.ssl).toBe(true)
    expect(parseConnectionUrl('mysql://h/db?ssl=0')?.ssl).toBe(false)
    expect(parseConnectionUrl('postgres://h/db')?.ssl).toBe(false)
  })

  it('unbrackets IPv6 hosts, which the drivers want bare', () => {
    expect(parseConnectionUrl('postgres://[::1]:5432/app')?.host).toBe('::1')
    expect(parseConnectionUrl('postgres://[2001:db8::1]/app')?.host).toBe('2001:db8::1')
  })

  it('rejects anything that is not a database URL', () => {
    expect(parseConnectionUrl('')).toBeNull()
    expect(parseConnectionUrl('   ')).toBeNull()
    expect(parseConnectionUrl('not a url')).toBeNull()
    expect(parseConnectionUrl('https://example.com')).toBeNull()
    expect(parseConnectionUrl('redis://h:6379')).toBeNull()
  })
})
