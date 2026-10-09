/**
 * Table details and schema graphs, cached per connection for every engine.
 *
 * The cache holds promises rather than results, so two first callers for the
 * same table share one introspection instead of each running it - on D1 that is
 * several HTTPS round-trips apiece. A load that fails is dropped so the next
 * call retries rather than replaying the failure.
 *
 * Invalidation deletes the entry while a load may still be in flight. Its
 * callers still get their answer, but it is never written back, since it may
 * have been read before the change that invalidated it.
 */

import type { SchemaGraph, TableDetails } from '../../shared/types'

class PromiseCache<T> {
  private readonly entries = new Map<string, Promise<T>>()

  get(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key)
    if (existing) return existing
    const pending = load()
    this.entries.set(key, pending)
    pending.catch(() => {
      if (this.entries.get(key) === pending) this.entries.delete(key)
    })
    return pending
  }

  deleteWithPrefix(prefix: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key)
    }
  }
}

const tableDetailsCache = new PromiseCache<TableDetails>()
const schemaGraphCache = new PromiseCache<SchemaGraph>()

function connectionPrefix(connectionId: string): string {
  return `${connectionId}\u0000`
}

export function cachedTableDetails(
  connectionId: string,
  schema: string,
  table: string,
  load: () => Promise<TableDetails>
): Promise<TableDetails> {
  return tableDetailsCache.get(`${connectionPrefix(connectionId)}${schema}\u0000${table}`, load)
}

export function cachedSchemaGraph(
  connectionId: string,
  schema: string,
  load: () => Promise<SchemaGraph>
): Promise<SchemaGraph> {
  return schemaGraphCache.get(`${connectionPrefix(connectionId)}${schema}`, load)
}

/** Both caches go together: a schema change that leaves one stale is no better than none. */
export function invalidateIntrospection(connectionId: string): void {
  const prefix = connectionPrefix(connectionId)
  tableDetailsCache.deleteWithPrefix(prefix)
  schemaGraphCache.deleteWithPrefix(prefix)
}
