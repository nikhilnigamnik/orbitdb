import { CASCADE_DELETE_KEY_LIMIT } from '../../shared/types'

/**
 * The parts of the cascade walk that decide whether a plan is allowed at all,
 * and in what order its deletes can legally run. Pure, and exercised through
 * `planCascadeDelete` in its spec.
 */

/** A set of rows, named by the columns whose values pick them out. */
export interface PlanNode {
  schema: string
  table: string
  matchColumns: string[]
  matchValues: unknown[][]
  /** Hops from the target row along the walk: the shortest path, not the delete order. */
  depth: number
}

export function tupleKey(tuple: unknown[]): string {
  return JSON.stringify(tuple.map((value) => (value instanceof Date ? value.toISOString() : value)))
}

/** What makes two nodes the same rows: table, columns and values, order aside. */
export function nodeFingerprint(node: PlanNode): string {
  const values = node.matchValues.map(tupleKey).sort().join('|')
  return `${node.schema}.${node.table}|${node.matchColumns.join(',')}|${values}`
}

/**
 * Distinct from a per-table failure: one table that cannot be read leaves a plan
 * worth showing, but a plan too large to bind is not a plan at all, so this is
 * rethrown past the per-key catch rather than collected.
 */
export class CascadeLimitError extends Error {}

/**
 * The references form a loop, so no order of the planned deletes satisfies
 * every constraint. Rethrown past the per-key catch for the same reason as
 * `CascadeLimitError`: there is no partial plan worth showing.
 */
export class CascadeCycleError extends Error {}

/**
 * The bound on a level, once chunking has taken the statement size out of it.
 *
 * This counts *parent* keys, not the rows they select: a row with 50k log
 * entries carries a single value and cascades fine. It is deliberately far
 * above the chunk size - an intermediate table matching a few thousand rows is
 * an ordinary customer/orders/order-items shape, not a pathological one, and
 * refusing it left the user with no path at all once the plain delete had
 * already been turned down by the foreign key.
 */
export function assertWithinKeyLimit(node: PlanNode): void {
  if (node.matchValues.length <= CASCADE_DELETE_KEY_LIMIT) return
  throw new CascadeLimitError(
    `Too many rows to cascade safely: ${node.schema}.${node.table} matches ` +
      `${node.matchValues.length} keys, past the limit of ${CASCADE_DELETE_KEY_LIMIT}. ` +
      `Delete these in the query editor instead.`
  )
}

export interface PlanLink {
  index: number
  isNew: boolean
}

/**
 * The nodes the walk has planned and how they reach one another.
 *
 * The delete order comes from this graph rather than from the order the walk
 * happened to visit things. Reverse breadth-first order is right for a tree,
 * but a set of rows reached along two paths - a user's comments on the user's
 * own posts, found through `comments.user_id` and again through `posts.id` -
 * is one node linked from two parents, and it has to go after the dependents
 * of *both*. Its rank is the longest path from the root, which is the level it
 * is deleted at; whether that is also the level it was first seen at depends
 * on which foreign key the catalogue happened to list first.
 *
 * A link back to a node that already leads to the linking one is a loop:
 * `users.current_org_id` points at `orgs`, whose `owner_id` points back at
 * `users`, and the user owns the org they belong to. The org must go before
 * the user and the user before the org, so no order of the statements
 * satisfies both constraints and the plan is refused rather than tried.
 */
export class PlanGraph {
  private readonly parents: number[][] = []
  private readonly children: number[][] = []
  private readonly byFingerprint = new Map<string, number>()
  private readonly ranks = new Map<number, number>()

  constructor(root: PlanNode) {
    this.add(root)
  }

  /**
   * Links `child` beneath `parent`. A node already in the graph is linked
   * rather than added again, so a table reached twice with the same values is
   * one delete - and so a loop shows up as a link rather than as an endless
   * walk.
   */
  link(parent: number, child: PlanNode): PlanLink {
    const fingerprint = nodeFingerprint(child)
    const existing = this.byFingerprint.get(fingerprint)
    if (existing === undefined) {
      const index = this.add(child, fingerprint)
      this.connect(parent, index)
      return { index, isNew: true }
    }
    if (this.reaches(existing, parent)) {
      throw new CascadeCycleError(
        `Deleting these rows would loop: rows in ${child.schema}.${child.table} reached through ` +
          `${child.matchColumns.join(', ')} are already queued for deletion at a higher level, ` +
          `so no order satisfies the constraints.`
      )
    }
    this.connect(parent, existing)
    return { index: existing, isNew: false }
  }

  /** Longest path from the root: the level a node is deleted at, deepest first. */
  rankOf(index: number): number {
    const known = this.ranks.get(index)
    if (known !== undefined) return known
    const rank = this.parents[index].reduce(
      (best, parent) => Math.max(best, this.rankOf(parent) + 1),
      0
    )
    this.ranks.set(index, rank)
    return rank
  }

  private add(node: PlanNode, fingerprint = nodeFingerprint(node)): number {
    const index = this.parents.length
    this.parents.push([])
    this.children.push([])
    this.byFingerprint.set(fingerprint, index)
    return index
  }

  private connect(parent: number, child: number): void {
    this.parents[child].push(parent)
    this.children[parent].push(child)
    // A new link can deepen everything beneath it.
    this.ranks.clear()
  }

  /** Whether `to` sits anywhere beneath `from` - a node counts as beneath itself. */
  private reaches(from: number, to: number): boolean {
    if (from === to) return true
    const visited = new Set<number>()
    const stack = [from]
    while (stack.length > 0) {
      const current = stack.pop() as number
      for (const child of this.children[current]) {
        if (child === to) return true
        if (visited.has(child)) continue
        visited.add(child)
        stack.push(child)
      }
    }
    return false
  }
}
