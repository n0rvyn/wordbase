---
type: plan
phase: 8
project: norvyn.com Frontend Redesign (backend/MCP)
dev_guide: docs/06-plans/2026-05-30-frontend-redesign-dev-guide.md
created: 2026-05-31
contract_version: 1
---

# Phase 8 Plan — Reverse integration: app content MCP

**Project health:** yellow (pre-existing, non-blocking). Backend only (packages/api).

**Goal:** Expose MCP tools so Claude Code (inside an app's repo) can manage that app's WordBase presence: `app_update` (edit display info) + `page_*` (author/manage companion pages) + `app_discover` (pull ASC app list). Extend the EXISTING MCP server. WordBase must NOT write back to ASC (already true — preserve).

**Key findings grounding this plan:**
- MCP server already exists (`src/mcp/server.ts`, stdio + WORDBASE_API_KEY bcrypt-validated at startup) with 30 tools registered in `src/mcp/tools.ts` via `server.tool(name, desc, jsonSchemaObj, async (args)=>({content:[{type:'text',text:...}]}))`. **No zod** — plain JSON-schema objects.
- Existing app tools: app_create/list/publish/sync/sync_all. **Missing: app_update, page_*, app_discover.** `pageService` is NOT yet imported in tools.ts.
- `pageService` (page.service.ts): listPages/getPage/createPage/updatePage/deletePage — **no publishPage**. Pages are FLAT (no app_id), rendered at web `/[slug]`.
- `appService.updateApp(id, data)` exists (accepts editorial + ASC fields); `publishApp` sets status only (NO build trigger); `discoverApps()` exists (idempotent draft creation, ASC read-only).
- Build is a SEPARATE explicit step: a build-trigger tool (`blog_trigger_build` → `buildService`) rebuilds the whole SSG site. Mutation tools do not auto-build.
- ASC: `asc.service.ts` is GET-only; no PATCH/POST to api.appstoreconnect.apple.com. No-writeback already satisfied.

## Decisions

- **[D-001]** EXTEND the existing MCP server — add tools to `src/mcp/tools.ts`, register in `registerTools()`. No new server/transport/auth (reuse WORDBASE_API_KEY).
- **[D-002]** Companion pages stay FLAT (user-confirmed) with a `<app-slug>-<type>` slug convention (e.g. `delphi-privacy`). `page_create` takes an OPTIONAL `app` arg → stamps `meta.appId` (JSON) so the app↔page association DATA exists now; a future `app_id` column + `/apps/:slug/privacy` nesting becomes a non-breaking backfill. No schema/route changes this phase.
- **[D-003]** Publish tools are mutate-only, mirroring existing `app_publish` (NO auto-build) — consistent with the established "mutate + explicit build-trigger tool" convention. Add `publishPage(id)` to page.service mirroring `publishApp` (set status='published' + updatedAt; pages have no publishedAt column). Rendering at the public URL is completed by the existing build-trigger tool (verification runs a build).
- **[D-004]** (revised per user decision 2026-05-31 — DP-001=A "跟 App Store 一致") `app_update` exposes ONLY the **sync-SAFE editorial fields**: `name, slug, tagline, accentColor, features, links, sortOrder, status, meta`. It does NOT expose: (a) ASC-synced read-only fields (appStoreId, bundleId, platform, rating, ratingCount, category, version, subtitle, whatsNew, price, dates), AND (b) **description, screenshots, icon** — these LOOK editorial but `app-sync.service.ts:51-74` overwrites them iTunes/ASC-first (editorial value is only the last fallback), so editing them via MCP would be silently reverted on the next `app_sync`. User chose to keep the website's description/screenshots/icon mirroring the App Store (no per-field override mechanism this phase). This is narrower than the dev-guide's literal "edit description/screenshots" wording — documented, user-authorized scope reduction (NOT a silent downgrade).
- **[D-005]** Include `app_discover` (wraps `discoverApps()`) — dev-guide lists it optional; small, completes the reverse-integration story (CC can pull the ASC app list). Discovery creates DRAFTS only (no auto-sync/publish — editorial control preserved).

## Impact Map

| Change | File | Blast radius |
|---|---|---|
| `publishPage()` | `src/services/page.service.ts` | New export; consumed by page_publish tool + (optionally) a route later. Additive. |
| 8 new MCP tools | `src/mcp/tools.ts` | Adds `import * as pageService`; registers app_update, app_discover, page_{list,get,create,update,delete,publish}. Pure additions to `registerTools()` — existing 30 tools untouched. |
| Tests | `src/__tests__/mcp.tools.test.ts` | Extends existing registration-assert suite. |

---

## Task 1 — page.service.ts: add publishPage()

**Files:** `packages/api/src/services/page.service.ts`

**Task Contract:**
- Precondition: page.service has list/get/create/update/delete, no publish; pages schema has status (no publishedAt).
- Postcondition: `export async function publishPage(id)` sets `status='published'` + `updatedAt`, returns the row or null (mirrors `publishApp` shape, minus publishedAt which pages lack). tsc clean.

**Steps:**
1. Add `publishPage(id: string)` mirroring `appService.publishApp` but only `{ status: 'published', updatedAt: now }` (no publishedAt — not in pages schema). Return `page || null`.

**Verify:** `cd packages/api && npx tsc --noEmit` → 0 errors.

## Task 2 — mcp/tools.ts: page_* tools (list/get/create/update/delete/publish)

**Files:** `packages/api/src/mcp/tools.ts`

**Task Contract:**
- Precondition: no page_* tools; pageService not imported.
- Postcondition: `import * as pageService from '../services/page.service.js'` added; 6 page tools registered in `registerTools()` matching the existing `server.tool(name, desc, schemaObj, async(args)=>...)` + `{content:[{type:'text' as const, text: JSON.stringify(x,null,2)}]}` (and `isError:true` on not-found) convention. tsc clean.

**Steps (match app_create/app_publish style exactly — read them first):**
1. `page_list` — desc "List all WordBase pages (companion pages: privacy/terms/help/...)"; no args; → `pageService.listPages()`.
2. `page_get` — `{ idOrSlug }`; → `pageService.getPage(idOrSlug)`; not-found → isError.
3. `page_create` — `{ title, content, slug?, sortOrder?, status?, meta?, app? }`. If `app` given: set `slug = slug ?? \`${app}-<derived>\`` is NOT auto (let caller pass slug); but DO stamp association: merge `{ appId: app }` into the meta JSON (parse existing meta or {}, add appId, stringify) — [D-002]. Suggest the `<app>-<type>` convention in the tool description. → `pageService.createPage(...)`.
4. `page_update` — `{ id, title?, slug?, content?, sortOrder?, status?, meta? }`; → `pageService.updatePage(id, ...)`; not-found → isError.
5. `page_delete` — `{ id }`; → `pageService.deletePage(id)`; not-found → isError.
6. `page_publish` — `{ id }`; → `pageService.publishPage(id)`; not-found → isError. Description notes: run the build-trigger tool afterward to render it at its public URL ([D-003]).

**Verify:** `npx tsc --noEmit` 0; `grep -c "page_" src/mcp/tools.ts` ≥ 6 tool registrations.

## Task 3 — mcp/tools.ts: app_update + app_discover tools

**Files:** `packages/api/src/mcp/tools.ts`

**Task Contract:**
- Precondition: app tools = create/list/publish/sync/sync_all only.
- Postcondition: `app_update` (editorial fields only, [D-004]) + `app_discover` registered, matching convention. tsc clean.

**Steps:**
1. `app_update` — desc "Update an app's editorial display info (tagline/features/accentColor/links/sortOrder/status/...). NOTE: description, screenshots, and icon are managed by app_sync (synced from the App Store) and are NOT editable here — editing them would be reverted on the next sync." Schema = `{ id, name?, slug?, tagline?, accentColor?, features?, links?, sortOrder?, status?, meta? }` ([D-004] sync-safe set — NO description/screenshots/icon, NO appStoreId/bundleId/platform/rating/ratingCount/category/version/price/dates). Handler → `appService.updateApp(id, {mapped sync-safe fields only})`; not-found → isError. The handler must pass ONLY these fields even if the args object somehow carries others. Note in desc: after editing, run the build-trigger tool to render on /apps/:slug.
2. `app_discover` — desc "Discover apps from App Store Connect and create draft rows for new ones (idempotent; no sync, no publish, no ASC writeback)." No args. Handler → `appService.discoverApps()`; on ASC_NOT_CONFIGURED error → `{content:[{type:'text',text:'ASC not configured'}], isError:true}` (try/catch like app_sync).

**Verify:** `npx tsc --noEmit` 0; `grep -E "'app_update'|'app_discover'" src/mcp/tools.ts` → both present.

## Task 4 — Tests: registration + handler behavior for new tools

**Files:** `packages/api/src/__tests__/mcp.tools.test.ts`

**Task Contract:**
- Precondition: existing test validates tool registration by name via a mock server.
- Postcondition: new falsifiable tests — (a) all 8 new tools registered; (b) handler behavior for the risky mappings. vitest green.

**Steps:**
0. **New harness (the existing mock at mcp.tools.test.ts:7-16 DISCARDS handlers — `_handler` is ignored, only names kept; it physically cannot test behavior).** Add a second fake server that captures `name → handler` into a Map (and the schema), so a test can look up a tool by name, `await handler(args)`, and assert the result/`isError`. `vi.mock('../services/app.service.js')` + `vi.mock('../services/page.service.js')` to stub `updateApp`/`publishPage`/`createPage`/`discoverApps` and spy on the args they receive. Keep the existing name-registration tests untouched.
1. Registration: assert the captured-handler server received `page_list/page_get/page_create/page_update/page_delete/page_publish/app_update/app_discover`.
2. Handler behavior (via the new harness + mocked services):
   - `app_update` handler calls `appService.updateApp` with the sync-safe fields AND DROPS `description`/`screenshots`/`icon`/`appStoreId`/`rating` even when present in args (falsifiable — a naive `updateApp(id, args)` passthrough would forward them and FAIL this; guards [D-004] — these are sync-owned).
   - `page_create` with `app:'delphi'` produces a `meta` containing `appId:'delphi'` passed to `createPage` (falsifiable — guards [D-002] stamping).
   - `page_publish` handler calls `pageService.publishPage` (not updatePage) and returns isError when service returns null.
3. Keep existing tests intact.

**Verify:** `cd packages/api && npx vitest run src/__tests__/mcp.tools.test.ts` → all pass; then full `npx vitest run`.

## Task 5 — Verify: ASC no-writeback + build + stdio callability

**Files:** none (verification task)

**Task Contract:**
- Postcondition: ASC writeback absent; api builds; MCP tools callable via stdio with an API key (or registration-verified + documented if no key available).

**Steps:**
1. **ASC no-writeback (AC):** `grep -rnE "appstoreconnect\.apple\.com" packages/api/src` and confirm every call site is GET (no method:'POST'/'PUT'/'PATCH' to ASC). Report evidence.
2. **Build:** `cd packages/api && npm run build` → 0 errors (tsc).
3. **stdio callability (AC):** mint a plaintext key via the existing CLI — `npm run cli key:create "phase8-smoke" pages:write apps:write` (see src/cli/index.ts:8 → keys.ts generateKey). Then `WORDBASE_API_KEY=<key> npm run mcp`, send an MCP `initialize` + `tools/list` over stdin, and confirm the 8 new tools appear; then call `page_list` and confirm a valid content response. (CLI key minting is confirmed available — do NOT defer this; the AC is achievable.)

**Verify:** ASC grep = GET-only; `npm run build` 0 errors; stdio tools/list shows new tools OR documented fallback.

---

## Phase-level acceptance (dev-guide Phase 8)

- [ ] `app_update` updates features/tagline; renders on /apps/:slug after rebuild. → Task 3 + verify (update Delphi tagline → build → curl /apps/delphi → changed).
- [ ] `page_create`/`page_publish` create a companion page that renders at its public URL. → Task 2 + verify (create+publish a page → build → curl /<slug> → renders).
- [ ] No ASC writeback anywhere. → Task 5 grep (GET-only).
- [ ] Build verify; MCP tools callable via stdio with API key. → Task 5.

## Test strategy

- **Unit (vitest):** Task 4 — registration of all 8 + falsifiable handler tests (editorial-only field guard, meta.appId stamping, publishPage call). Mirror existing mcp.tools.test mock pattern.
- **tsc:** every task gated on `npx tsc --noEmit` 0.
- **Integration:** ASC-writeback grep; api build; stdio tools/list smoke (key-permitting) — the end-to-end "renders after rebuild" check uses the build-trigger + web build + curl, since publish tools are mutate-only [D-003].
- **No frontend changes** — web build only re-run to confirm app_update/page_publish content renders (consumes existing /apps/[slug] + /[slug] templates from Phases 4 & 7).
