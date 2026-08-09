import { describe, expect, it } from 'vitest'
import { findDestructiveStatements } from '@renderer/lib/sql-danger'

const kinds = (sql: string) => findDestructiveStatements(sql).map((s) => s.kind)

describe('what it stops on', () => {
  it('drops', () => {
    expect(kinds('drop table users')).toEqual(['drop'])
    expect(kinds('DROP TABLE IF EXISTS public.users')).toEqual(['drop'])
    expect(kinds('drop database app')).toEqual(['drop'])
    expect(kinds('drop index users_email_idx')).toEqual(['drop'])
  })

  it('truncates', () => {
    expect(kinds('truncate users')).toEqual(['truncate'])
    expect(kinds('TRUNCATE TABLE public.users')).toEqual(['truncate'])
  })

  it('a delete that names no rows', () => {
    expect(kinds('delete from users')).toEqual(['delete-without-where'])
  })

  it('an update that names no rows', () => {
    expect(kinds("update users set name = 'x'")).toEqual(['update-without-where'])
  })

  it('an ALTER that drops something', () => {
    expect(kinds('alter table users drop column email')).toEqual(['schema-change'])
  })

  it('reports each statement of a batch, in order', () => {
    expect(kinds('delete from a; drop table b; select 1')).toEqual(['delete-without-where', 'drop'])
  })

  it('says what will happen in the user’s terms', () => {
    expect(findDestructiveStatements('delete from users')[0].summary).toBe(
      'Delete every row in users'
    )
    expect(findDestructiveStatements('drop table users')[0].summary).toBe('Drop table users')
  })
})

describe('what it leaves alone', () => {
  it('reads', () => {
    expect(kinds('select * from users')).toEqual([])
    expect(kinds('select count(*) from users where id > 3')).toEqual([])
  })

  it('a delete and an update that name rows', () => {
    expect(kinds('delete from users where id = 1')).toEqual([])
    expect(kinds("update users set name = 'x' where id = 1")).toEqual([])
  })

  it('an ALTER that only adds', () => {
    expect(kinds('alter table users add column email text')).toEqual([])
  })

  it('inserts and creates', () => {
    expect(kinds("insert into users (name) values ('a')")).toEqual([])
    expect(kinds('create table users (id int)')).toEqual([])
  })
})

describe('keywords that only look dangerous', () => {
  it('ignores them inside a string literal', () => {
    // The whole point of stripping literals: this is a harmless read.
    expect(kinds("select 'drop table users' as note")).toEqual([])
    expect(kinds("select * from logs where message = 'delete from users'")).toEqual([])
  })

  it('ignores them inside a comment', () => {
    expect(kinds('-- drop table users\nselect 1')).toEqual([])
    expect(kinds('/* delete from users */ select 1')).toEqual([])
  })

  it('ignores them inside a quoted identifier', () => {
    expect(kinds('select * from "drop table"')).toEqual([])
  })

  it('still sees a real statement that follows one', () => {
    expect(kinds("-- harmless\nselect 'drop table x'; delete from users")).toEqual([
      'delete-without-where'
    ])
  })

  it('is not fooled by a column named like a keyword', () => {
    expect(kinds('select dropped, deleted from audit')).toEqual([])
  })
})

describe('shape', () => {
  it('finds nothing in empty or whitespace input', () => {
    expect(kinds('')).toEqual([])
    expect(kinds('   \n  ')).toEqual([])
    expect(kinds(';;;')).toEqual([])
  })

  it('does not care about case or leading whitespace', () => {
    expect(kinds('\n\n   DeLeTe FROM users')).toEqual(['delete-without-where'])
  })

  it('sees a where clause spread over several lines', () => {
    expect(kinds('delete from users\n  where\n    id = 1')).toEqual([])
  })
})
