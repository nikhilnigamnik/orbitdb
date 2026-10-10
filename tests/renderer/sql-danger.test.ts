import { describe, expect, it } from 'vitest'
import { findDestructiveStatements } from '@renderer/lib/sql-danger'

const kinds = (sql: string) => findDestructiveStatements(sql).map((s) => s.kind)
const summaries = (sql: string) => findDestructiveStatements(sql).map((s) => s.summary)

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
    expect(kinds("select 'drop table x'")).toEqual([])
  })

  it('ignores them inside a comment', () => {
    expect(kinds('-- drop table users\nselect 1')).toEqual([])
    expect(kinds('/* delete from users */ select 1')).toEqual([])
  })

  it('ignores them inside a MySQL # comment', () => {
    expect(kinds('# drop table users\nselect 1')).toEqual([])
    expect(kinds('select 1 # drop table users')).toEqual([])
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

describe('a literal that looks like a comment', () => {
  it('does not swallow the statement after a -- inside a literal', () => {
    expect(kinds("select 'a--b' from t; drop table users")).toEqual(['drop'])
    expect(kinds("select 'a#b' from t; drop table users")).toEqual(['drop'])
  })

  it('does not swallow the statement after a /* inside a literal', () => {
    expect(kinds("select 'a/*b' from t; drop table users")).toEqual(['drop'])
  })

  it('reads a backslash-escaped quote as part of the literal', () => {
    expect(kinds("select 'O\\'Brien' from t; drop table users")).toEqual(['drop'])
    expect(kinds("select 'O\\'Brien; drop table users' from t")).toEqual([])
  })

  it('reads a doubled quote as part of the literal', () => {
    expect(kinds("select 'it''s'; drop table users")).toEqual(['drop'])
    expect(kinds("select 'it''s; drop table users'")).toEqual([])
  })

  it('does not split on a semicolon inside a quoted identifier', () => {
    expect(kinds('select "a;b" from t')).toEqual([])
    expect(kinds('select `a;b` from t; drop table users')).toEqual(['drop'])
  })

  it('keeps the Postgres JSON path operator out of the comment rule', () => {
    expect(kinds("select data #> '{a}' from t; drop table users")).toEqual(['drop'])
  })
})

describe('a write that does not start with its keyword', () => {
  it('sees a delete and an update led by a CTE', () => {
    expect(kinds('with x as (select 1) delete from users')).toEqual(['delete-without-where'])
    expect(kinds('with x as (select 1) update users set a = 1')).toEqual(['update-without-where'])
    expect(kinds('with recursive x(n) as (select 1) delete from users')).toEqual([
      'delete-without-where'
    ])
  })

  it('leaves a CTE-led write that names rows alone', () => {
    expect(
      kinds('with x as (select id from t) delete from users where id in (select id from x)')
    ).toEqual([])
    expect(kinds('with x as (select 1) update users set a = 1 where id = 2')).toEqual([])
    expect(kinds('with x as (select 1) select * from x')).toEqual([])
  })

  it('sees a data-modifying CTE', () => {
    expect(kinds('with d as (delete from t returning *) select * from d')).toEqual([
      'delete-without-where'
    ])
    expect(kinds('with d as (update t set a = 1 returning *) select * from d')).toEqual([
      'update-without-where'
    ])
    expect(kinds('with d as (delete from t where id = 1 returning *) select * from d')).toEqual([])
  })

  it('sees a MySQL multi-table delete', () => {
    expect(kinds('delete t from t join u on t.uid = u.id')).toEqual(['delete-without-where'])
    expect(kinds('delete t, u from t join u on t.uid = u.id')).toEqual(['delete-without-where'])
    expect(kinds('delete t.* from t join u on t.uid = u.id')).toEqual(['delete-without-where'])
    expect(kinds('delete from t1, t2 using t1 join t2 on t1.id = t2.id')).toEqual([
      'delete-without-where'
    ])
    expect(kinds('delete t from t join u on t.uid = u.id where u.x = 1')).toEqual([])
    expect(summaries('delete t, u from t join u on t.uid = u.id')).toEqual([
      'Delete every row in t, u'
    ])
  })

  it('sees a MySQL multi-table update', () => {
    expect(kinds('update t join u on t.uid = u.id set t.a = 1')).toEqual(['update-without-where'])
    expect(kinds('update t, u set t.a = 1 where t.uid = u.id')).toEqual([])
  })
})

describe('where the WHERE is', () => {
  it('does not count one inside a subquery', () => {
    expect(kinds("update users set role_id = (select id from roles where name = 'admin')")).toEqual(
      ['update-without-where']
    )
    expect(kinds('delete from users using (select 1 where true) s')).toEqual([
      'delete-without-where'
    ])
  })

  it('counts a real top-level one', () => {
    expect(
      kinds('delete from orders where customer_id in (select id from customers where churned)')
    ).toEqual([])
    expect(kinds('update users set x = 1 where id = (select max(id) from users)')).toEqual([])
    expect(kinds('delete from t using u where t.uid = u.id')).toEqual([])
  })

  it('does not count a column named where', () => {
    expect(kinds('update t set "where" = 1')).toEqual(['update-without-where'])
    expect(kinds('update t set `where` = 1')).toEqual(['update-without-where'])
  })
})

describe('every kind of DROP', () => {
  it.each([
    ['drop materialized view daily_totals', 'Drop materialized view daily_totals'],
    ['drop type status', 'Drop type status'],
    ['drop sequence users_id_seq', 'Drop sequence users_id_seq'],
    ['drop trigger audit on users', 'Drop trigger audit'],
    ['drop function f(int, text)', 'Drop function f'],
    ['drop procedure p', 'Drop procedure p'],
    ['drop domain email', 'Drop domain email'],
    ['drop extension if exists postgis cascade', 'Drop extension postgis'],
    ['drop temporary table if exists tmp', 'Drop temporary table tmp'],
    ['drop role reporter', 'Drop role reporter'],
    ['drop index concurrently if exists idx', 'Drop index idx'],
    ['drop view if exists v', 'Drop view v'],
    ['drop schema app cascade', 'Drop schema app']
  ])('%s', (sql, summary) => {
    expect(kinds(sql)).toEqual(['drop'])
    expect(summaries(sql)).toEqual([summary])
  })

  it('normalises a multi-word kind to single spaces', () => {
    expect(summaries('drop  MATERIALIZED\n  view daily_totals')).toEqual([
      'Drop materialized view daily_totals'
    ])
  })

  it('still stops on a kind it does not know by name', () => {
    expect(kinds('drop owned by alice')).toEqual(['drop'])
    expect(summaries('drop owned by alice')).toEqual(['Drop owned by alice'])
  })

  it('lists every table of a multi-table drop', () => {
    expect(summaries('drop table a, b')).toEqual(['Drop table a, b'])
  })
})

describe('quoted identifiers in the summary', () => {
  it('shows a quoted name as written', () => {
    expect(summaries('drop table "Users"')).toEqual(['Drop table "Users"'])
    expect(summaries('delete from `orders`')).toEqual(['Delete every row in `orders`'])
    expect(summaries('truncate [dbo].[Users]')).toEqual(['Empty [dbo].[Users]'])
  })

  it('shows a schema-qualified quoted name as written', () => {
    expect(summaries('drop table "app"."Users"')).toEqual(['Drop table "app"."Users"'])
    expect(summaries('update `db`.`orders` set x = 1')).toEqual([
      'Update every row in `db`.`orders`'
    ])
    expect(summaries('delete from "app".users')).toEqual(['Delete every row in "app".users'])
  })

  it('keeps an escaped quote inside the name', () => {
    expect(summaries('drop table "a""b"')).toEqual(['Drop table "a""b"'])
  })

  it('names the table of a schema change', () => {
    expect(summaries('alter table "Users" drop column email')).toEqual(['Drop part of "Users"'])
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

  it('survives an unterminated literal or comment', () => {
    expect(kinds("select 'open")).toEqual([])
    expect(kinds('select 1 /* open')).toEqual([])
    expect(kinds('drop table users /* open')).toEqual(['drop'])
  })
})
