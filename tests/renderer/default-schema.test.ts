import { describe, expect, it } from 'vitest'
import { defaultSchema } from '@renderer/features/database/components/default-schema'

describe('defaultSchema', () => {
  it("prefers Postgres's conventional schema over the alphabetically first", () => {
    // Supabase lists `auth` first, which is not where anyone's tables are.
    expect(defaultSchema(['auth', 'extensions', 'public', 'storage'])).toBe('public')
  })

  it('takes the only schema there is', () => {
    expect(defaultSchema(['main'])).toBe('main')
  })

  it('takes the database the connection was opened on, on a MySQL server', () => {
    expect(defaultSchema(['analytics', 'app', 'billing'], 'app')).toBe('app')
  })

  it('ignores a current database that is not a listed schema', () => {
    expect(defaultSchema(['alpha', 'beta'], 'app')).toBe('alpha')
  })

  it('is empty when there is nothing to choose', () => {
    expect(defaultSchema([])).toBe('')
  })
})
