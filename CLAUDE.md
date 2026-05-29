# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

OrbitDB is an Electron desktop DB client for PostgreSQL, MySQL/MariaDB, and Cloudflare D1. React 19 + TypeScript renderer, Node main process, electron-vite build.

## Commands

```bash
pnpm dev              # electron-vite dev — hot-reload renderer + main
pnpm typecheck        # runs typecheck:node AND typecheck:web (two tsconfigs)
pnpm typecheck:node   # main + preload + shared (tsconfig.node.json)
pnpm typecheck:web    # renderer only (tsconfig.web.json)
pnpm lint             # eslint --cache
pnpm format           # prettier --write .
pnpm build            # typecheck + electron-vite build (no installer)
pnpm build:mac        # build + electron-builder --mac (SKIPS typecheck)
pnpm build:linux      # build + electron-builder --linux
pnpm build:win        # build + electron-builder --win
```

Releases are tag-driven: `pnpm release:{patch,minor,major}` bumps `package.json`, commits, tags `vX.Y.Z`, pushes — GitHub Actions builds & uploads to a draft release. Do **not** run these casually; they push commits.

There is no test runner configured. Don't fabricate `pnpm test`.

## Architecture

Three processes, three TS contexts. The shared boundary lives in `src/shared/types.ts` — both sides import from it.

```
renderer (Chromium, no Node access)
   ↕  window.api.*   (defined in preload/index.ts)
preload (Node + browser bridge)
   ↕  ipcRenderer.invoke
main (full Node)
   └─ db/drivers/{postgres,mysql,d1}.ts  via  db/manager.ts
```

### The IPC envelope pattern (important — don't break it)

Every IPC handler in `src/main/ipc/index.ts` is wrapped by `wrap()`, which catches throws and returns `OperationResult<T> = { success, data?, error? }`. Preload methods return `Promise<OperationResult<T>>`. The renderer never calls these raw — it goes through `unwrap()` in `src/renderer/src/lib/ipc.ts`, which throws on `success: false`.

So the renderer-side pattern is always:
```ts
const tables = await unwrap(window.api.db.listTables(connectionId, schema))
```

To add a new IPC endpoint, you touch **three** files:
1. `src/main/ipc/index.ts` — `ipcMain.handle('namespace:action', wrap(async (...args) => ...))`
2. `src/preload/index.ts` — add to the `api.db` (or new namespace) object with `invoke<T>(...)`
3. `src/shared/types.ts` — if new request/response shapes are needed

### Database driver abstraction

`DatabaseDriver` (`src/main/db/drivers/types.ts`) is implemented three times: `postgres.ts`, `mysql.ts`, `d1.ts`. `src/main/db/manager.ts` looks up the saved connection's `engine` field and dispatches to the right driver. To add a new engine: implement the interface, register it in `manager.ts:driverFor()`. The renderer is engine-agnostic — it just passes `connectionId` around.

D1 is special: it has no schemas (returns `[]`), uses the Cloudflare REST API instead of a socket connection, and has no concept of enums or PK introspection beyond what `pragma table_info` exposes.

### DDL / structure editing

Structure edits (add/drop/rename column, rename table, create/drop index) go through `generateDdl`/`executeDdl` on the driver. Both build SQL from a `DdlOperation` discriminated union (`src/shared/types.ts`) via the shared `buildDdl()` in `src/main/db/ddl.ts` — each driver supplies a `DdlDialect` (identifier quoting + the engine-specific `DROP INDEX` grammar). `generateDdl` is preview-only (returns the SQL string, no DB call); `executeDdl` runs it and invalidates that connection's `tableDetailsCache`. Exposed as `db:ddl-preview` / `db:ddl-execute` → `window.api.db.ddlPreview` / `ddlExecute`. The renderer dialog (`features/database/components/ddl-dialog.tsx`) live-previews the generated SQL before the user confirms; `dataType` and `defaultValue` are passed through as raw SQL expressions (the preview shows exactly what runs). The dialog is hosted once in `database-page.tsx`'s `TableViewContainer` and shared by two triggers: the rename pencil in `table-header.tsx` (next to the table name) and the per-section/row actions in the presentational `table-structure.tsx` (which just calls `onEdit(kind, target?)`). DDL controls only render for `type === 'table'` (not views); on `rename-table` success the container navigates to the new table route.

### Connection persistence

`src/main/store/connections-store.ts` writes a plain JSON file (`connections.json`) into Electron's `userData` directory. There is no `electron-store` dependency — it's hand-rolled. Passwords are stored in plaintext on disk.

### Renderer structure

Feature folders under `src/renderer/src/features/{connections, database, tables, query, logs}`. Shared design-system primitives live in `src/renderer/src/components/ui/` (Radix-based: button, input, select, sheet, popover, etc.). Use `@renderer/*` for absolute imports (alias defined in `electron.vite.config.ts`).

Routing is React Router v7 (`src/renderer/src/app.tsx` + `config/routes.ts`). Active table is encoded in the URL as `?schema=...&table=...`, which `table-data-view.tsx` reads and `schema-tree.tsx` highlights.

## Conventions that matter here

- `pnpm` only — postinstall hook runs `electron-builder install-app-deps` (rebuilds native modules).
- `pg` and `mysql2` are real native modules and are externalized; do not try to bundle them into the renderer.
- Selected/hover row colors in `data-grid.tsx` use neutral `surface-elevated` tones, not `accent` — see git history if you're tempted to use blue.
- macOS code signing is **intentionally disabled** in `electron-builder.yml` (`identity: null`). Don't change this without a Developer ID Application cert in the keychain — builds will fail loudly otherwise.
- App icons live in `build/icon.{png,icns}` (electron-builder source) and `resources/icon.png` (runtime BrowserWindow icon). Both must have ~12% transparent padding around the artwork or macOS will render them oversized.

## When in doubt

- Two tsconfigs: any file under `src/main/**`, `src/preload/**`, `src/shared/**` is checked by `typecheck:node`. Files under `src/renderer/**` are checked by `typecheck:web`. Running just one is fine for quick iterations; run both before commits.
- The renderer cannot `import` from `src/main/**`. The only legal cross-boundary path is the IPC envelope via `window.api.*`.
