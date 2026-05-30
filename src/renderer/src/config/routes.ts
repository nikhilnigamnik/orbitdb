export const ROUTES = {
  connections: '/',
  database: '/database',
  table: '/database/table',
  diagram: '/diagram',
  query: '/query',
  logs: '/logs',
  settings: '/settings'
} as const

export function diagramRoute(schema: string): string {
  return `${ROUTES.diagram}?schema=${encodeURIComponent(schema)}`
}

export function tableRoute(schema: string, name: string): string {
  return `${ROUTES.table}?schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(name)}`
}

export function tableStructureRoute(schema: string, name: string): string {
  return `${tableRoute(schema, name)}&view=structure`
}

export function tableRouteWithFk(
  schema: string,
  name: string,
  fkColumn: string,
  fkValue: string
): string {
  return (
    tableRoute(schema, name) +
    `&fkColumn=${encodeURIComponent(fkColumn)}&fkValue=${encodeURIComponent(fkValue)}`
  )
}
