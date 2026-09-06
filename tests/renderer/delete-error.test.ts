import { describe, expect, it } from 'vitest'
import {
  isForeignKeyError,
  planNeedsWarning,
  planTableCount,
  planTotalRows,
  stepLabel
} from '../../src/renderer/src/features/tables/lib/delete-error'
import type { CascadeDeletePlan, CascadeDeleteStep } from '../../src/shared/types'

function step(overrides: Partial<CascadeDeleteStep>): CascadeDeleteStep {
  return {
    schema: 'public',
    table: 'post',
    columns: ['user_id'],
    constraintName: 'post_user_id_fkey',
    parentSchema: 'public',
    parentTable: 'user',
    depth: 1,
    rowCount: 3,
    onDelete: 'NO ACTION',
    ...overrides
  }
}

function plan(overrides: Partial<CascadeDeletePlan>): CascadeDeletePlan {
  return {
    schema: 'public',
    table: 'user',
    targetRows: 1,
    steps: [],
    detached: [],
    totalRows: 0,
    isTruncated: false,
    failures: [],
    ...overrides
  }
}

describe('isForeignKeyError', () => {
  // Only the message survives the IPC envelope, and each engine words it its
  // own way - so all three real strings are pinned rather than one pattern.
  it('recognises the refusal from every engine', () => {
    expect(
      isForeignKeyError(
        'update or delete on table "user" violates foreign key constraint ' +
          '"post_user_id_fkey" on table "post"'
      )
    ).toBe(true)
    expect(
      isForeignKeyError(
        'Cannot delete or update a parent row: a foreign key constraint fails ' +
          '(`app`.`post`, CONSTRAINT `post_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`))'
      )
    ).toBe(true)
    expect(
      isForeignKeyError(
        'FOREIGN KEY constraint failed: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_FOREIGNKEY)'
      )
    ).toBe(true)
  })

  it('leaves an unrelated failure alone', () => {
    expect(isForeignKeyError('permission denied for table user')).toBe(false)
    expect(isForeignKeyError('duplicate key value violates unique constraint "user_pkey"')).toBe(
      false
    )
  })
})

describe('stepLabel', () => {
  it('drops the schema when it is the one already on screen', () => {
    expect(stepLabel({ schema: 'public', table: 'post' }, 'public')).toBe('post')
    expect(stepLabel({ schema: 'audit', table: 'post' }, 'public')).toBe('audit.post')
  })
})

describe('planTotalRows', () => {
  it('counts the target rows alongside the dependents', () => {
    expect(planTotalRows(plan({ targetRows: 2, totalRows: 7 }))).toBe(9)
  })
})

describe('planTableCount', () => {
  it('counts tables, not steps - one reached twice is still one', () => {
    const twice = plan({
      steps: [
        step({ table: 'post', constraintName: 'a' }),
        step({ table: 'post', constraintName: 'b', depth: 2 })
      ]
    })
    expect(twice.steps).toHaveLength(2)
    expect(planTableCount(twice)).toBe(2)
  })
})

describe('planNeedsWarning', () => {
  it('warns when the walk stopped short, since the counts are then a floor', () => {
    expect(planNeedsWarning(plan({ isTruncated: true }))).toBe(true)
    expect(planNeedsWarning(plan({ failures: [{ table: 'public.log', error: 'denied' }] }))).toBe(
      true
    )
    expect(planNeedsWarning(plan({ steps: [step({})] }))).toBe(false)
  })
})
