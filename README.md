# OrbitDB

A modern database client for **Postgres**, **MySQL**, and **Cloudflare D1**. Built with Electron, React, and TypeScript.

## Features

- **Connections** — Save multiple connection profiles across engines. Test before connecting.
- **Schema browser** — Explore schemas, tables, columns, indexes, and foreign keys.
- **Table viewer** — Paginated rows with sorting and filtering.
- **Row editing** — Insert, edit, and delete rows directly in the grid.
- **SQL editor** — Run raw SQL and inspect results.

## Supported engines

| Engine            | Driver       | Auth                                |
| ----------------- | ------------ | ----------------------------------- |
| PostgreSQL        | `pg`         | host / port / user / password / SSL |
| MySQL             | `mysql2`     | host / port / user / password / SSL |
| Cloudflare D1     | REST API     | Account ID + Database ID + API token |

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

## Build

```bash
# macOS
pnpm build:mac

# Windows
pnpm build:win

# Linux
pnpm build:linux
```

## Stack

- Electron + electron-vite
- React 19 + React Router
- TypeScript
- Tailwind CSS v4
- `pg`, `mysql2`, Cloudflare D1 REST API
- `zod` for validation
