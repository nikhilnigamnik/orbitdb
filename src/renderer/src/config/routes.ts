export const ROUTES = {
  connections: '/',
  database: '/database',
  table: '/database/table',
  query: '/query',
  logs: '/logs',
  settings: '/settings'
} as const

export function tableRoute(schema: string, name: string): string {
  return `${ROUTES.table}?schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(name)}`
}
