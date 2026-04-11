/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// Env bindings available via `import { env } from 'cloudflare:workers'`.
// Extends the Cloudflare.Env declared in @cloudflare/workers-types.
// Must match the D1 binding declared in the root wrangler.toml.
declare namespace Cloudflare {
  type Env = {
    DB: D1Database;
  };
}
