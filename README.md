# OrbitDB

A desktop database client for **PostgreSQL**, **MySQL/MariaDB**, and **Cloudflare D1**. Built with Electron, React, and TypeScript.

> Status: early preview. Not code-signed for macOS or Windows yet - you'll see an "unidentified developer" warning on first launch.

## Features

**Browsing and editing**

- **Multi-engine connections** - saved profiles per engine, credentials encrypted at rest via the OS keychain, testable before you connect.
- **Schema browser** - schemas, tables, views, columns, indexes and foreign keys in a sidebar tree, with pinned tables and per-table actions.
- **Data grid** - paginated rows with sorting, resizable columns, multi-row selection and foreign-key jumps. Row counts are exact rather than estimated wherever counting is affordable.
- **Relationships both ways** - follow a foreign key out to its parent from any cell, and see from the row editor which rows in other tables reference the one you are editing, counted, with cascading deletes flagged.
- **Connection overview** - connecting lands on the shape of the database: table and view counts, size, the largest tables, and your recent queries.
- **Record view** - one row read top to bottom, with long values wrapped rather than truncated, links out along foreign keys, and the rows that reference it.
- **Frozen columns** - pin up to three columns to the left edge so they stay put while a wide table scrolls.
- **Keyboard and clipboard** - a cell cursor driven by the arrow keys, shift to extend a block, Enter to edit, and `Cmd+C` to copy it as spreadsheet-ready text (`Cmd+Shift+C` for JSON). Selected rows can be copied as JSON or as `INSERT` statements from the export menu.
- **A view that stays put** - sort, page size, hidden columns, frozen columns and column widths are remembered per table.
- **Shortcuts** - press `?` anywhere for the full list.
- **Inline cell editing** - edit in place with type-aware editors (dropdowns for enums and booleans, a date picker for dates, an expanding pane for JSON and long text), keyboard navigation across cells, and undo on a committed edit.
- **Filters** - pick a column, then build the predicate. Filters combine with AND or OR, live in the URL so a filtered view can be shared, and suggest real values from the column.
- **Structure editing** - add, rename and drop columns, create and drop indexes, rename and truncate tables. Every statement is previewed before it runs.
- **ERD diagram** - foreign-key relationships as a graph, exportable as PNG or SVG. Drag the tables where you want them and the arrangement is remembered.
- **Export** - the current view or a query result to JSON, CSV or Excel.

**SQL**

- **Query editor** - CodeMirror with SQL highlighting, line numbers and completion for your own tables and columns. Resizable results pane, a draft that survives navigating away, and destructive statements ask before running.
- **Query library** - every run is kept per connection; star one to name it and keep it out of the history cap. Stored alongside your connections rather than in browser storage.
- **Find a value anywhere** - `Mod+Shift+F` sweeps every searchable column of every table for a value and shows where it appears, with counts. Click a result to open that table already filtered. Useful for undeclared foreign keys and tracking down stray data.
- **Query log** - every statement the app issues, filterable to just the ones you ran.

**AI (optional)**

- **Natural language → SQL**, grounded in your schema. The result lands in the editor for review rather than executing itself.
- **Natural language → filters** on the current table.
- **Explain a table**, **suggest indexes**, and **generate seed data** - the model returns values, and the inserts are built in code with engine-correct quoting.

Bring your own API key - **Anthropic**, **OpenAI**, **Google** or a **Cloudflare AI Gateway** - paste it in **Settings → AI**, and pick a model:

| Provider   | Models                                               |
| ---------- | ---------------------------------------------------- |
| Anthropic  | Sonnet 5 · Haiku 4.5 · Opus 5                        |
| OpenAI     | GPT-5.2 · GPT-5 mini · GPT-5.2 Pro                   |
| Google     | Gemini 3.6 Flash · Gemini 2.5 Flash · Gemini 3.1 Pro |
| Cloudflare | Any of the above, through your own gateway           |

**Usage** - Settings shows tokens by provider, model and feature for today, the last 30 days, and all time. Counted from what the API reports, kept on your machine for 90 days, and clearable.

**Cloudflare AI Gateway** is a provider like the others, except that it reaches Claude, GPT and Gemini through your own gateway - so you get caching, rate limiting and per-call logs in the Cloudflare dashboard. Give it your account id, gateway id, and a token if the gateway is authenticated. The upstream keys stay on Cloudflare's side, as stored provider keys or Unified Billing credits, so none of them need to be in the app. Inference is passed through at each vendor's own rate, so the cost estimates match.

Each provider keeps its own key and model, so switching between them costs nothing. Keys are encrypted on your machine with the OS keychain and sent only to the provider you chose. Everything else in the app works without one.

## Supported engines

| Engine        | Driver   | Connection                           |
| ------------- | -------- | ------------------------------------ |
| PostgreSQL    | `pg`     | host / port / user / password / SSL  |
| MySQL/MariaDB | `mysql2` | host / port / user / password / SSL  |
| Cloudflare D1 | REST API | account ID + database ID + API token |

Postgres-compatible hosts - Neon, Supabase, Timescale - connect through the Postgres option.

## Install

Download the latest installer from the [Releases page](https://github.com/nikhilnigamnik/orbitdb/releases):

| Platform              | File                                  |
| --------------------- | ------------------------------------- |
| macOS (Apple Silicon) | `orbitdb-<version>.dmg` / `.zip`      |
| Windows               | `orbitdb-<version>-setup.exe`         |
| Linux                 | `orbitdb-<version>.AppImage` / `.deb` |

**First launch**

- **macOS** - not code-signed yet: right-click the app → **Open** → confirm.
- **Windows** - SmartScreen warns about an unrecognised publisher: **More info** → **Run anyway**.
- **Linux (AppImage)** - `chmod +x orbitdb-<version>.AppImage`, then run it.

## Where your credentials go

Connection details live in `connections.json`, and your AI provider keys in `settings.json`, both in Electron's `userData` directory:

| Platform | Location                                 |
| -------- | ---------------------------------------- |
| macOS    | `~/Library/Application Support/OrbitDB/` |
| Windows  | `%APPDATA%\OrbitDB\`                     |
| Linux    | `~/.config/OrbitDB/`                     |

Passwords, database API tokens and AI provider keys are encrypted at rest with Electron `safeStorage`, backed by the OS keychain (Keychain on macOS, DPAPI on Windows, libsecret on Linux). If no keychain is available the app says so and falls back to plaintext.

Nothing is sent anywhere except to the databases you connect to - and, if you add an AI key, your schema (table and column names, not row data) to the provider you selected, or to Cloudflare first if you turn the gateway on.

One thing to know about the gateway token: Cloudflare's AI Gateway permissions cannot be scoped to a single gateway, so the token you save here can reach every gateway on that account.

## Development

```bash
pnpm install
pnpm dev
```

| Command          | What it does                                   |
| ---------------- | ---------------------------------------------- |
| `pnpm dev`       | hot-reloading renderer and main process        |
| `pnpm test`      | Vitest suite                                   |
| `pnpm typecheck` | both tsconfigs - main/preload/shared, renderer |
| `pnpm lint`      | ESLint                                         |
| `pnpm build`     | typecheck and bundle, no installer             |

The AI features need an API key from Anthropic, OpenAI or Google, added in **Settings → AI** at runtime - there is no `.env` to fill in.

**Building installers**

```bash
pnpm build:mac      # .dmg + .zip
pnpm build:win      # needs Wine or a Windows host
pnpm build:linux    # AppImage + deb
```

## Architecture

Three processes, three TypeScript configs. The renderer never touches the database directly - everything crosses the IPC boundary defined in `src/shared/types.ts`.

```
renderer (Chromium, no Node access)
   ↕  window.api.*        preload/index.ts
preload (context bridge)
   ↕  ipcRenderer.invoke
main (Node)
   └─ db/drivers/{postgres,mysql,d1}.ts  via  db/manager.ts
```

Each engine implements one `DatabaseDriver` interface, so the renderer is engine-agnostic - it passes a connection id around and the manager dispatches. Adding an engine means implementing that interface and registering it.

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
```

`CLAUDE.md` holds the working notes for this codebase - conventions, gotchas, and the reasoning behind decisions that aren't obvious from the code.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the test expectations, and how changes are reviewed.

Security issues should not go in a public issue - see [SECURITY.md](SECURITY.md).

## Stack

React 19 · Electron 41 · electron-vite · Tailwind CSS v4 · Radix UI · TanStack Table and Virtual · Vercel AI SDK · zod · Vitest · TypeScript 5

## License

[MIT](LICENSE) © Nikhil Nigam
