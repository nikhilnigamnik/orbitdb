# Contributing

Thanks for taking a look. Issues and pull requests are both welcome.

## Getting set up

```bash
pnpm install     # pnpm only - the postinstall step rebuilds native deps
pnpm dev
```

You'll want a database to point it at. Anything reachable works: a local Postgres or MySQL, a Neon or Supabase instance, or a Cloudflare D1 database.

The AI features are optional. To try them, add an Anthropic, OpenAI or Google API key in **Settings → AI** - it is stored encrypted in `userData`, not in the repo. Everything else works without one.

## Before opening a pull request

```bash
pnpm test
pnpm typecheck
pnpm lint
```

CI runs all three plus a build, and won't merge without them.

## What we look for

**Tests for behaviour that can break.** The suite lives in `tests/`, mirroring `src/`, rather than beside the source. Three shapes, cheapest first:

- **Pure logic** - a plain `.test.ts`. Prefer pulling a decision out of a component into `lib/` and testing it there. Several modules exist precisely because a bug was hiding in a branch that no test could reach.
- **Static render** - `renderToStaticMarkup` for asserting what a component renders, without a DOM.
- **Interaction** - `.test.tsx` with `// @vitest-environment jsdom` and Testing Library, for anything driven by state or effects.

A useful habit: after writing a test, break the thing it covers and check that it fails. More than one test in this repo passed for the wrong reason until that was done.

**Comments that explain why, not what.** The codebase leans on this - a comment earns its place when the code alone would leave the next person guessing about a constraint, a workaround, or a decision.

**Conventional commits.** `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `chore:`, with an optional scope: `fix(tables): ...`.

## Things worth knowing

- **The main process has no hot reload.** After editing anything under `src/main`, restart `pnpm dev`.
- **The renderer cannot import from the main process.** The only path across is the IPC envelope - see the architecture section in the README.
- **Two tsconfigs.** `typecheck:node` covers main, preload and shared; `typecheck:web` covers the renderer. `pnpm typecheck` runs both.
- **Adding a database engine** means implementing `DatabaseDriver` (`src/main/db/drivers/types.ts`) and registering it in `manager.ts`. The renderer needs no changes; exhaustive `Record<DatabaseEngine, …>` maps will point out every place that needs an entry.
- **`CLAUDE.md`** carries the working notes - conventions and gotchas that aren't obvious from the code. Worth reading before a first change, and worth updating when you learn something the hard way.

## Reporting bugs

Include the engine and version, what you did, what happened, and what you expected. A failing query or an error message from the query log helps enormously.

Please don't paste real credentials, connection strings, or row data.
