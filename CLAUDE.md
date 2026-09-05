# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **新会话第一件事：读 `docs/06-plans/HANDOFF-2026-09-05-2243.md`** — MCP 标准化升级 14/14 完成但**全部未提交**（25 个 dirty 文件），审查留下 2 条必修未修，且有 4 项只能由用户裁决（含 commit 切分与插件发版）。历史交接见 `docs/06-plans/HANDOFF-*.md`。

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
- **Scope enforcement is real and mirrored, but the two adapters deny differently.** Every authenticated REST route and every MCP tool checks the calling key's `domain:action` scopes via `hasScope` (`middleware/auth.ts`). REST returns **403**. MCP does *not* return an error — the tool is **never registered** for that session (`tools.ts`: `if (!hasScope(permissions, scope)) return;`), so it is simply absent from `tools/list` and the key's tool list shrinks to what it can actually use. A tool name with no `TOOL_SCOPES` entry **throws at registration** (process won't start), so a missing entry fails loudly rather than silently granting access. When you add a tool/route, wire its scope in both the route and the `tools.ts` scope map. The deployed `WORDBASE_API_KEY` must be scoped `["*"]` or it 403s after a scope change.

### Non-obvious gotchas

- **`web build` needs the API running.** Astro fetches content from `http://localhost:4100` (override `API_URL`) at build time (`packages/web/src/lib/api.ts`). `pnpm build` builds api before web, but a standalone `pnpm --filter web build` will produce an empty site if the API isn't up. Comments load client-side at runtime; everything else is baked at build time.
- **One `.env`, at the repo root, loaded by `env.ts`.** `env.ts` reads `<repo-root>/.env` (anchored via `paths.ts`/`REPO_ROOT`, cwd-independent) and never overrides vars already in `process.env` (so systemd's `EnvironmentFile` wins on prod). It must be imported *first*, before any module that reads `process.env` at load time (e.g. `db/index.ts`). Do not create `packages/api/.env`.
- **MCP tool input schemas are a `PropDescriptor` map (`mcp/schema.ts`, supports `required`/`enum`/`boolean`/`array`/`object`), compiled to Zod centrally by `buildInputSchema` — not a raw Zod shape.** Tools register via `registerTool`; `title` and `annotations` (`readOnlyHint`/`destructiveHint`/`openWorldHint`) are the 5th argument to `server.tool(...)` in `tools.ts`. Historical reason this exists at all: passing a non-Zod object straight to the SDK's old `tool()` silently mis-parsed it as `annotations` (caused a real client crash). Follow the existing descriptor pattern; don't hand-roll Zod at the call site.
- **App `description`, `screenshots`, and `icon` are App-Store-synced, not editable.** `app_update` (and the REST equivalent) only touch editorial fields (tagline/features/accentColor/links/sortOrder/status/meta). Editing the synced fields gets reverted on the next `app_sync`. `ASC_*` env vars + the `.p8` are only needed for `app_discover`/`app_sync`; blog/podcast/pages work without them.
- **Podcast download counting depends on `<audio preload="none">`.** Downloads/subscribers are inferred from `/download` redirect hits + feed polls; if the audio element ever preloads, page loads inflate download counts.

### Conventions

- IDs: `nanoid` (not autoincrement, not UUID). Timestamps: **Unix seconds**, not ms.
- Content stored as raw Markdown, rendered at build/display time.
- Error shape: `{ error: { code, message } }`.
- Every Hono router is `new Hono<AppEnv>()` (auth typing). Public endpoints (pageview, comment submit, published reads) need no auth; everything else is Bearer + scope.
- TS is ESM with `.js` import specifiers (e.g. `import { x } from './services/post.service.js'`) even though sources are `.ts` — match this or the build breaks.
- **前端改动必须兼顾手机小屏（验收到 ≤480px）**：改 `packages/web` 的页面 / 组件 / 布局时，必须在窄视口验证不横向溢出、不裁切控件、不破版，不能只在桌面宽度验收。尤其**新增 nav / 工具栏控件**（语言钮、主题钮等）后要检查 `.nav-r` 一类横向 flex 容器在小屏是否溢出；新控件必须纳入 `BaseLayout` 现有响应式断点（`@media max-width:880px / 560px`）的处理，而不是只在宽屏堆叠。

## API key —— 别再问用户要，就在这儿

**生产 key 在环境变量 `$WORDBASE_API_KEY` 里，已经导好了，直接用。**

```bash
echo "${WORDBASE_API_KEY:0:8}"          # wb_… 前 8 位就是 keyPrefix
```

- 远端 MCP 端点：`https://norvyn.com/api/mcp`（Streamable HTTP，见 `packages/api/src/mcp/http.ts`）
- 挂进 Claude Code：
  ```bash
  claude mcp add --transport http --scope local wordbase https://norvyn.com/api/mcp \
    --header "Authorization: Bearer $WORDBASE_API_KEY"
  ```
- `plugins/wordbase/.mcp.json` 里写的是 `${WORDBASE_API_KEY}`，**是环境变量引用不是字面量**——
  照抄那个文件不会得到 key，要从环境取。

⛔ **`.env` 里的 `WORDBASE_API_KEY` 是过期的**（2026-08-13 实测：`.env` 那把 `wb_qSkkT…`
打生产返回 **401**，环境变量里那把 `wb_5Cx73…` 返回 **200**）。
两个本地 `data/*.db` 都是 4096 字节、零张表，所以 `.env` 那把也不是本地签的，就是旧的。
**判据只有一个：拿真端点试。** 别靠比对，别靠猜：

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://norvyn.com/api/mcp \
  -H "Authorization: Bearer $WORDBASE_API_KEY" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
# 200 = 可用；401 = 这把不行，换一把再试，不要问用户
```

要新签一把（只有旧的全失效时才需要）：服务器上 `pnpm --filter api cli key:create <name>`，打印一次。

⛔ **key 的值永远不写进本文件**——CLAUDE.md 进版本库。这里只记它在哪。

## Where things live

`packages/api/src/`: `services/` (logic), `routes/` (REST), `mcp/` (tools.ts + stdio server.ts + http.ts), `middleware/` (auth, error, metrics, redirect), `db/` (Drizzle schema + migrate), `cli/` (key management), `lib/safe-fetch.ts` (SSRF-guarded fetch for ASC/feed imports). Tests in `packages/api/src/__tests__/`.

`packages/web/src/`: `pages/` (SSG routes incl. `admin/`, `apps/`, `podcast.astro`, `writing/`), `lib/` (per-section data loaders — `home.ts`, `app.ts`, `podcast.ts`, `writing.ts`, `article.ts` — each unit-tested), `components/`, `layouts/`.

`scripts/`: one-off + build utilities (`migrate.ts` WordPress import, `podcast-ingest.mjs` idempotent episode ingest, `generate-mcp-catalog.mts` regenerates `MCP-TOOLS.md`, changelog/bump helpers). `deploy/`: systemd units + Caddy config + `setup.sh`.
