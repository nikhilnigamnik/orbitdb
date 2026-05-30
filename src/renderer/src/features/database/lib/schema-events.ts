/**
 * Tiny pub/sub so table mutations (truncate/drop) made in one place — the
 * schema-tree row menu or the table header overflow menu — can tell the schema
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
