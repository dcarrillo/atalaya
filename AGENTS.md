# AGENTS.md — Atalaya

Uptime monitor on Cloudflare Workers + Durable Objects, with an Astro 6 SSR status page served by the same Worker. pnpm workspace: Worker at `src/`, status page at `status-page/` (package name `atalaya-prod-status-page`).

## Architecture

- **Worker entrypoint**: `src/index.ts` — `fetch` (auth → `ASSETS` → dynamically imported Astro SSR) and `scheduled`. Crons: `*/2 * * * *` runs checks; `0 * * * *` runs hourly aggregation. `RegionalChecker` DO is re-exported at the bottom.
- **Astro entrypoint**: `status-page/src/pages/index.astro` — single-page SSR app. It imports Worker source directly with relative paths (`../../../src/config/index.js`, `../../../src/api/status.js`, `../../../src/utils/interpolate.js`); `status-page/src/lib/api.ts` is just a re-export shim. Env is read via `import { env } from 'cloudflare:workers'`.
- **Shared types**: `src/types.ts` via the `@worker/types` alias in `status-page/tsconfig.json` (types only).
- **Static assets**: `status-page/dist/client/` via the `ASSETS` binding (`run_worker_first = true`), so Worker auth runs before any asset is served.
- **Auth**: `src/lib/auth.ts` `checkAuth` runs first in `fetch`. `STATUS_PUBLIC=true` bypasses it; otherwise `STATUS_USERNAME`/`STATUS_PASSWORD` Basic auth. If neither public nor credentials are set, everything returns 403.
- **Config**: YAML in the `MONITORS_CONFIG` wrangler var. `${ENV_VAR}` interpolation in `src/utils/interpolate.ts` (also used by the status page).
- **DB**: D1 schema in `migrations/` (numbered SQL files). Columns are `snake_case`, TS props `camelCase` — map at the query boundary. Queries that would have no params need `WHERE 1=?` + `.bind(1)`.

## wrangler.toml is a symlink

`wrangler.toml` is gitignored and symlinked to `../wrangler.toml.ifconfig` (outside this repo). Editing it writes outside the tree. `wrangler.example.toml` is the committed template — update that for shareable config. Run `readlink wrangler.toml` before assuming which file you're editing.

## Commands

Root / Worker:

```bash
pnpm dev                        # wrangler dev
wrangler dev --test-scheduled   # required to trigger cron locally
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
pnpm test                       # vitest (watch mode locally; run mode in CI)
vitest run src/path/to.test.ts  # single worker test (no npx needed)
pnpm typecheck                  # tsc --noEmit
pnpm check                      # typecheck + lint + format:check
pnpm check:fix                  # lint:fix + format
pnpm lint:strict                # oxlint --deny warnings + eslint --max-warnings=0
pnpm build:pages                # astro build → status-page/dist/
pnpm deploy                     # build:pages + wrangler deploy
```

Pages (run from root; scripts filter the workspace):

```bash
pnpm dev:pages      # astro dev
pnpm test:pages     # vitest run
pnpm check:pages    # astro check + tsc --noEmit + eslint + prettier check
pnpm build:pages
```

CI (`.github/workflows/ci.yml`, Node 22/24) order: `pnpm check && pnpm check:pages` → `pnpm build:pages` → `pnpm test` → `pnpm test:pages`.

## Gotchas

- **Build the status page before running worker tests or `pnpm deploy`.** `src/index.ts` and `src/index.test.ts` reference `status-page/dist/server/index.mjs`; tests fail (500s) if it doesn't exist. `pnpm build:pages` first.
- **`.js` extensions in imports**: all Worker imports use `.js` (`import { foo } from './bar.js'`) even though the sources are `.ts`.
- **Don't delete the `mock-astro-ssr` plugin** in `vitest.config.ts`; it lets `vi.mock` intercept the Astro SSR artifact.
- **Astro 6 + `@astrojs/cloudflare` v13 workarounds** live in `status-page/astro.config.mjs` (`fixBuildRollupInput`, `prerenderEnvironment: 'node'`, `optimizeDeps.exclude: ['cookie']`). Only remove with an upstream fix.
- **Worker `fetch` treats an `ASSETS` 404 as "fall through to Astro SSR"** — don't add an early 404.
- `pnpm deploy` does not run checks or tests first.
- `pnpm test` is watch mode; prefer `vitest run <file>` for one-shot agent runs.

## Code Style

- **Prettier** (`.prettierrc.json`): single quotes, semicolons, 100 cols, ES5 trailing commas, no arrow parens, 2 spaces.
- **Linting**: Oxlint (`.oxlintrc.json`) + ESLint for the Worker; `status-page/**` is ignored by root ESLint and linted by `status-page/eslint.config.js` with `eslint-plugin-astro`.
- **Types**: `type` for aliases, `interface` for object shapes, explicit return types.
- **Naming**: files `kebab-case.ts`, types `PascalCase`, variables `camelCase`, DB fields `snake_case`.
- **Tests**: `*.test.ts` colocated with source, Vitest with `globals: true`. Worker suite: 20 files. Pages suite: 3 files.
