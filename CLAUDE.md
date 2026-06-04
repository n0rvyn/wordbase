# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

WordBase is an AI-native CMS (blog · podcast · app landing pages · companion pages) that replaces WordPress: a Hono/TypeScript API + MCP server backed by SQLite, and an Astro SSG frontend served by Caddy. `README.md` is the authoritative reference for the REST API table, full MCP tool list, data model, and deploy details — read it before asking. This file covers what isn't obvious from a single file.

## Commands

pnpm workspace, two packages: `api` and `web`. Run filtered from repo root, or `cd` into the package.

```bash
pnpm install
pnpm dev:api                       # API + MCP-HTTP on :4100  (tsx watch)
pnpm dev:web                       # Astro admin/site on :4321
pnpm build                         # api (tsc) then web (astro) — order matters, see below
pnpm db:migrate                    # apply Drizzle migrations

pnpm --filter api test             # vitest run (API suite)
pnpm --filter web test             # vitest run (web lib suite)
pnpm --filter api test -- routes.scope-enforcement   # single test file (substring match)
pnpm --filter api exec vitest watch                  # TDD watch

pnpm --filter api cli key:create <name> [scopes...]  # mint API key (no scopes = full-admin '*')
pnpm --filter api cli key:regenerate <name>
```

No linter is configured; `tsc` (via `pnpm build`) is the type gate. There is no `xcodebuild` here — this is a Node project despite the global Apple/Swift rules.

## Deploy

Production host is `norvyn`. **Deploy = `ssh norvyn 'bash -s' < deploy/setup.sh`** (idempotent: pull + build api + build web + restart `wordbase-api` and Caddy). Never hand-assemble ad-hoc ssh pull/build/restart commands. Content-only republish (no code change) happens automatically via a `.rebuild-request` marker watched by `wordbase-rebuild.path`. ASC app-sync on prod needs a gitignored `.p8` placed on the server manually — `setup.sh` does NOT ship it.

## Architecture: services are the single source of truth

The one invariant that governs almost every change:

```
services/*.service.ts   ← ALL business logic + DB access lives here
        ▲      ▲      ▲
        │      │      │  (thin adapters, no logic)
   routes/*  mcp/tools.ts  mcp/http.ts
   (REST)    (MCP tools)   (MCP over HTTP)
```

- **A capability is added in a service first.** REST routes (`routes/*.ts`) and MCP tools (`mcp/tools.ts`) are input/output adapters that import the same service function. Adding logic in a route or tool instead of a service is the main anti-pattern to avoid — if a behavior should be reachable by both AI and HTTP, it must not live in only one adapter.
- **MCP runs two transports off the same `tools.ts`:** stdio (`mcp/server.ts`, the entry shipped to Claude Desktop) and Streamable HTTP mounted in the Hono app at `POST/GET/DELETE /api/mcp` (`mcp/http.ts`). The HTTP mount is registered *before* the broad `/api` comments router in `app.ts:61` so the exact path wins — keep that ordering.
- **Scope enforcement is real and mirrored.** Every authenticated REST route and every MCP tool checks the calling key's `domain:action` scopes via `hasScope` (`middleware/auth.ts`); a missing scope is 403 (REST) or an error result (MCP). When you add a tool/route, wire its scope in both the route and the `tools.ts` scope map. The deployed `WORDBASE_API_KEY` must be scoped `["*"]` or it 403s after a scope change.

### Non-obvious gotchas

- **`web build` needs the API running.** Astro fetches content from `http://localhost:4100` (override `API_URL`) at build time (`packages/web/src/lib/api.ts`). `pnpm build` builds api before web, but a standalone `pnpm --filter web build` will produce an empty site if the API isn't up. Comments load client-side at runtime; everything else is baked at build time.
- **One `.env`, at the repo root, loaded by `env.ts`.** `env.ts` reads `<repo-root>/.env` (anchored via `paths.ts`/`REPO_ROOT`, cwd-independent) and never overrides vars already in `process.env` (so systemd's `EnvironmentFile` wins on prod). It must be imported *first*, before any module that reads `process.env` at load time (e.g. `db/index.ts`). Do not create `packages/api/.env`.
- **MCP tool input schemas use a plain `{ type, description }` map, converted centrally by `toZodShape` in `tools.ts` — not a raw Zod shape.** Passing a non-Zod object to the SDK's `tool()` silently mis-parses it as `annotations` (this caused a real client crash). Follow the existing descriptor pattern; don't hand-roll Zod at the call site.
- **App `description`, `screenshots`, and `icon` are App-Store-synced, not editable.** `app_update` (and the REST equivalent) only touch editorial fields (tagline/features/accentColor/links/sortOrder/status/meta). Editing the synced fields gets reverted on the next `app_sync`. `ASC_*` env vars + the `.p8` are only needed for `app_discover`/`app_sync`; blog/podcast/pages work without them.
- **Podcast download counting depends on `<audio preload="none">`.** Downloads/subscribers are inferred from `/download` redirect hits + feed polls; if the audio element ever preloads, page loads inflate download counts.

### Conventions

- IDs: `nanoid` (not autoincrement, not UUID). Timestamps: **Unix seconds**, not ms.
- Content stored as raw Markdown, rendered at build/display time.
- Error shape: `{ error: { code, message } }`.
- Every Hono router is `new Hono<AppEnv>()` (auth typing). Public endpoints (pageview, comment submit, published reads) need no auth; everything else is Bearer + scope.
- TS is ESM with `.js` import specifiers (e.g. `import { x } from './services/post.service.js'`) even though sources are `.ts` — match this or the build breaks.

## Where things live

`packages/api/src/`: `services/` (logic), `routes/` (REST), `mcp/` (tools.ts + stdio server.ts + http.ts), `middleware/` (auth, error, metrics, redirect), `db/` (Drizzle schema + migrate), `cli/` (key management), `lib/safe-fetch.ts` (SSRF-guarded fetch for ASC/feed imports). Tests in `packages/api/src/__tests__/`.

`packages/web/src/`: `pages/` (SSG routes incl. `admin/`, `apps/`, `podcast.astro`, `writing/`), `lib/` (per-section data loaders — `home.ts`, `app.ts`, `podcast.ts`, `writing.ts`, `article.ts` — each unit-tested), `components/`, `layouts/`.

`scripts/`: one-off + build utilities (`migrate.ts` WordPress import, `podcast-ingest.mjs` idempotent episode ingest, `generate-mcp-catalog.mts` regenerates `MCP-TOOLS.md`, changelog/bump helpers). `deploy/`: systemd units + Caddy config + `setup.sh`.
