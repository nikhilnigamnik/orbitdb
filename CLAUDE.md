# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

OrbitDB is an Electron desktop DB client for PostgreSQL, MySQL/MariaDB, and Cloudflare D1. React 19 + TypeScript renderer, Node main process, electron-vite build.

This is an MIT-licensed open-source project. `README.md` is the user-facing description,
`CONTRIBUTING.md` covers setup and review expectations, and `SECURITY.md` covers private
disclosure - keep all three current when behaviour changes.

## Commands

```bash
pnpm dev              # electron-vite dev - hot-reload renderer + main
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

Releases are tag-driven: `pnpm release:{patch,minor,major}` bumps `package.json`, commits, tags `vX.Y.Z`, pushes - GitHub Actions builds & uploads to a draft release. Do **not** run these casually; they push commits.

Tests run on Vitest (`vitest.config.ts`). Every spec lives under the top-level `tests/`
folder, mirroring the `src/` layout - **not** colocated with the source file, so the
electron-vite build never has to glob around them. New behaviour ships with a spec.

`vitest.config.ts` pins `TZ` to `Asia/Kolkata`. Date rendering is timezone-sensitive, so
without it a spec that passes locally fails on a UTC runner - and a zero offset renders as
`Z`, which never exercises the offset-carrying path. Assert exact offsets, not a loose
pattern.

`tests/setup/jsdom-polyfills.ts` fills in the DOM APIs Radix calls unconditionally
(pointer capture, `scrollIntoView`, `ResizeObserver`). Without them a Select or Popover
throws inside the component instead of failing an assertion.

Three testing shapes, cheapest first:

- **Pure logic** - plain `.test.ts`. Prefer extracting decision-making out of a component
  into `features/<x>/lib/` and testing it there (`filter-editor.ts` exists because the
  NULL-vs-empty-string bug lived in a branch buried in JSX).
- **Static render** - `renderToStaticMarkup` + `createElement` in a `.test.ts`, for
  asserting what a component _renders_ (classes, aria labels) without a DOM.
- **Interaction** - `.test.tsx` with `// @vitest-environment jsdom` at the top and
  `@testing-library/react`, for anything driven by state or effects. Stub the IPC bridge
  with `Object.assign(window, { api: { db: { … } } })`.

Main-process modules that import `electron` are tested by mocking it - see
`tests/main/store/connections-store.test.ts` for the `vi.hoisted` + `vi.mock('electron')`
pattern, and `vi.resetModules()` to reset module-level caches between cases.

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build on every push to
`main`/`dev` and on every PR. Releases stay tag-driven in `release.yml`.

## Architecture

Three processes, three TS contexts. The shared boundary lives in `src/shared/types.ts` - both sides import from it.

```
renderer (Chromium, no Node access)
   ↕  window.api.*   (defined in preload/index.ts)
preload (Node + browser bridge)
   ↕  ipcRenderer.invoke
main (full Node)
   └─ db/drivers/{postgres,mysql,d1}.ts  via  db/manager.ts
```

### The IPC envelope pattern (important - don't break it)

Every IPC handler in `src/main/ipc/index.ts` is wrapped by `wrap()`, which catches throws and returns `OperationResult<T> = { success, data?, error? }`. Preload methods return `Promise<OperationResult<T>>`. The renderer never calls these raw - it goes through `unwrap()` in `src/renderer/src/lib/ipc.ts`, which throws on `success: false`.

So the renderer-side pattern is always:

```ts
const tables = await unwrap(window.api.db.listTables(connectionId, schema))
```

To add a new IPC endpoint, you touch **three** files:

1. `src/main/ipc/index.ts` - `ipcMain.handle('namespace:action', wrap(async (...args) => ...))`
2. `src/preload/index.ts` - add to the `api.db` (or new namespace) object with `invoke<T>(...)`
3. `src/shared/types.ts` - if new request/response shapes are needed

### Database driver abstraction

`DatabaseDriver` (`src/main/db/drivers/types.ts`) is implemented three times: `postgres.ts`, `mysql.ts`, `d1.ts`. `src/main/db/manager.ts` looks up the saved connection's `engine` field and dispatches to the right driver. To add a new engine: implement the interface, register it in `manager.ts:driverFor()`. The renderer is engine-agnostic - it just passes `connectionId` around.

D1 is special: it has no schemas (returns `[]`), uses the Cloudflare REST API instead of a socket connection, and has no concept of enums or PK introspection beyond what `pragma table_info` exposes.

D1's SQLite-dialect pieces - pragma row mapping, identifier quoting, type normalisation and the DDL/filter dialects - live in `src/main/db/sqlite-shared.ts` rather than inline, so they can be unit tested without a live database (`tests/main/db/sqlite-shared.test.ts`).

### DDL / structure editing

Structure edits (add/drop/rename column, rename table, create/drop index) go through `generateDdl`/`executeDdl` on the driver. Both build SQL from a `DdlOperation` discriminated union (`src/shared/types.ts`) via the shared `buildDdl()` in `src/main/db/ddl.ts` - each driver supplies a `DdlDialect` (identifier quoting + the engine-specific `DROP INDEX` grammar). `generateDdl` is preview-only (returns the SQL string, no DB call); `executeDdl` runs it and invalidates that connection's `tableDetailsCache`. Exposed as `db:ddl-preview` / `db:ddl-execute` → `window.api.db.ddlPreview` / `ddlExecute`. The renderer dialog (`features/database/components/ddl-dialog.tsx`) live-previews the generated SQL before the user confirms; `dataType` and `defaultValue` are passed through as raw SQL expressions (the preview shows exactly what runs). The dialog is hosted once in `database-page.tsx`'s `TableViewContainer` and shared by two triggers: the rename action surfaced by `table-data-view.tsx` and the per-section/row actions in the presentational `table-structure.tsx` (which just calls `onEdit(kind, target?)`). DDL controls only render for `type === 'table'` (not views); on `rename-table` success the container navigates to the new table route.

### AI layer (Anthropic / OpenAI / Google via Vercel AI SDK)

The main process has an `src/main/ai/` layer behind the same IPC envelope. It uses the Vercel AI SDK (`ai`) with three providers - `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` - all pinned to the **`ai-v6` release line**; their `latest` tags target a newer `ai` major than this repo's, so install with `pnpm add @ai-sdk/<name>@ai-v6`.

`src/shared/ai-models.ts` is the registry: providers, their models, and the placeholder for each key format. Adding a provider is a row there plus a row in `FACTORY` in `ai/client.ts` - nothing else. `isAiModelId(provider, model)` pairs the two deliberately: `gpt-5.2` is a real model but not a real _Anthropic_ one, and sending it there returns an opaque 404.

**The key is user-supplied, not build-time.** It is pasted in Settings and stored encrypted in `settings.json` (see _Settings persistence_ below). Nothing reads `.env` any more - there is no `.env.example`.

That has one consequence worth knowing before editing `ai/client.ts`: `getModel()` is a **function**, not the module-level constant it used to be. The credential is runtime state, so the model has to be re-read after a save, and `getModel()` caches the built provider keyed on `(apiKey, model)` so it only rebuilds when one of them actually changes. It throws `MissingApiKeyError` - whose message names Settings - when no key is set, which is how all four renderer surfaces report the missing key without any of them knowing about it.

Each provider keeps its **own key and model**; switching provider in Settings doesn't discard the others. Default is Anthropic + `claude-sonnet-5`.

Five endpoints under the `ai:` IPC namespace → `window.api.ai.*`:

- `ai:generate-sql` (`generate-sql.ts`) - natural language → SQL, grounded in the whole-DB schema map. Query page auto-runs the result.
- `ai:filter-table` (`filter-table.ts`) - natural language → a WHERE clause feeding the existing data grid. The model's answer is never trusted verbatim: `filter-repair.ts` drops hallucinated columns and SQL-expression values, and snaps enum values onto the labels introspection already knows (`action = 'update'` → `= 'Update'`, and an `ilike` on an enum - which Postgres rejects as `operator does not exist` - down to `=`). An enum's input domain is closed, so a value outside it is _guaranteed_ to fail at the driver; repairing it deterministically beats spending a second model call to discover that. Conditions it cannot repair are dropped and reported in `FilterTableResult.notes`, because silently widening the result set reads as an answer.
- `ai:explain-table` (`explain-table.ts`) - returns markdown describing a table.
- `ai:suggest-indexes` (`suggest-indexes.ts`) - index suggestions for a table.
- `ai:generate-seed` (`generate-seed.ts`) - the model returns row _values_; code builds the inserts deterministically (engine-correct quoting/escaping, code-gen UUIDs for UUID/string-PK columns, FK sampling from parent tables, type coercion, per-row execution, batched at `SEED_BATCH_SIZE` for large counts). Never trust the model to emit raw SQL for seeds.

  **Its response schema must name the columns** - `seedRowsSchema(fillColumns)` builds one property per column being filled. The obvious `z.record(z.string(), z.unknown())` converts to `{type: 'object', additionalProperties: {}}`: a row declaring no permitted keys. That was harmless while structured output was requested in prose, but as a native `output_config.format` it constrains the model to exactly that, and it answers `{"rows": []}` - seeding failed on every table with "The model returned no sample rows". Naming the columns also enforces "only these, all of them" structurally instead of asking in prose. If you ever widen this schema, dump it with `zodSchema(...).jsonSchema` and check the row still has `properties`/`required`; `tests/main/ai/generate-seed.test.ts` pins it.

`ai/client.ts` exposes `generateJson()` - structured output in two layers. First `generateText` + `Output.object`: **that is the supported path, not `generateObject`, which AI SDK 6 deprecated** (see the v6 migration guide). Every model offered in Settings reports `supportsStructuredOutput`, so the Anthropic provider turns the zod schema into a native `output_config.format` rather than asking for JSON in prose. Second, a plain-text retry parsed with `stripFences`/`extractJson` + zod - `Output.object` takes no repair hook (only `schema`/`name`/`description`), so salvaging a fenced or preamble-wrapped reply means asking again. Because that retry costs a real call, `isWorthRetrying()` rethrows `APICallError` and timeouts immediately: a 401 must not cost two round-trips, and retrying a 429 makes the rate limit worse. `ai/context.ts` builds schema context: `buildSchemaContext()` (compact whole-DB map, capped at `MAX_SCHEMA_TABLES`, skips system schemas) for free-form SQL, and `buildTableContext()` (detailed single-table) for table-scoped features. `buildTableContext()` names a column by its `udtName` rather than `dataType` - Postgres reports every enum as the literal string `USER-DEFINED`, so the model was not even shown the type name - and lists enum labels (capped at `MAX_ENUM_LABELS`) after a `values:` marker that the `filter-table.ts` system prompt refers to by name; change the two together. `buildSchemaContext()` still has this gap, because `SchemaGraphColumn` carries no `enumValues`. `QUOTE_HINT`/`ENGINE_DIALECT` give the model engine-correct identifier quoting.

Renderer surfaces: `features/query/components/ai-prompt.tsx` (NL→SQL on the query page), the 'Ask AI' filter in `table-data-view.tsx`, and `structure-ai.tsx` + `seed-data-dialog.tsx` on the structure tab. Markdown responses render via `components/common/markdown.tsx`.

### Cloudflare AI Gateway

Cloudflare is the **fourth provider**, alongside Anthropic, OpenAI and Google - same card, same Active switch, same model picker. Its "key" is the gateway token, so it reuses every bit of the per-provider key machinery (sealing, hint, the unreadable rule, clear, test).

Two things make it not quite like the others, and both are handled by exception rather than by generalising a shape that has one member:

- **Its model ids are `provider/model`**, where the prefix is Cloudflare's and the model half is **the vendor's own id**: `anthropic/claude-sonnet-5`, `google/gemini-3.6-flash`. Two halves, two traps, both hit in practice. The prefix is `google`, not `google-ai-studio` - that is the separate provider-native route. And the model half must be the vendor id, _not_ the name in Cloudflare's catalog: the catalog lists `anthropic/claude-haiku-4.5`, but under BYOK the gateway forwards everything after the slash straight to Anthropic, which only answers to `claude-haiku-4-5-20251001`. Catalog names apply only when Unified Billing supplies the credential; vendor ids work under both. `tests/shared/ai-cloudflare-models.test.ts` pins all of this, and `tests/shared/ai-pricing.test.ts` fails until a new entry has a price.
- **It needs two ids beyond its token.** They live in their own `gateway` block rather than in `keys`, because they are not secrets. `needsGatewayIds()` is what the settings card branches on, and `buildModel()` special-cases `cloudflare` rather than `FACTORY` pretending a two-id provider fits a one-key signature. Its token is genuinely optional too - an unauthenticated gateway is a valid setup - so the `MissingApiKeyError` check is per provider, not up front.

Pricing rows mirror the vendors' own, because Unified Billing passes inference through at the vendor rate with no markup; the 5% is charged when credits are bought, so it cannot be priced per token. Gateway usage lands under provider `cloudflare` in the rollup, which separates gateway spend from direct spend rather than muddling them.

Pinning: `ai-gateway-provider@3.2.0`, not `latest` - 4.x peers `ai@^7` and this repo is on 6. Its own peers `@ai-sdk/openai-compatible` and `@ai-sdk/provider` are declared explicitly rather than leaned on transitively (an undeclared `@lezer/highlight` passed locally and broke CI once already).

`createUnified()`'s base URL is a marker, not a destination: it sets `https://gateway.ai.cloudflare.com/v1/compat`, which `createAiGateway` recognises by regex and rewrites to the universal endpoint `…/v1/{accountId}/{gatewayId}`, adding `cf-aig-authorization`. Same destination as pointing an OpenAI client at `…/{accountId}/{gatewayId}/compat` by hand.

**Two caveats worth knowing.** Structured output through the unified endpoint has not been verified against a live gateway - if `Output.object` does not reach it as a native `response_format`, `generateJson()` falls to its plain-text retry and every call silently costs two. And a gateway cache hit costs nothing but may still report tokens, so with caching on the usage figure stops being a strict lower bound.

### Settings persistence

`src/main/store/settings-store.ts` writes `settings.json` into `userData` (schema v3), holding the selected provider plus a key and model per provider, and the Cloudflare gateway ids. A v1 file - one `apiKey`/`model`, from when Anthropic was the only provider - migrates on read into the anthropic slot; a v2 file simply has no gateway block, and an absent one reads as a Cloudflare provider nobody has configured yet. Same hand-rolled shape and same `safeStorage` encryption as connections, including the rule that a key which fails to decrypt is **kept on disk untouched** rather than blanked - writing the empty read-back would destroy a key the user could still recover by logging into the right OS account.

`accountId` and `gatewayId` are stored **plain** and cross the IPC boundary in full, unlike every other credential here: they identify rather than authorise, and both appear in every dashboard URL. That also means `setGatewaySettings()` treats an empty string as empty rather than as "unchanged" - blanking them is how the provider is un-configured, whereas blanking a key field would be a way to lose one.

Exposed under the `settings:` IPC namespace → `window.api.settings.*`. **No key ever crosses back to the renderer**: `settings:get-ai` returns `{ provider, hasKey, keyHint, isKeyUnreadable, model, configured }`, where `keyHint` is the last four characters and `configured` is just the list of provider ids that have one, plus the gateway ids, which are not secrets. `settings:test-ai` makes one tiny real call so a bad key fails on a button the user pressed rather than halfway through generating SQL - and it goes through `buildModelFor`, so testing Cloudflare exercises the gateway rather than a direct call.

### AI usage tracking

`src/main/store/usage-store.ts` writes `usage.json` into `userData` - **not encrypted**, unlike the other two stores, because token counts hold no secrets and `crypto.ts` costs a keychain round-trip per read.

Rolled up per local day rather than logged per call (`provider|model|feature` → `{calls, input, output}`), so the file stays small however heavily the AI features run, and pruned to `USAGE_RETENTION_DAYS` (90) on every write. Day keys come from `date-fns` `format(…, 'yyyy-MM-dd')` in local time - the spec's fixtures are deliberately set at 20:30 UTC, which is already tomorrow under the `TZ=Asia/Kolkata` pin, so a UTC-derived key would fail.

**The invariant: `runText()` in `ai/client.ts` is the only place this app calls a model.** Every endpoint goes through it, so usage is recorded exactly once, in one place; a second call path would silently under-count. Recording is wrapped in try/catch - bookkeeping must never cost the user the answer they were waiting for. Note that a _failed_ call carries no usage object, so the reported figure is a lower bound rather than a guess.

Exposed as `usage:summary` / `usage:clear` → `window.api.usage.*`. Aggregation (today / 30 days / all time, by model and by feature) happens in main: the renderer receives numbers to render, not a log to fold.

**Cost estimation** lives in `src/shared/ai-pricing.ts` - published list prices per model in USD per million tokens, taken from each vendor's own pricing page (not an aggregator; several disagree with the vendor by 2×). It is hardcoded and _will_ drift, which is why every surface labels the figure an estimate.

Two things make the per-day rollup load-bearing rather than incidental. A rate can change partway through a window - Claude Sonnet 5 carries a launch discount (`promo`) through 2026-08-31 - so `summarise()` takes `[dayKey, rows]` and prices each day at the rate in effect _that_ day, which is exact rather than an approximation. And a model with no pricing row returns `null` from `costOf()` rather than `0`: it accumulates into `UsageWindow.unpricedCalls` so the UI can say the total is short, instead of showing a free-looking call. `tests/shared/ai-pricing.test.ts` asserts every model in `AI_PROVIDERS` has a rate, so adding one to the picker without a price fails the suite.

### Query persistence

`src/main/store/queries-store.ts` writes `queries.json` into `userData` - plain JSON, unencrypted for the same reason as `usage.json`: a query names tables, not secrets, and `crypto.ts` costs a keychain round-trip on a file read on every query-page mount.

It holds run history **and** saved queries in one list, because they are the same thing at different ages. `isStarred` is the only distinction, and it carries two consequences at once: a starred entry is exempt from `MAX_HISTORY_PER_CONNECTION` (100, counted per connection so a busy connection cannot evict a quiet one's history), and it is the only kind that may carry a `name`. Unstarring therefore clears the name - a named entry the pruner can still delete is a promise the store cannot keep.

Re-running identical SQL folds into the existing unstarred entry rather than appending, so iterating on one query does not push everything else off the cap. A **starred** copy is never folded into: it keeps the timing of the run the user kept, and the re-run starts a fresh history entry beside it.

Exposed under the `queries:` namespace → `window.api.queries.*`. The renderer keeps only the editor **draft** in `localStorage` (`orbitdb:query-draft:<id>`) - that is one window's unsaved text and has no meaning elsewhere. History used to live there too, which made it the one piece of user state that never reached `userData`.

### Relationship navigation

Foreign keys are followable in both directions.

Outwards was already there: `table-data-view.tsx` builds `fkByColumn` from `TableDetails.foreignKeys` and `data-grid.tsx` renders a jump arrow on those cells.

Inwards needs `db:referencing-keys` → `driver.referencingKeys()`, because `TableDetails` only knows the constraints a table _holds_. Postgres and MySQL run the same catalogue query as `tableDetails` filtered on the referenced side; SQLite has no reverse FK catalogue at all, so D1 sweeps `pragma foreign_key_list` over every table and filters. It is deliberately **not** folded into `tableDetails`: that result is cached per table and opened constantly, while this scans the whole database and is asked for once per row opened.

`ReferencedBy` (`features/tables/components/referenced-by.tsx`) renders it inside the row editor, counting each child with `db:rows-count`. Two rules live in `lib/referencing.ts` and are the reason it is a separate testable module: a NULL on the parent side yields **no** link rather than a count (`col = NULL` is never true, so zero would read as a real answer), and links go through `tableRouteWithFilters` - the `filters` URL param, not the single-column `fkColumn`/`fkValue` pair - so a composite key links as precisely as a simple one.

### The grid's keyboard, and remembered views

`useGridCursor` (`features/tables/hooks/`) owns a cell cursor, a rectangular selection extended with shift, and copy. It is deliberately separate from the row checkboxes: those select whole rows to _act_ on (delete, export), this selects a region to _read out_. `Cmd+C` gives TSV (with a header only when more than one cell is selected, since Excel's quoting rules are what make a multi-line JSON column paste as one field), `Cmd+Shift+C` gives JSON with the values still typed. The maths lives in `lib/grid-cursor.ts` and the formatting in `lib/clipboard-format.ts`, both pure.

Arrow keys clamp at the edges rather than wrapping - `CellInlineEditor`'s Tab wraps because it is walking a sequence of fields, but an arrow key names a direction.

`toInsertSql` builds SQL in the **renderer**, which the seed feature deliberately does not. The difference is where it goes: this lands on the clipboard for a person to read, while a seed executes unseen. Quoting is still engine-correct (MySQL backticks, and backslash escaping inside literals, which Postgres must _not_ do), hence the `engine` on `InsertTarget` - passed down from `database-page.tsx` because `TableDataView` cannot call `useConnection()` without a provider the tests do not mount.

`lib/view-prefs.ts` persists sort, page size, hidden columns and column widths per connection+table in `localStorage`. Unlike saved queries this stays out of `userData`: it is view state, and losing it costs a re-drag. Widths commit on mouse **up**, not per frame. Writes happen at each mutation point rather than from an effect over the state - an effect would still be holding the previous table's sort when the table changes and would save it under the new table's key.

`toggleHiddenColumn` refuses to hide the last visible column, because an empty grid has no control left to bring anything back. Hidden columns are still selected and fetched; hiding is a view concern.

**A trap this uncovered:** `TableDataView`'s "reset on table change" effect only ever ran on mount, since `database-page.tsx` keys the container by `${schema}.${table}` and a switch remounts. On mount it called `setFilters([])`, throwing away the filters a deep link arrived with - which is exactly what an FK jump is. It is now guarded by a ref so the first run is skipped; `tests/renderer/table-view-prefs.test.tsx` pins it.

### The SQL editor

`sql-editor.tsx` is a hand-rolled CodeMirror 6 wrapper - no `@uiw` binding, matching how the stores are hand-rolled. Three things about it are load-bearing:

The view is built **once**, in an effect with an empty dependency list. Anything that can change afterwards goes through a `Compartment` (language, editable) or a ref (`onChange`, `onSubmit`), because rebuilding the view would throw away the document, the undo history and the cursor every time the schema finished loading.

The `value` effect only dispatches when the prop and the document have actually diverged. Echoing every keystroke back would reset the cursor to the end of the document on each character.

`onSubmit` receives **the document**, not the `value` prop. Typing and pressing Cmd+Enter in the same tick would otherwise run the text React had before its re-render - which is exactly what a test caught.

Colours come from the app's CSS variables rather than a packaged theme, so the editor cannot drift when a token changes. Completion is fed by `useSqlSchema`, which reuses `db:schema-graph` (one call per schema, versus one per table for `tableDetails`) and fails silently: completion is an enhancement, and a schema the user cannot introspect should not put an error on a page that still runs queries.

`buildSqlSchema` registers each table twice, qualified and bare, because real queries are written unqualified - and the default schema wins the bare name when two collide.

### Frozen columns, and the Columns popover

A sticky column needs an explicit `left` offset, which is the summed width of everything pinned before it - so freezing **pins a width** (`FROZEN_DEFAULT_WIDTH`) if the column has not been dragged to one, or the offsets drift as auto-sized columns re-measure. `orderColumns` moves pinned columns to the front inside `DataGrid` rather than at the call site, so the cursor and the clipboard both see the order on screen. The leading checkbox and row-number columns pin too, or a frozen data column slides over them at `left: 0`.

The Columns control is a **Popover of plain buttons**, not a `DropdownMenu`. It started as the latter, and the pin nested inside a `DropdownMenuItem` toggled the column's visibility as well as pinning it: a menu item owns its whole row's activation, and `stopPropagation` on the child does not stop Radix's `onSelect`. Two sibling buttons cannot fight over a click. It also matches the filter picker's `SlidingHoverList`, which is the other list of columns in that bar.

### Shortcuts overlay

`config/shortcuts.ts` is the single list; `ShortcutsOverlay` renders it. The keys are implemented elsewhere, which is the usual way a help screen goes stale, so the list is data read by both and `tests/renderer/shortcuts-overlay.test.tsx` asserts every entry renders. `isTyping()` guards with `instanceof HTMLElement` rather than a cast - a keydown can be dispatched at the document, which has neither `tagName` nor `closest`.

### Connection overview

Replaces the "select a table" empty state (`db:overview` → one driver method each). Every size is nullable rather than zero: D1 exposes no size at all over the query API, and a Postgres role without the grant for `pg_database_size` should degrade to a null rather than fail the page. D1 substitutes real `count(*)` per table, affordable only because the list is capped at `OVERVIEW_TABLE_LIMIT`.

`toCount` lives in `db/coerce.ts` because pg returns bigints as strings and mysql2 returns either.

### Diagram layout

Node positions are saved per connection+schema in `localStorage` and applied over a fresh auto-layout, so a table added since is left where auto-layout put it rather than stacked at the origin. Saved on drag **stop**, not on change - dragging emits a position change per frame. A layout with no usable positions reads as no layout at all, since restoring an empty one would stack every table on the origin.

### Connection persistence

`src/main/store/connections-store.ts` writes a plain JSON file (`connections.json`) into Electron's `userData` directory. There is no `electron-store` dependency - it's hand-rolled. Sensitive fields (`password`, `apiToken`) are encrypted at rest via Electron `safeStorage` (`src/main/store/crypto.ts`) with an `enc:v1:` prefix; plaintext values are migrated to encrypted on read. If `safeStorage` is unavailable on the host (no OS keychain/DPAPI), it logs a warning and falls back to plaintext.

### Renderer structure

Feature folders under `src/renderer/src/features/{connections, database, tables, query, logs, diagram, command-palette, settings}`. Shared design-system primitives live in `src/renderer/src/components/ui/` (Radix-based: button, input, select, sheet, popover, etc.). Use `@renderer/*` for absolute imports (alias defined in `electron.vite.config.ts`).

Routing is React Router v7 (`src/renderer/src/app.tsx` + `config/routes.ts`). Active table is encoded in the URL as `?schema=...&table=...`, which `table-data-view.tsx` reads and `schema-tree.tsx` highlights.

## Conventions that matter here

- `pnpm` only - postinstall hook runs `electron-builder install-app-deps` (rebuilds native modules).
- `pg` and `mysql2` are real native modules and are externalized; do not try to bundle them into the renderer.
- Selected/hover row colors in `data-grid.tsx` use neutral `surface-elevated` tones, not `accent` - see git history if you're tempted to use blue.
- macOS code signing is **intentionally disabled** in `electron-builder.yml` (`identity: null`). Don't change this without a Developer ID Application cert in the keychain - builds will fail loudly otherwise.
- App icons live in `build/icon.{png,icns}` (electron-builder source) and `resources/icon.png` (runtime BrowserWindow icon). Both must have ~12% transparent padding around the artwork or macOS will render them oversized.

## When in doubt

- Two tsconfigs: any file under `src/main/**`, `src/preload/**`, `src/shared/**` is checked by `typecheck:node`. Files under `src/renderer/**` are checked by `typecheck:web`. Running just one is fine for quick iterations; run both before commits.
- The renderer cannot `import` from `src/main/**`. The only legal cross-boundary path is the IPC envelope via `window.api.*`.
