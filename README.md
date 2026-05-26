# OrbitDB

A modern desktop database client for **PostgreSQL**, **MySQL/MariaDB**, and **Cloudflare D1**. Built with Electron, React, and TypeScript.

> Status: early preview (v0.2.0). Not yet code-signed for macOS or Windows — you'll see an "unidentified developer" warning on first launch.

## Features

- **Multi-engine connections** — Save connection profiles for Postgres, MySQL, and D1. Test credentials before connecting.
- **Schema browser** — Explore databases, tables, columns, indexes, and foreign keys in a sidebar tree.
- **Data grid** — Paginated rows with sorting, filtering, and multi-row selection.
- **Row editing** — Insert, edit, and delete rows directly in the grid with a sheet-based confirm step for destructive actions.
- **SQL editor** — Resizable editor for ad-hoc queries with result inspection.
- **Two-step filter UI** — Pick a column, then build the predicate with an animated popover.
- **JSON export** — Export the current table view or query results to JSON.
- **Query logger** — Inspect every SQL statement the app runs.
- **Polished UI** — Dark theme, DM Sans + Geist Mono typography, floating sheets, smooth animations.

## Supported engines

| Engine        | Driver   | Auth                                  |
| ------------- | -------- | ------------------------------------- |
| PostgreSQL    | `pg`     | host / port / user / password / SSL   |
| MySQL/MariaDB | `mysql2` | host / port / user / password / SSL   |
| Cloudflare D1 | REST API | Account ID + Database ID + API token  |

## Install

Download the latest installer for your OS from the [Releases page](https://github.com/nikhilnigamnik/orbitdb/releases):

| Platform              | File                              |
| --------------------- | --------------------------------- |
| macOS (Apple Silicon) | `orbitdb-<version>.dmg` / `.zip`  |
| Windows               | `orbitdb-<version>-setup.exe`     |
| Linux                 | `orbitdb-<version>.AppImage` / `.deb` |

### First-launch notes

- **macOS:** the app isn't code-signed yet. Right-click the app → **Open** → confirm in the dialog the first time.
- **Windows:** SmartScreen will warn about an unrecognized publisher. Click **More info** → **Run anyway**.
- **Linux (AppImage):** `chmod +x orbitdb-<version>.AppImage` then run it.

## Development

```bash
pnpm install
pnpm dev
```

### Type-check and lint

```bash
pnpm typecheck
pnpm lint
```

### Build installers locally

```bash
pnpm build:mac      # produces .dmg + .zip in dist/
pnpm build:win      # requires Wine or a Windows host
pnpm build:linux    # produces AppImage + deb in dist/
```

## Releasing

Releases are built and uploaded by GitHub Actions on any `v*` tag push. To cut a new release:

```bash
pnpm release:patch   # 0.2.0 → 0.2.1  (bug fixes)
pnpm release:minor   # 0.2.0 → 0.3.0  (new features)
pnpm release:major   # 0.2.0 → 1.0.0  (breaking changes)
```

Each command bumps the version in `package.json`, commits, tags, and pushes — triggering the workflow that builds for mac/win/linux and uploads everything to a draft GitHub release. Open the release in the dashboard, add notes, and publish.

## Project structure

```
src/
├── main/              # Electron main process (IPC, drivers, query execution)
├── preload/           # Context bridge
└── renderer/src/
    ├── app.tsx
    ├── components/    # design system + shared blocks
    ├── features/      # vertical slices
    │   ├── connections/
    │   ├── database/
    │   ├── tables/
    │   ├── query/
    │   └── logs/
    ├── hooks/
    ├── lib/
    └── config/
```

## Stack

- **Runtime:** Electron 41 + electron-vite
- **UI:** React 19, React Router, Tailwind CSS v4, Radix UI primitives
- **Data:** `pg`, `mysql2`, Cloudflare D1 REST API
- **Tooling:** TypeScript 5, Vite 7, electron-builder 26
- **Validation:** zod
- **Tables:** `@tanstack/react-table`

## License

TBD
