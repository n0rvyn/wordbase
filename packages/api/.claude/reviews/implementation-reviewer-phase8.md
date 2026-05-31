## Implementation Review Summary
**Status:** complete
**Plan:** docs/06-plans/2026-05-31-phase8-mcp-plan.md
**Dev-guide:** docs/06-plans/2026-05-30-frontend-redesign-dev-guide.md (Phase 8, lines 299-315)
**Started:** 2026-05-31-161633
**Scope:** Phase 8 backend/MCP — Tasks 1-5 (page.service.publishPage, 8 MCP tools, tests, verification ACs)

---

## Part 1: Plan-vs-Code Verification

### Task 1 — page.service.ts: publishPage()

`publishPage(id)` at `page.service.ts:64-72` sets `{ status: 'published', updatedAt: now }` only, returns `page || null`. Matches postcondition exactly: NO `publishedAt` (pages schema lacks it — contrast `appService.publishApp` at `app.service.ts:173` which DOES set publishedAt). Mirror shape correct.

- ✅ [C:100] publishPage sets status+updatedAt only, returns row|null. Evidence: page.service.ts:64-72; cross-checked vs publishApp app.service.ts:169-177 (pages correctly omit publishedAt).

### Task 2 — page_* tools (6)

All six registered with explicit field-mapping matching the `server.tool(name, desc, schemaObj, async(args)=>({content:[{type:'text' as const, text}], isError?}))` convention. No zod (plain JSON-schema objects).

- ✅ [C:100] page_list (tools.ts:632-640) — no args → listPages(); content response.
- ✅ [C:100] page_get (642-655) — {idOrSlug} → getPage(); not-found → isError. Matches.
- ✅ [C:100] page_create (657-686) — see [D-002] finding below. meta.appId stamp present.
- ✅ [C:100] page_update (688-714) — explicit field map (title/slug/content/sortOrder/status/meta); not-found → isError.
- ✅ [C:100] page_delete (716-729) — {id} → deletePage(); not-found → isError.
- ✅ [C:100] page_publish (731-744) — {id} → publishPage() (NOT updatePage); not-found → isError. Desc notes build-trigger needed. Matches [D-003].
- ✅ [C:100] `import * as pageService from '../services/page.service.js'` at tools.ts:11.
- `grep -c "page_" → 8` matches (6 registrations + helper refs). Verify clause satisfied.

### Task 3 — app_update + app_discover

- ✅ [C:100] **app_update [D-004] sync-clobber guard** — handler at tools.ts:566-577 uses EXPLICIT field-mapping (not args spread). Forwards ONLY: name, slug, tagline, accentColor, features, links, sortOrder, status, meta. description/screenshots/icon/appStoreId/rating are NOT referenced in the handler body → never forwarded. Schema (554-565) exposes only the 9 sync-safe fields. See cross-check below.
- ✅ [C:100] app_discover (585-601) — no args → discoverApps(); try/catch maps `ASC_NOT_CONFIGURED` → `{text:'ASC not configured', isError:true}`. Error string verified: `listAscApps` throws `'ASC_NOT_CONFIGURED'` (asc.service.ts:180), handler checks `message.includes('ASC_NOT_CONFIGURED')` (tools.ts:595) → matches. Generic failures → `Discovery failed: {msg}` isError.

**[D-004] cross-check against app-sync.service.ts (sync-owned fields):**
The sync `set` object (app-sync.service.ts:56-78) writes: rating, ratingCount, subtitle, whatsNew, category, version, screenshots, releaseDate, currentVersionReleaseDate, minimumOsVersion, price, icon, description. NONE of app_update's 9 exposed fields (name/slug/tagline/accentColor/features/links/sortOrder/status/meta) appear in that set. The split is correct — no field app_update writes is clobbered by sync, and every field sync owns is excluded from app_update. Clean separation.

**Defense-depth note (non-blocking):** `appService.updateApp` (app.service.ts:131-162) is itself an allowlist that WOULD persist description/screenshots/icon/appStoreId/rating IF passed. The MCP guard is therefore single-layered at the handler. This is exactly why the falsifiable test (below) is load-bearing — a handler regression to `updateApp(id, args)` passthrough would silently re-enable sync-clobber. Test covers it.

### Task 4 — Tests (registration + falsifiable behavior)

New `buildCapturingServer()` (test:21-36) captures name→handler in a Map, exposes getHandler/getNames. Services mocked via `vi.mock('../services/app.service.js')` + `vi.mock('../services/page.service.js')` (test:39-56). Existing `buildFakeServer` name-only harness kept intact (test:5-16).

- ✅ [C:100] Registration: all 8 asserted (test:152-164).
- ✅ [C:100] **Falsifiable test 1 — app_update drops sync-owned fields** (test:176-205). Passes description/screenshots/icon/appStoreId/rating in args, asserts `passedData` does NOT have those properties. A naive `updateApp(id, args)` passthrough WOULD forward them → `expect(passedData).not.toHaveProperty('description')` (line 200) FAILS. Genuine, not a shell.
- ✅ [C:100] **Falsifiable test 2 — page_create stamps meta.appId** (test:207-222). Asserts `JSON.parse(passedData.meta).appId === 'delphi'`. A no-stamp impl leaves meta undefined → `JSON.parse(undefined)` throws in-test → FAILS. Genuine.
- ✅ [C:100] **Falsifiable test 3 — page_publish calls publishPage not updatePage** (test:224-233). Asserts `publishPage` called once, `updatePage` NOT called, isError on null. A `updatePage`-based impl → `publishPage` 0 calls → FAILS. Genuine.

### Task 5 — Verification ACs

- ✅ [C:100] **ASC no-writeback** — single ASC URL ref `ASC_BASE` (asc.service.ts:86); `ascFetch` (asc.service.ts:88-99) uses default method (GET), no body, no method override. `grep -rnE "method:\s*['\"](POST|PUT|PATCH|DELETE)"` against asc.service → 0 hits. No writeback to api.appstoreconnect.apple.com anywhere in src. AC 314 MET.
- ✅ [C:90] Build/tsc green (vitest 86/86, tsc 0) per dispatcher; not re-run per instruction.
- ⚠️ [C:85] **stdio callability (AC 315) — UNVERIFIED.** No Phase 8 entry in execution-report.md; registration tests prove only the registration layer, not the stdio transport + WORDBASE_API_KEY auth path. Plan Task 5 step 3 said "do NOT defer this." Residual risk LOW: the 8 tools use the identical `server.tool` shape as 30 already-working tools over the same stdio transport. Not forced here due to hang risk + DB side-effect of key minting. See Decisions DP-001.

---

## Part 2: Design Fidelity (dev-guide Phase 8)

- [A - Spec Value] dev-guide:312 "app_update updates features/tagline, renders on /apps/:slug" — ✅ both fields forwarded (tools.ts:558,560). Rendering completed by separate build-trigger [D-003].
- [A - Spec Value] dev-guide:313 "page_create/page_publish create page rendering at URL" — ✅ tools create+publish; web `/[slug]` filters status==='published' so publish makes it live after build.
- [C - Old Code] dev-guide:314 "no PATCH/POST to ASC" — ✅ confirmed GET-only.
- [D - Not Built] app_discover — ✅ built (optional per dev-guide, [D-005]).
- [E - Quality] dev-guide:305 literal wording "edit ... description/screenshots" — ✅ AUTHORIZED scope reduction. User decision DP-001=A (plan [D-004]) keeps description/screenshots/icon sync-owned. The dev-guide AC at line 312 only requires features/tagline to render (which IS met); line 305 is prose, not an AC. Exclusion is documented + user-authorized, NOT a silent downgrade. Reasoning confirmed.

---

## Findings (C >= 80, main)

### F-1 [C:85] page_create: unguarded JSON.parse on malformed meta (non-blocking)
**Location:** tools.ts:670-674
**Issue:** When BOTH `app` and a malformed `meta` string are passed, `JSON.parse(metaStr)` (line 672) throws an unguarded exception. Every other page/app handler returns a clean `isError` response on bad input; this path throws instead — a convention inconsistency. The null/undefined case IS handled (the `metaStr ?` ternary → `{}`), so scrutiny-point-4's "no throw on null/garbage" holds for null but NOT for malformed-string garbage.
**Coverage gap:** The meta-present branch is UNTESTED — test:207-215 passes `app:'delphi'` with NO `meta`, exercising only the `{}` branch. The one risky line is both unguarded and uncovered.
**Fix rec:** Wrap in try/catch → on parse failure return `{content:[{type:'text' as const, text:'Invalid meta JSON'}], isError:true}` (mirrors the not-found pattern used elsewhere). Add a test passing `app` + malformed `meta` asserting isError.
**Severity:** non-blocking — core contract (stamp appId when meta absent/valid) holds; only the rare malformed-meta + app combination regresses to a thrown exception instead of a clean error.

---

## Test-Fidelity Audit
Test-Fidelity Audit: no split task pairs in plan; skipped.
(Plan uses Task 1..5 flat numbering, not `### Task N-tests`/`### Task N-impl`.)

---

## Reverse Regression Reasoning

[Reverse Reasoning] Hypothetical regression: CC edits a published app's description via app_update expecting it to stick, but next app_sync reverts it.
User action: app_update {id, description:'...'}
Code path: tools.ts:566 (handler) → description NOT in mapped fields → never reaches updateApp → no DB write of description.
Covered by forward check: ✅ section Task 3 + Task 4 test 1. The guard makes this a no-op (description silently ignored), which is the INTENDED behavior per [D-004] — the tool description (tools.ts:553) warns the user. No regression; working as designed.

[Reverse Reasoning] Hypothetical regression: page_publish makes a page live but it doesn't render.
User action: page_publish then expect live page.
Code path: publishPage sets status='published' → web `/[slug]` filters status==='published' → renders ONLY after build-trigger runs.
Covered by forward check: ✅ [D-003] — mutate-only by design; build is explicit. Tool desc (tools.ts:733) instructs running build-trigger. Not a gap.

---

## Rules Audit

[R6 Audit] Completion claims: build/tests green claimed by dispatcher (86/86, tsc 0) — accepted per instruction not to re-run. stdio AC: ⚠️ unverified (flagged, not claimed done).

[R9 Audit] Files edited: 3 — all plan-specified (page.service.ts, tools.ts, mcp.tools.test.ts). 0 unplanned. Git status confirms only these 3 api files modified (uncommitted, consistent with in-progress Phase 8). No pre-existing unplanned edits in scope files.

[Decision Audit] View/UI modifications: 0 (backend-only phase). N/A.

### Pre-existing Issues
None found in the three Phase 8 files. (Repo-wide uncommitted state from prior phases exists but is outside this phase's file scope.)

---

## Decisions

### [DP-001] stdio callability AC unverified (recommended)

**Gap:** Plan AC 315 + Task 5 step 3 require proving the 8 tools are callable via stdio with an API key ("do NOT defer this"). Code review proves registration only; the stdio transport + WORDBASE_API_KEY auth path was not exercised this phase (no execution-report entry). Impact: low — same transport/shape as 30 working tools.

**Options:**

| | A: Accept registration-proven + low-risk rationale | B: Run stdio smoke now |
|---|---|---|
| Behavior | Tools assumed callable (identical shape to 30 working tools) | Empirically confirmed tools/list shows 8 + page_list responds |
| Implementation | 0 (document residual risk) | Mint key via CLI + pipe JSON-RPC over stdin; ~10 min |
| Risk | Transport-layer regression (unlikely) ships unconfirmed | FRONTBOARD-style hang risk on spawn; DB side-effect from key minting |

**Recommendation:** A — `tools.ts` registers all 8 via the identical `server.tool(...)` call used by 30 tools already shipping over the same stdio server (`src/mcp/server.ts`); a transport regression would break all 38, not just the new 8, so registration-equivalence is strong structural evidence. If a non-hanging `tools/list` is trivial in this env, B closes it cleanly.

---

## Verdict

❌→ effectively PASS with 1 non-blocking finding + 1 unverified-AC. No blocking gaps.

- **Plan-vs-Code:** 0 critical, 1 standard finding (F-1, C:85, non-blocking). All Task 1-4 postconditions met.
- **[D-004] sync-clobber guard:** ✅ CONFIRMED SOLID. Explicit 9-field allowlist (tools.ts:566-577), no args spread; cross-checked against app-sync `set` (none of the 9 are sync-written; all 13 sync-owned fields excluded). The split is correct.
- **Test falsifiability:** ✅ CONFIRMED. New buildCapturingServer harness genuinely captures+awaits handlers with mocked services. All 3 behavior tests would FAIL a naive impl (passthrough → toHaveProperty('description'); updatePage → 0 publishPage calls; no-stamp → JSON.parse(undefined) throws). Not shells.
- **No-ASC-writeback:** ✅ GET-only confirmed (asc.service.ts:86-99, 0 write methods).
- **Design fidelity:** description/screenshots/icon exclusion is authorized (DP-001=A / [D-004]), not a gap.

### Low-Confidence Appendix (C < 80)
None.
