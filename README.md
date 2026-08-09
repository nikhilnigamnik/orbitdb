# OrbitDB

A desktop database client for **PostgreSQL**, **MySQL/MariaDB**, and **Cloudflare D1**. Built with Electron, React, and TypeScript.

> Status: early preview. Not code-signed for macOS or Windows yet — you'll see an "unidentified developer" warning on first launch.

## Features

**Browsing and editing**

- **Multi-engine connections** — saved profiles per engine, credentials encrypted at rest via the OS keychain, testable before you connect.
- **Schema browser** — schemas, tables, views, columns, indexes and foreign keys in a sidebar tree, with pinned tables and per-table actions.
- **Data grid** — paginated rows with sorting, resizable columns, multi-row selection and foreign-key jumps. Row counts are exact rather than estimated wherever counting is affordable.
- **Inline cell editing** — edit in place with type-aware editors (dropdowns for enums and booleans, a date picker for dates, an expanding pane for JSON and long text), keyboard navigation across cells, and undo on a committed edit.
- **Filters** — pick a column, then build the predicate. Filters combine with AND or OR, live in the URL so a filtered view can be shared, and suggest real values from the column.
- **Structure editing** — add, rename and drop columns, create and drop indexes, rename and truncate tables. Every statement is previewed before it runs.
- **ERD diagram** — foreign-key relationships as a graph.
- **Export** — the current view or a query result to JSON, CSV or Excel.

**SQL**

- **Query editor** — run ad-hoc SQL with a resizable results pane, per-connection history, and a draft that survives navigating away. Destructive statements ask before running.
- **Query log** — every statement the app issues, filterable to just the ones you ran.

**AI (optional)**

- **Natural language → SQL**, grounded in your schema. The result lands in the editor for review rather than executing itself.
- **Natural language → filters** on the current table.
- **Explain a table**, **suggest indexes**, and **generate seed data** — the model returns values, and the inserts are built in code with engine-correct quoting.

Requires a Groq API key, or a proxy URL. Everything else works without it.

## Supported engines

| Engine        | Driver   | Connection                           |
| ------------- | -------- | ------------------------------------ |
| PostgreSQL    | `pg`     | host / port / user / password / SSL  |
| MySQL/MariaDB | `mysql2` | host / port / user / password / SSL  |
| Cloudflare D1 | REST API | account ID + database ID + API token |

Postgres-compatible hosts — Neon, Supabase, Timescale — connect through the Postgres option.

## Install

Download the latest installer from the [Releases page](https://github.com/nikhilnigamnik/orbitdb/releases):

| Platform              | File                                  |
| --------------------- | ------------------------------------- |
| macOS (Apple Silicon) | `orbitdb-<version>.dmg` / `.zip`      |
| Windows               | `orbitdb-<version>-setup.exe`         |
| Linux                 | `orbitdb-<version>.AppImage` / `.deb` |

**First launch**

- **macOS** — not code-signed yet: right-click the app → **Open** → confirm.
- **Windows** — SmartScreen warns about an unrecognised publisher: **More info** → **Run anyway**.
- **Linux (AppImage)** — `chmod +x orbitdb-<version>.AppImage`, then run it.

## Where your credentials go

Connection details are stored in a JSON file in Electron's `userData` directory. Passwords and API tokens are encrypted at rest with Electron `safeStorage`, which is backed by the OS keychain (Keychain on macOS, DPAPI on Windows, libsecret on Linux). If no keychain is available the app says so and falls back to plaintext.

Nothing is sent anywhere except to the databases you connect to — and, if you enable the AI features, your schema (table and column names, not row data) to the configured model provider.

## Development

```bash
pnpm install
pnpm dev
```

| Command          | What it does                                   |
| ---------------- | ---------------------------------------------- |
| `pnpm dev`       | hot-reloading renderer and main process        |
| `pnpm test`      | Vitest suite                                   |
| `pnpm typecheck` | both tsconfigs — main/preload/shared, renderer |
| `pnpm lint`      | ESLint                                         |
| `pnpm build`     | typecheck and bundle, no installer             |

To enable the AI features locally, copy `.env.example` to `.env` and add a Groq API key.

**Building installers**

```bash
pnpm build:mac      # .dmg + .zip
pnpm build:win      # needs Wine or a Windows host
pnpm build:linux    # AppImage + deb
```

## Architecture

Three processes, three TypeScript configs. The renderer never touches the database directly — everything crosses the IPC boundary defined in `src/shared/types.ts`.

```
renderer (Chromium, no Node access)
   ↕  window.api.*        preload/index.ts
preload (context bridge)
   ↕  ipcRenderer.invoke
main (Node)
   └─ db/drivers/{postgres,mysql,d1}.ts  via  db/manager.ts
```

Each engine implements one `DatabaseDriver` interface, so the renderer is engine-agnostic — it passes a connection id around and the manager dispatches. Adding an engine means implementing that interface and registering it.

```
src/
├── main/              # IPC handlers, drivers, query log, AI endpoints
├── preload/           # context bridge
├── shared/            # the types both sides import
└── renderer/src/
    ├── components/    # design system and shared blocks
    ├── features/      # connections, database, tables, query, logs, diagram,
    │                  # command-palette, settings
    ├── hooks/  lib/  config/
tests/                 # mirrors src/, run with pnpm test
ai-proxy/              # optional Cloudflare Worker fronting the model provider
```

`CLAUDE.md` holds the working notes for this codebase — conventions, gotchas, and the reasoning behind decisions that aren't obvious from the code.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the test expectations, and how changes are reviewed.

Security issues should not go in a public issue — see [SECURITY.md](SECURITY.md).

## Stack

React 19 · Electron 41 · electron-vite · Tailwind CSS v4 · Radix UI · TanStack Table and Virtual · zod · Vitest · TypeScript 5

## License

[MIT](LICENSE) © Nikhil Nigam
