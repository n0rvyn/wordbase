---
name: mcp-tools-patterns
description: WordBase packages/api MCP server conventions + sync-clobber field-split trap to check when reviewing app_* / page_* tools
metadata:
  type: project
---

WordBase MCP tools live in `src/mcp/tools.ts`, all registered in `registerTools(server)` via
`server.tool(name, desc, jsonSchemaObj, async(args)=>({content:[{type:'text' as const, text}], isError?}))`.
**No zod** — plain JSON-schema objects. not-found → `{text:'X not found', isError:true}`.

**Why this matters for review:**
- **Sync-clobber field-split trap:** `app-sync.service.ts` `set` object (~line 56-78) OVERWRITES description, screenshots, icon, rating, ratingCount, category, version, price, subtitle, whatsNew, dates from iTunes/ASC on every sync. `app_update` MCP tool must NOT expose/forward those (editing them = silent revert-on-sync). The guard is the HANDLER's explicit field-mapping — `appService.updateApp` itself is an allowlist that WOULD persist them if passed, so the defense is single-layered at the MCP handler. Always: (1) confirm handler uses explicit field-map not `updateApp(id, args)` spread; (2) cross-check the exposed field set against the sync `set` object; (3) confirm a falsifiable test passes sync-owned fields and asserts they're dropped.
- **Mutate-only publish convention:** publish tools (app_publish/page_publish) set status only, NO auto-build. Rendering needs the separate `blog_trigger_build` tool. `page_publish` → `publishPage` (status+updatedAt, no publishedAt — pages schema lacks it); `app_publish` → `publishApp` (adds publishedAt). Don't flag missing build as a gap.
- **Test harness:** the ORIGINAL mock `buildFakeServer` discards handlers (names only) — cannot test behavior. Behavior tests need a `buildCapturingServer` that captures name→handler Map + `vi.mock` the services. When reviewing new MCP tool tests, verify the capturing harness exists and tests await handlers with mocked services.
- **page_create [D-002]:** stamps `meta.appId` when optional `app` arg passed (flat pages, no app_id column yet). Watch: `JSON.parse(metaStr)` is unguarded — throws on malformed meta+app combo (other handlers return clean isError). Check this edge + whether the meta-present branch is tested.
- **ASC is GET-only:** `asc.service.ts` `ascFetch` (~line 88) uses default GET, single `ASC_BASE` ref. No-writeback AC = grep for POST/PUT/PATCH methods → expect 0.

Plan/dev-guide nuance: dev-guide Phase 8 prose says app_update edits description/screenshots, but user DP-001=A authorized keeping those sync-owned. Exclusion is correct, not a gap — check the plan's [D-004] before flagging.
