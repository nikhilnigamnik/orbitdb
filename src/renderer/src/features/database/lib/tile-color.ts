/**
 * Attio marks each record type with a small solid tile. A database has far more
 * tables than a CRM has objects, so the colour comes from the name: stable for
 * a table across launches, and varied enough to tell neighbours apart.
 *
 * One palette and one hash for every surface that draws a table tile, so the
 * same table is the same colour in the sidebar and in the row editor. Slate is
 * deliberately not in it: that is the tile of a view.
 */
export const TILE_COLORS = [
  'bg-tag-blue',
  'bg-tag-violet',
  'bg-tag-cyan',
  'bg-tag-green',
  'bg-tag-amber',
  'bg-tag-orange',
  'bg-tag-rose'
] as const

export function tileColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return TILE_COLORS[Math.abs(hash) % TILE_COLORS.length]
}
