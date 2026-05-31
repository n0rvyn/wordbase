## Plan Verification Summary
**Status:** complete
**Plan:** docs/06-plans/2026-05-31-phase8-mcp-plan.md
**Verdict:** MUST-REVISE
**Generated:** 2026-05-31-155840

Plan type: 架构变更 (new MCP tools + service fn) + 功能开发. Strategies run: S1, S2, T1, AR. Contract v1 structural check applied.

---

### Contract v1 structural check (advisory)

Plan is `contract_version: 1`. My spec expects per-task `Expected outcome` / `Touched surface` / `Regression shield` / `Real path verify`. The plan substitutes `Task Contract` (Precondition/Postcondition) + a plan-level `## Impact Map` + per-task `Verify`. Judgment: **functionally satisfied, format deviation logged as advisory** — Impact Map covers touched surface + blast radius, Task 5 is the plan-level real-path verify (ASC grep + build + stdio smoke), and "keep existing tests intact" + tsc gates serve as the regression shield. No `**Maps to Impact Map:**` field per task, but that is recommended-not-required at v1. No glossary/CLAUDE-AGENTS conflict triggers. Not a blocker.

---

### S1 — Falsifiable error candidates (5 generated, 2 hold)

**[断言 1] [D-004] Task 3: app_update exposes `icon`/`description`/`screenshots`, all of which app_sync overwrites iTunes/ASC-first — editorial edits get silently clobbered on next sync.**
验证: `app-sync.service.ts:50-74` merge `set`. screenshots = ASC-then-iTunes-then-cur (line 51-54); icon = `itunes?.icon ?? cur.icon` (line 73); description = `itunes?.description ?? cur.description` (line 74). Editorial value (`cur.*`) is only the last-resort fallback. D-004 editorial list (plan line 29) includes `icon, description, screenshots`.
结果: ❌ **断言成立 [C:95]** → D-004's field split is wrong for exactly the three fields its own rationale ("letting MCP overwrite them would be clobbered on next sync") is meant to protect. For any app with an `appStoreId`, editing icon/description/screenshots via `app_update` then running `app_sync` reverts them. 计划需修订：见 must-revise #2.

**[断言 2] Task 4 handler tests are unfalsifiable shells because the existing test fake discards the handler.**
验证: `mcp.tools.test.ts:7-16` — fake server is `tool(name, _desc, _schema, _handler) { names.push(name); }`. The handler arg is captured into `_handler` and dropped; only `names` is retained. Task 4 step "read the existing test's mock-server pattern first; reuse it" (plan line 95) instructs the executor to reuse a harness that *physically cannot* invoke handlers.
结果: ❌ **断言成立 [C:95]** → The three falsifiable assertions (app_update drops appStoreId, page_create stamps appId, page_publish calls publishPage — plan lines 98-100) require a NEW harness: capture `(name → handler)` map, `await handler(args)`, and `vi.mock` the service modules to assert spy payloads. As written, a literal "reuse" yields name-only registration tests and the behavior guards never exist. 计划需修订：见 must-revise #1.

**[断言 3] [D-002] page_create stamping `{appId}` into meta JSON throws on malformed caller-supplied meta.**
验证: pages.meta is `text('meta')` JSON string column (schema.ts:87). Plan step (line 66) says "parse existing meta or {}, add appId, stringify". Unguarded `JSON.parse(args.meta)` throws on malformed input.
结果: ✅ **断言不成立 [C:80]** (downgraded to advisory) — this exactly matches the existing `blog_update_post_meta` pattern (`tools.ts:592` `post.meta ? JSON.parse(post.meta) : {}`), which is unguarded too. Consistency-advisory, not a defect. Note: the merge target is the *args*-supplied meta (caller just passed it), not a DB-stored value, so the parse risk is lower than the post-meta case. See advisory A-1.

**[断言 4] page_publish setting status='published' is cosmetic — web renders pages regardless of status, so [D-003] "renders at public URL" is unverifiable.**
验证: web `[slug].astro:9-10` — `getStaticPaths` does `pages.filter((p) => p.status === 'published')`. Draft pages are excluded from the static build.
结果: ✅ **断言不成立 [C:90]** — status IS load-bearing. publishPage→status='published'→build→renders is a real, verifiable chain. [D-003] acceptance criterion is sound. publishPage is a genuinely-new fn: pages route has no publish endpoint, only generic `updatePage` (pages.ts:27).

**[断言 5] Convention mismatch: new tools break tsc or server.tool signature.**
验证: existing tools all use `server.tool(name, desc, plainJsonSchemaObj, async(args)=>({content:[{type:'text' as const, text: JSON.stringify(x,null,2)}], isError?}))`. No zod (tools.ts:13-601). `app_publish` (537-548) and `podcast_publish_show` (367-378) are exact templates for page_publish; `app_sync` try/catch (557-565) is the template for app_discover error handling. `import * as pageService` mirrors the 10 existing service imports (lines 1-10).
结果: ✅ **断言不成立 [C:90]** — convention is correctly specified throughout the plan. No tsc/signature break expected.

---

### S2 — Failure reverse reasoning

**[编译失败推理]** Assumed: Task 1 `publishPage` returns a shape tsc rejects when consumed by page_publish tool. 计划覆盖: ✅ — Task 1 mirrors `publishApp` (app.service.ts:169-177) which returns `app || null`; page_publish tool guards null → isError (matches app_publish). publishApp sets `publishedAt` but pages schema (schema.ts:80-90) has NO publishedAt column; plan explicitly drops it (line 48, 51). Correct.

**[运行时 Regression 推理]** Assumed: app_discover throws uncaught when ASC not configured, crashing the MCP handler. 操作路径: CC calls app_discover → `appService.discoverApps()` → `listAscApps()` throws `ASC_NOT_CONFIGURED` (asc.service.ts:179-181, app.service.ts:186). 计划覆盖: ✅ — plan step (line 83) wraps in try/catch → isError, mirroring app_sync (tools.ts:557-565). Correct.

**[运行时 Regression 推理 2]** Assumed: MCP `page_publish`/`app_update` triggers no build, so content never renders even after publish — inconsistent with HTTP publish route. 操作路径: HTTP `apps.ts:148-152` publish route DOES call `triggerBuild()`; MCP `app_publish` tool (tools.ts:537-548) does NOT. 计划覆盖: ✅ — [D-003] is correct AT THE MCP LAYER (which is what these tools are). The build coupling lives in the HTTP route, not the service; all MCP mutation tools are build-free and rely on the separate `blog_trigger_build` tool. Mirroring app_publish is consistent. Task 5 / phase acceptance correctly use build-trigger + curl to verify rendering.

---

### T1 — Test coverage

| 代码类型 | 有逻辑的 Task | 有测试覆盖 | 类型匹配 |
|---|---|---|---|
| 业务逻辑 (publishPage) | Task 1 | Task 4 (page_publish handler) | ✅ UT (indirect via tool) |
| 业务逻辑 (field guard, meta stamp) | Task 2,3 | Task 4 | ⚠️ harness gap (S1 断言 2) |
| 集成 (stdio callable) | Task 5 | Task 5 smoke | ✅ achievable (see point 6) |

覆盖率: 3/3 logic tasks have a *named* test. 类型匹配: blocked by the harness defect — the intended behavior tests cannot run on the reused name-only fake. → must-revise #1.

---

### AR — Architecture review

- **Entry-point conflict:** none. 8 tools are pure additions to `registerTools()`; existing 30 untouched (Impact Map correct).
- **Auth reality (point 6):** `server.ts:9-15` validateApiKey checks prefix existence + bcrypt only — NO per-tool permission gate. Any minted key authorizes all tools. **A CLI to mint keys exists:** `npm run cli key:create <name>` → `src/cli/keys.ts:8-34` prints a plaintext `wb_...` key. So Task 5's stdio smoke is FULLY achievable; the plan's "documented-deferred if no key" fallback (line 115) is over-pessimistic but not wrong (it offers minting as the primary path). Recommend the plan state minting as the expected path, deferral only if `npm run cli` itself fails.
- **No-writeback (point 3 / AC):** asc.service.ts has zero POST/PUT/PATCH to `api.appstoreconnect.apple.com` — all `ascFetch` calls are GET (asc.service.ts:88-99, default method). Constraint already satisfied; Task 5 grep will confirm.
- **app_publish/build-trigger pattern (point 3):** confirmed established. MCP publish tools mutate-only; HTTP routes trigger build. page_publish mirroring app_publish is consistent.

---

## Must-revise items

**#1 [S1/T1] Task 4 — handler tests are unrunnable on the reused fake server.**
Evidence: `mcp.tools.test.ts:7-16` fake discards the handler (`_handler` param, only `names` kept). The three falsifiable assertions (plan lines 98-100) need handler invocation.
修订: Task 4 must specify a NEW/extended harness that captures a `name→handler` map, `await`s the handler with test args, and `vi.mock`s `../services/app.service.js` + `../services/page.service.js` to assert the spy payloads:
  - app_update: assert `updateApp` spy called WITHOUT `appStoreId`/`rating`/`category` even when passed in args.
  - page_create(app:'delphi'): assert `createPage` spy received `meta` containing `appId:'delphi'`.
  - page_publish: assert `publishPage` spy called (not `updatePage`), and isError when service returns null.
Without this, the tests are registration-only shells and the [D-002]/[D-004] guards are unverified.

**#2 [S1/AR] [D-004] field split exposes 3 sync-clobbered fields as editorial.**
Evidence: `app-sync.service.ts:50-74` writes `icon` (line 73, iTunes-first), `description` (line 74, iTunes-first), `screenshots` (lines 51-54, ASC-then-iTunes-first) — editorial `cur.*` is only the last fallback. D-004 (plan line 29) lists all three as editorial-exposed via `app_update`. For any app with an `appStoreId`, editing these via app_update then syncing reverts them — the exact clobber D-004 says it prevents.
修订 (needs user decision — see DP-001): either (a) remove `icon`, `description`, `screenshots` from app_update's schema (keep only the genuinely-safe editorial set: `name, slug, tagline, accentColor, features, links, sortOrder, status, meta`), OR (b) document that these three are "editorial until next sync" and accept the clobber. Option (a) is consistent with D-004's stated rationale. Confirmed-safe (sync never writes): name, slug, tagline, accentColor, features, links, sortOrder, status, meta.

---

## Advisories (non-blocking)

- **A-1 [S1 断言 3]** page_create meta merge uses unguarded `JSON.parse` on caller-supplied `meta` — matches existing `blog_update_post_meta` (tools.ts:592) fragility. Optional: wrap in try/catch and isError on malformed meta. Consistency, not defect.
- **A-2 [AR]** `appStoreUrl` is editable via `app_create` (tools.ts:506) and NOT written by sync (absent from app-sync set lines 56-78), so it is genuinely editorial — but it is absent from both app_update's schema (plan line 82) and from D-004's lists. If CC should be able to edit the store URL, add `appStoreUrl?` to app_update's editorial schema. Categorize and decide.
- **A-3 [Task 5]** State `npm run cli key:create wb-mcp-test` as the expected stdio-smoke path; deferral only if the CLI itself is unavailable. Plaintext key minting works (cli/keys.ts:27-29).

---

## Decisions

### [DP-001] [D-004] icon/description/screenshots — editorial or sync-owned? (blocking)
**Context:** These 3 fields are exposed by app_update (editorial) AND overwritten iTunes/ASC-first by app_sync (app-sync.service.ts:51-74). Editing then syncing reverts them.
**Options:**
- A: Remove icon/description/screenshots from app_update schema — only sync owns them. Trade-off: CC can't hand-author an app icon/description/screenshot list; must rely on ASC/iTunes. Consistent with D-004's rationale.
- B: Keep them editorial, document "overwritten on next sync." Trade-off: surprising silent revert; contradicts D-004's own stated purpose.
**Recommendation:** Option A — `app-sync.service.ts:73-74` proves icon/description are iTunes-first and `:51-54` proves screenshots are ASC/iTunes-first, so leaving them in app_update creates the exact clobber D-004 documents it is preventing. Removing them keeps the tool's contract honest.

---

### Decisions resolved
None pre-resolved in dispatch.

### Skipped DP candidates
(.out-of-scope dir not present under project root; none to suppress.)
