import { describe, expect, it } from 'vitest'

import { hasSqlBody } from '@renderer/features/query/lib/sql-text'

describe('hasSqlBody', () => {
  it('sees a statement', () => {
    expect(hasSqlBody('select 1')).toBe(true)
    expect(hasSqlBody('-- note\nselect 1')).toBe(true)
  })

  it('does not count comments and blank space as a query', () => {
    expect(hasSqlBody('')).toBe(false)
    expect(hasSqlBody('   \n ')).toBe(false)
    expect(hasSqlBody('-- Write SQL here. ⌘/Ctrl+Enter to run.')).toBe(false)
    expect(hasSqlBody('/* a\\n block */  -- and a line')).toBe(false)
  })
})
