import { describe, expect, it } from 'vitest'
import { detectCommand, isSchemaChanging } from '../../../src/main/db/sql-command'

describe('detectCommand', () => {
  it('reads the leading keyword, uppercased', () => {
    expect(detectCommand('select * from users')).toBe('SELECT')
    expect(detectCommand('  insert into t values (1)')).toBe('INSERT')
  })

  it('skips leading line and block comments', () => {
    expect(detectCommand('-- fetch everyone\nselect * from users')).toBe('SELECT')
    expect(detectCommand('/* header */ update users set a = 1')).toBe('UPDATE')
    expect(detectCommand('-- one\n-- two\n/* three */\ndelete from users')).toBe('DELETE')
  })

  it('returns null for empty or comment-only input', () => {
    expect(detectCommand('')).toBeNull()
    expect(detectCommand('   ')).toBeNull()
    expect(detectCommand('-- nothing here')).toBeNull()
  })
})

describe('isSchemaChanging', () => {
  it('flags DDL', () => {
    expect(isSchemaChanging('alter table users add column x text')).toBe(true)
    expect(isSchemaChanging('DROP TABLE users')).toBe(true)
    expect(isSchemaChanging('create unique index i on users (a)')).toBe(true)
    expect(isSchemaChanging('truncate table users')).toBe(true)
  })

  it('flags DDL hidden after another statement in a batch', () => {
    expect(isSchemaChanging('insert into users values (1); alter table users drop column x')).toBe(
      true
    )
  })

  it('leaves plain DML alone', () => {
    expect(isSchemaChanging('select * from users')).toBe(false)
    expect(isSchemaChanging('update users set name = 1')).toBe(false)
    expect(isSchemaChanging('delete from users where id = 1')).toBe(false)
  })

  it('does not fire on words that merely contain a keyword', () => {
    expect(isSchemaChanging('select * from created_at_log')).toBe(false)
    expect(isSchemaChanging('select dropped from stats')).toBe(false)
  })
})
