/**
 * Tiny pub/sub so table mutations (truncate/drop) made in one place - the
 * schema-tree row menu or the table header overflow menu - can tell the schema
 * tree to re-fetch the affected schema. Avoids threading refresh callbacks
 * across unrelated components.
 */
type SchemaTablesListener = (connectionId: string, schema: string) => void

const listeners = new Set<SchemaTablesListener>()

export function emitSchemaTablesChanged(connectionId: string, schema: string): void {
  for (const listener of listeners) listener(connectionId, schema)
}

export function onSchemaTablesChanged(listener: SchemaTablesListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * The sidebar's search button opens the find-a-value dialog, which the database
 * page owns. Same reasoning as above: one listener, no callback threaded from
 * the shell down through the router.
 */
type ValueSearchListener = () => void

const valueSearchListeners = new Set<ValueSearchListener>()

export function requestValueSearch(): void {
  for (const listener of valueSearchListeners) listener()
}

export function onValueSearchRequested(listener: ValueSearchListener): () => void {
  valueSearchListeners.add(listener)
  return () => {
    valueSearchListeners.delete(listener)
  }
}
