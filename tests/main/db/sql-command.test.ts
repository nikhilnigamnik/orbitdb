import { describe, expect, it } from 'vitest'
import {
  detectCommand,
  hasMultipleStatements,
  isSchemaChanging
} from '../../../src/main/db/sql-command'

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

describe('isSchemaChanging and the editor transaction', () => {
  it('flags a commit, which is when DDL in an open transaction becomes visible', () => {
    expect(isSchemaChanging('commit')).toBe(true)
    expect(isSchemaChanging('COMMIT;')).toBe(true)
    expect(isSchemaChanging('end')).toBe(true)
    expect(isSchemaChanging('end transaction;')).toBe(true)
  })

  it('does not mistake the end of a CASE for one', () => {
    expect(isSchemaChanging('select case when a then 1 else 2 end from t')).toBe(false)
  })
})

describe('hasMultipleStatements', () => {
  it('treats one statement as one, trailing semicolons and all', () => {
    expect(hasMultipleStatements('select 1')).toBe(false)
    expect(hasMultipleStatements('select 1;')).toBe(false)
    expect(hasMultipleStatements('select 1;;  \n')).toBe(false)
    expect(hasMultipleStatements('select 1; -- done\n/* really */')).toBe(false)
  })

  it('finds a second statement', () => {
    expect(hasMultipleStatements('insert into t values (1); insert into t values (2)')).toBe(true)
    expect(hasMultipleStatements('begin;\nupdate t set a = 1')).toBe(true)
  })

  it('ignores semicolons inside strings, identifiers and comments', () => {
    expect(hasMultipleStatements("select 'a;b' from t")).toBe(false)
    expect(hasMultipleStatements("select 'it''s; fine'")).toBe(false)
    expect(hasMultipleStatements("select E'it\\'s; fine'")).toBe(false)
    expect(hasMultipleStatements('select "odd;name" from t')).toBe(false)
    expect(hasMultipleStatements('select `odd;name` from t')).toBe(false)
    expect(hasMultipleStatements('select 1 -- a; b\n')).toBe(false)
    expect(hasMultipleStatements('select /* a; /* nested; */ b; */ 1')).toBe(false)
  })

  it('ignores semicolons inside dollar quotes, tagged or not', () => {
    expect(
      hasMultipleStatements('create function f() returns int as $$ begin; return 1; end $$')
    ).toBe(false)
    expect(hasMultipleStatements('select $body$ a; b $body$')).toBe(false)
  })

  it('does not read a bind placeholder as a dollar quote', () => {
    expect(hasMultipleStatements('select $1; select $2')).toBe(true)
    expect(hasMultipleStatements('select * from t where a = $1')).toBe(false)
  })
})
