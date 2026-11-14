# AGENTS.md — Atalaya

Uptime monitor on Cloudflare Workers + Durable Objects, with an Astro 6 SSR status page served by the same Worker. pnpm workspace (Node >=22; CI uses Node 22/24 and pnpm 11): Worker at `src/`, status page at `status-page/` (package `atalaya-prod-status-page`).

## Architecture

- **Worker entrypoint**: `src/index.ts` — `fetch` and `scheduled`. `fetch` runs `checkAuth` → `ASSETS` → dynamically imported Astro SSR. Public GET 200s get `Cache-Control: public, max-age=60`; authenticated responses get `private, no-store` + `Vary: Authorization`. `RegionalChecker` is re-exported at the bottom.
- **Crons**: `0 * * * *` runs hourly aggregation; any other cron runs configured checks. The tracked example uses `* * * * *`; local configs may use `*/2`.
- **Regional checks**: a monitor's `region` runs in the `RegionalChecker` DO with a location hint; any DO failure falls back to a local check.
- **Astro entrypoint**: `status-page/src/pages/index.astro` — single-page SSR app. It imports Worker source directly with relative paths (`../../../src/config/index.js`, `../../../src/api/status.js`, `../../../src/utils/interpolate.js`); `status-page/src/lib/api.ts` is just a re-export shim. Env is read via `import { env } from 'cloudflare:workers'`.
- **Shared types**: `src/types.ts` via the `@worker/types` alias in `status-page/tsconfig.json` (types only).
- **Static assets**: `status-page/dist/client/` via the `ASSETS` binding (`run_worker_first = true`), so Worker auth runs before any asset is served.
- **Auth**: `src/lib/auth.ts` `checkAuth` runs first in `fetch`. `STATUS_PUBLIC=true` bypasses it; otherwise `STATUS_USERNAME`/`STATUS_PASSWORD` Basic auth. If neither public nor credentials are set, everything returns 403.
- **Config**: YAML in the `MONITORS_CONFIG` wrangler var. `${ENV_VAR}` interpolation is `src/utils/interpolate.ts` (also used by the status page).
- **DB**: D1 schema in `migrations/` (numbered SQL files). Columns are `snake_case`; write-side TS types are `camelCase` and map at the query boundary, while raw query row types keep `snake_case`. Queries that would have no params use `WHERE 1=?` + `.bind(1)`.

## Commands

Root / Worker:

```bash
pnpm dev                                 # wrangler dev (cannot fire cron locally)
wrangler dev --test-scheduled            # required to trigger cron locally
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
pnpm exec vitest run                     # all worker tests, one-shot
pnpm exec vitest run src/index.test.ts   # single worker test
pnpm test                                # vitest watch mode locally; CI runs once
pnpm typecheck                           # tsc --noEmit
pnpm check                               # typecheck + lint + format:check (Worker)
pnpm check:fix                           # lint:fix + format (does not typecheck)
pnpm lint:strict                         # oxlint --deny warnings + eslint --max-warnings=0
pnpm build:pages                         # astro build → status-page/dist/
pnpm deploy                              # build pages + wrangler deploy (no checks/migrations)
wrangler d1 migrations apply DB --remote # apply migrations explicitly
```

Pages (run from root; scripts filter the workspace):

```bash
pnpm dev:pages
pnpm test:pages
pnpm --filter=atalaya-prod-status-page exec vitest run src/lib/header.test.ts
pnpm check:pages      # astro check + tsc --noEmit + eslint + prettier check
pnpm format:pages     # prettier --write worker + status-page TS
pnpm build:pages
```

CI (`.github/workflows/ci.yml`) order: `pnpm check && pnpm check:pages` → `pnpm build:pages` → `pnpm test` → `pnpm test:pages`.

## Gotchas

- **Build the status page before running worker tests.** `src/index.test.ts` mocks/expects `status-page/dist/server/index.mjs`; without it, tests fail with 500s. `pnpm check` does not build it.
- **`wrangler.toml` is gitignored and symlinked to the actual configuration.** Edit `wrangler.example.toml` for committed config; don't assume local crons/bindings match the example.
- **`.js` extensions in imports**: all Worker imports use `.js` (`import { foo } from './bar.js'`) even though the sources are `.ts`.
- The dynamic `import('../status-page/dist/server/index.mjs')` in `src/index.ts` is intentional (bundled artifact); keep its `@ts-expect-error`.
- **Worker `fetch` treats an `ASSETS` 404 as “fall through to Astro SSR”** — don't add an early 404.
- **Astro 6 + `@astrojs/cloudflare` v13 workarounds** live in `status-page/astro.config.mjs` (`fixBuildRollupInput`, `prerenderEnvironment: 'node'`, `optimizeDeps.exclude: ['cookie']`). Only remove with an upstream fix.
- `pnpm deploy` does not run checks or apply D1 migrations.
- `pnpm test` is watch mode; prefer `pnpm exec vitest run [file]` for one-shot agent runs. The status page has its own Vitest config and is not covered by the root test run.

## Code Style

- **Prettier** (`.prettierrc.json`): single quotes, semicolons, 100 cols, ES5 trailing commas, no arrow parens, 2 spaces.
- **Linting**: Oxlint (`.oxlintrc.json`) + ESLint for the Worker; `status-page/**` is ignored by root ESLint and linted by `status-page/eslint.config.js` with `eslint-plugin-astro`.
- **Types**: `type` for aliases, `interface` for object shapes, explicit return types.
- **Naming**: files `kebab-case.ts`, types `PascalCase`, variables `camelCase`, DB fields `snake_case`.
- **Tests**: `*.test.ts` colocated with source, Vitest with `globals: true`.
