# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

OrbitDB is an Electron desktop DB client for PostgreSQL, MySQL/MariaDB, and Cloudflare D1. React 19 + TypeScript renderer, Node main process, electron-vite build.

This is an MIT-licensed open-source project. `README.md` is the user-facing description,
`CONTRIBUTING.md` covers setup and review expectations, and `SECURITY.md` covers private
disclosure — keep all three current when behaviour changes.

## Commands

```bash
pnpm dev              # electron-vite dev — hot-reload renderer + main
pnpm typecheck        # runs typecheck:node AND typecheck:web (two tsconfigs)
pnpm typecheck:node   # main + preload + shared (tsconfig.node.json)
pnpm typecheck:web    # renderer only (tsconfig.web.json)
pnpm lint             # eslint --cache
pnpm format           # prettier --write .
pnpm test             # vitest run
pnpm test:watch       # vitest (watch mode)
pnpm build            # typecheck + electron-vite build (no installer)
pnpm build:mac        # build + electron-builder --mac (SKIPS typecheck)
pnpm build:linux      # build + electron-builder --linux
pnpm build:win        # build + electron-builder --win
```

Releases are tag-driven: `pnpm release:{patch,minor,major}` bumps `package.json`, commits, tags `vX.Y.Z`, pushes — GitHub Actions builds & uploads to a draft release. Do **not** run these casually; they push commits.

Tests run on Vitest (`vitest.config.ts`). Every spec lives under the top-level `tests/`
folder, mirroring the `src/` layout — **not** colocated with the source file, so the
electron-vite build never has to glob around them. New behaviour ships with a spec.

`vitest.config.ts` pins `TZ` to `Asia/Kolkata`. Date rendering is timezone-sensitive, so
without it a spec that passes locally fails on a UTC runner — and a zero offset renders as
`Z`, which never exercises the offset-carrying path. Assert exact offsets, not a loose
pattern.

`tests/setup/jsdom-polyfills.ts` fills in the DOM APIs Radix calls unconditionally
(pointer capture, `scrollIntoView`, `ResizeObserver`). Without them a Select or Popover
throws inside the component instead of failing an assertion.

Three testing shapes, cheapest first:

- **Pure logic** — plain `.test.ts`. Prefer extracting decision-making out of a component
  into `features/<x>/lib/` and testing it there (`filter-editor.ts` exists because the
  NULL-vs-empty-string bug lived in a branch buried in JSX).
- **Static render** — `renderToStaticMarkup` + `createElement` in a `.test.ts`, for
  asserting what a component _renders_ (classes, aria labels) without a DOM.
- **Interaction** — `.test.tsx` with `// @vitest-environment jsdom` at the top and
  `@testing-library/react`, for anything driven by state or effects. Stub the IPC bridge
  with `Object.assign(window, { api: { db: { … } } })`.

Main-process modules that import `electron` are tested by mocking it — see
`tests/main/store/connections-store.test.ts` for the `vi.hoisted` + `vi.mock('electron')`
pattern, and `vi.resetModules()` to reset module-level caches between cases.

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build on every push to
`main`/`dev` and on every PR. Releases stay tag-driven in `release.yml`.

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

D1's SQLite-dialect pieces — pragma row mapping, identifier quoting, type normalisation and the DDL/filter dialects — live in `src/main/db/sqlite-shared.ts` rather than inline, so they can be unit tested without a live database (`tests/main/db/sqlite-shared.test.ts`).

### DDL / structure editing

Structure edits (add/drop/rename column, rename table, create/drop index) go through `generateDdl`/`executeDdl` on the driver. Both build SQL from a `DdlOperation` discriminated union (`src/shared/types.ts`) via the shared `buildDdl()` in `src/main/db/ddl.ts` — each driver supplies a `DdlDialect` (identifier quoting + the engine-specific `DROP INDEX` grammar). `generateDdl` is preview-only (returns the SQL string, no DB call); `executeDdl` runs it and invalidates that connection's `tableDetailsCache`. Exposed as `db:ddl-preview` / `db:ddl-execute` → `window.api.db.ddlPreview` / `ddlExecute`. The renderer dialog (`features/database/components/ddl-dialog.tsx`) live-previews the generated SQL before the user confirms; `dataType` and `defaultValue` are passed through as raw SQL expressions (the preview shows exactly what runs). The dialog is hosted once in `database-page.tsx`'s `TableViewContainer` and shared by two triggers: the rename action surfaced by `table-data-view.tsx` and the per-section/row actions in the presentational `table-structure.tsx` (which just calls `onEdit(kind, target?)`). DDL controls only render for `type === 'table'` (not views); on `rename-table` success the container navigates to the new table route.

### AI layer (Anthropic / OpenAI / Google via Vercel AI SDK)

The main process has an `src/main/ai/` layer behind the same IPC envelope. It uses the Vercel AI SDK (`ai`) with three providers — `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` — all pinned to the **`ai-v6` release line**; their `latest` tags target a newer `ai` major than this repo's, so install with `pnpm add @ai-sdk/<name>@ai-v6`.

`src/shared/ai-models.ts` is the registry: providers, their models, and the placeholder for each key format. Adding a provider is a row there plus a row in `FACTORY` in `ai/client.ts` — nothing else. `isAiModelId(provider, model)` pairs the two deliberately: `gpt-5.2` is a real model but not a real _Anthropic_ one, and sending it there returns an opaque 404.

**The key is user-supplied, not build-time.** It is pasted in Settings and stored encrypted in `settings.json` (see _Settings persistence_ below). Nothing reads `.env` any more — there is no `.env.example`.

That has one consequence worth knowing before editing `ai/client.ts`: `getModel()` is a **function**, not the module-level constant it used to be. The credential is runtime state, so the model has to be re-read after a save, and `getModel()` caches the built provider keyed on `(apiKey, model)` so it only rebuilds when one of them actually changes. It throws `MissingApiKeyError` — whose message names Settings — when no key is set, which is how all four renderer surfaces report the missing key without any of them knowing about it.

Each provider keeps its **own key and model**; switching provider in Settings doesn't discard the others. Default is Anthropic + `claude-sonnet-5`.

Five endpoints under the `ai:` IPC namespace → `window.api.ai.*`:

- `ai:generate-sql` (`generate-sql.ts`) — natural language → SQL, grounded in the whole-DB schema map. Query page auto-runs the result.
- `ai:filter-table` (`filter-table.ts`) — natural language → a WHERE clause feeding the existing data grid.
- `ai:explain-table` (`explain-table.ts`) — returns markdown describing a table.
- `ai:suggest-indexes` (`suggest-indexes.ts`) — index suggestions for a table.
- `ai:generate-seed` (`generate-seed.ts`) — the model returns row _values_; code builds the inserts deterministically (engine-correct quoting/escaping, code-gen UUIDs for UUID/string-PK columns, FK sampling from parent tables, type coercion, per-row execution, batched at `SEED_BATCH_SIZE` for large counts). Never trust the model to emit raw SQL for seeds.

`ai/client.ts` exposes `generateJson()` — structured output in two layers. First `generateText` + `Output.object`: **that is the supported path, not `generateObject`, which AI SDK 6 deprecated** (see the v6 migration guide). Every model offered in Settings reports `supportsStructuredOutput`, so the Anthropic provider turns the zod schema into a native `output_config.format` rather than asking for JSON in prose. Second, a plain-text retry parsed with `stripFences`/`extractJson` + zod — `Output.object` takes no repair hook (only `schema`/`name`/`description`), so salvaging a fenced or preamble-wrapped reply means asking again. Because that retry costs a real call, `isWorthRetrying()` rethrows `APICallError` and timeouts immediately: a 401 must not cost two round-trips, and retrying a 429 makes the rate limit worse. `ai/context.ts` builds schema context: `buildSchemaContext()` (compact whole-DB map, capped at `MAX_SCHEMA_TABLES`, skips system schemas) for free-form SQL, and `buildTableContext()` (detailed single-table) for table-scoped features. `QUOTE_HINT`/`ENGINE_DIALECT` give the model engine-correct identifier quoting.

Renderer surfaces: `features/query/components/ai-prompt.tsx` (NL→SQL on the query page), the 'Ask AI' filter in `table-data-view.tsx`, and `structure-ai.tsx` + `seed-data-dialog.tsx` on the structure tab. Markdown responses render via `components/common/markdown.tsx`.

### Settings persistence

`src/main/store/settings-store.ts` writes `settings.json` into `userData` (schema v2), holding the selected provider plus a key and model per provider. A v1 file — one `apiKey`/`model`, from when Anthropic was the only provider — migrates on read into the anthropic slot. Same hand-rolled shape and same `safeStorage` encryption as connections, including the rule that a key which fails to decrypt is **kept on disk untouched** rather than blanked — writing the empty read-back would destroy a key the user could still recover by logging into the right OS account.

Exposed under the `settings:` IPC namespace → `window.api.settings.*`. **No key ever crosses back to the renderer**: `settings:get-ai` returns `{ provider, hasKey, keyHint, isKeyUnreadable, model, configured }`, where `keyHint` is the last four characters and `configured` is just the list of provider ids that have one. `settings:test-ai` makes one tiny real call so a bad key fails on a button the user pressed rather than halfway through generating SQL.

### AI usage tracking

`src/main/store/usage-store.ts` writes `usage.json` into `userData` — **not encrypted**, unlike the other two stores, because token counts hold no secrets and `crypto.ts` costs a keychain round-trip per read.

Rolled up per local day rather than logged per call (`provider|model|feature` → `{calls, input, output}`), so the file stays small however heavily the AI features run, and pruned to `USAGE_RETENTION_DAYS` (90) on every write. Day keys come from `date-fns` `format(…, 'yyyy-MM-dd')` in local time — the spec's fixtures are deliberately set at 20:30 UTC, which is already tomorrow under the `TZ=Asia/Kolkata` pin, so a UTC-derived key would fail.

**The invariant: `runText()` in `ai/client.ts` is the only place this app calls a model.** Every endpoint goes through it, so usage is recorded exactly once, in one place; a second call path would silently under-count. Recording is wrapped in try/catch — bookkeeping must never cost the user the answer they were waiting for. Note that a _failed_ call carries no usage object, so the reported figure is a lower bound rather than a guess.

Exposed as `usage:summary` / `usage:clear` → `window.api.usage.*`. Aggregation (today / 30 days / all time, by model and by feature) happens in main: the renderer receives numbers to render, not a log to fold.

### Connection persistence

`src/main/store/connections-store.ts` writes a plain JSON file (`connections.json`) into Electron's `userData` directory. There is no `electron-store` dependency — it's hand-rolled. Sensitive fields (`password`, `apiToken`) are encrypted at rest via Electron `safeStorage` (`src/main/store/crypto.ts`) with an `enc:v1:` prefix; plaintext values are migrated to encrypted on read. If `safeStorage` is unavailable on the host (no OS keychain/DPAPI), it logs a warning and falls back to plaintext.

### Renderer structure

Feature folders under `src/renderer/src/features/{connections, database, tables, query, logs, diagram, command-palette, settings}`. Shared design-system primitives live in `src/renderer/src/components/ui/` (Radix-based: button, input, select, sheet, popover, etc.). Use `@renderer/*` for absolute imports (alias defined in `electron.vite.config.ts`).

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
