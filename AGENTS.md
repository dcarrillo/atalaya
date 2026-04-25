# AGENTS.md — Atalaya

## Architecture

npm workspace: Cloudflare Worker (`src/`) + Astro 6 SSR app (`status-page/`).

- **Worker entrypoint**: `src/index.ts` — `fetch` + `scheduled` handlers, `RegionalChecker` Durable Object
- **Astro entrypoint**: `status-page/src/pages/index.astro` — single-page SSR app
- **Static assets**: `status-page/dist/client/` served via `ASSETS` binding (`run_worker_first = true`)
- **Shared types**: `src/types.ts` imported via `@worker/types` alias in `status-page/tsconfig.json`
- **Auth**: `status-page/src/lib/auth.ts`, configured via `STATUS_PUBLIC`, `STATUS_USERNAME`, `STATUS_PASSWORD` env vars
- **Banner**: Custom banner image via `STATUS_BANNER_URL` and `STATUS_BANNER_LINK` env vars

## Commands

### Root (Worker)

```bash
npm run dev                   # wrangler dev
npm run test                  # vitest (17 test files)
npm run typecheck             # tsc --noEmit
npm run check                 # typecheck + lint + format:check
npm run check:fix             # auto-fix lint + format
npm run deploy                # build:pages + wrangler deploy
vitest run src/path/to.test.ts  # single test (no npx needed)
```

### Pages workspace

```bash
npm run dev:pages             # astro dev
npm run build:pages           # astro build → status-page/dist/

npm run check:pages           # astro check + tsc --noEmit
npm run lint:pages            # eslint (astro plugin)
```

### Verification order

Before commit: `npm run check && npm run test && npm run build:pages && npm run check:pages`

## Verification order

`npm run check` = typecheck + Oxlint (worker) + ESLint (dedup via `eslint-plugin-oxlint`). Pages uses `eslint-plugin-astro`.

## Gotchas

- **`.js` extensions in imports**: All worker imports use `.js` extensions (`import { foo } from './bar.js'`). Required for ESM resolution with `moduleResolution: "bundler"`.
- **D1 requires bind parameters**: Use `WHERE 1=?` with `.bind(1)` for queries that would otherwise have no parameters.
- **Database naming**: D1 columns are `snake_case`, TypeScript properties are `camelCase`. Map at query boundary.
- **`--legacy-peer-deps`**: Needed when installing Pages dependencies (`@astrojs/check` declares `typescript@^5` but project uses TypeScript 6).
- **Pages `dist/` and `.astro/`**: Build artifacts, gitignored.
- **Astro SSR build artifact**: Worker dynamically imports `../status-page/dist/server/index.mjs` at runtime — uses `@ts-expect-error`.
- **Astro 6 + @astrojs/cloudflare v13 workarounds**: `status-page/astro.config.mjs` includes `fixBuildRollupInput` plugin and `prerenderEnvironment: 'node'`.
- **Monitor config in `wrangler.toml`**: `MONITORS_CONFIG` env var contains full YAML config inline. Secrets interpolated via `${ENV_VAR}` syntax (`src/utils/interpolate.ts`).

## Code Style

- **Formatting**: Prettier — single quotes, semicolons, 100 char width, trailing commas ES5.
- **Linting**: Oxlint (worker) + ESLint with `eslint-plugin-oxlint` dedup. Pages uses `eslint-plugin-astro`.
- **Types**: `type` for aliases, `interface` for object shapes. Explicit return types.
- **Naming**: files `kebab-case.ts`, types `PascalCase`, variables `camelCase`, DB fields `snake_case`.
- **Tests**: `*.test.ts` colocated with source. Vitest with `vi` for mocks.

## Banner Configuration

Set environment variables in `wrangler.toml` or Cloudflare dashboard:

```toml
[vars]
STATUS_BANNER_URL = "https://example.com/banner.png"
STATUS_BANNER_LINK = "https://example.com"  # optional
```

- Banner replaces title text when `STATUS_BANNER_URL` is set
- Title is used as `alt` text for accessibility
- Link opens in same tab when `STATUS_BANNER_LINK` is set
- Empty or unset URL falls back to title display
