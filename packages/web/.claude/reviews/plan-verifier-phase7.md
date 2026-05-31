## Plan Verification Summary

**Status:** complete
**Plan:** docs/06-plans/2026-05-31-phase7-legacy-cleanup-plan.md
**Verdict:** MUST-REVISE (1 must-revise + 1 advisory-blocking-clarity, several advisories)
**Scope verified:** alias-deletion blast radius, nav/footer rewiring, /apps reuse, Tailwind removal, file-format dist paths, full page-inventory completeness.

---

### Contract v1 structural checks

- `contract_version: 1` present. All 10 tasks carry Task Contract (Precondition/Postcondition) + Files + Steps + Verify. Impact Map present (plan-level). PASS.
- `Maps to Impact Map` field is recommended at v1, not required — absent on tasks; warned once, not a blocker (legacy-compat rule). Every task does map cleanly to an Impact Map row by subject, so no scope pollution.
- `docs/00-AI-CONTEXT.md` not present in repo → Project Context Contract check N/A. Product nouns (Apps/Writing/Podcast) sourced from Home v2 reference + live UI text per dispatch — acceptable.

---

### [S1] Falsifiable error candidates

**[断言 1] Task 10 — the alias-deletion grep gate misses a consumer outside the plan's 8-page list, so deleting BaseLayout.astro:298–321 silently breaks a surviving page (admin / component / styles / app-detail.css).**
Verify: independently grepped ALL of `packages/web/src` for every one of the 15 alias names.
Result: ✅ 断言不成立 [C:95]. Every consumer of every alias is exactly one of the 5 alias-based migrated pages plus the BaseLayout definition itself:
- `404.astro:26,37,45,47`; `page/[page].astro:61,66,69,80,94,99,109,120,127,130,132,138,139,145`; `archives.astro:67,69,82,89,95,96,110,116,124,129`; `tags/index.astro:30,31,41,44,45,47,53,54,55`; `categories/index.astro:32,33,38,39,49,55,62,67,75,81`; definitions at `BaseLayout.astro:304–320`.
- ZERO consumers in `src/components`, `src/layouts` (besides the definition), `src/styles`, `src/pages/admin`, or `app-detail.css`. The 3 Tailwind pages (`categories/[slug]`, `tags/[slug]`, `[slug]`) consume NO aliases (they're raw Tailwind), so they cannot break on deletion — they break only if Tailwind removal is wrong (separate assertion). The plan's 8-page list is exactly complete. No must-revise from blast radius.

**[断言 2] Task 9 — replacing Tailwind `prose prose-lg` with the bare global `.prose` from tokens.css ships an UNSTYLED article body on the CMS `[slug]` page (no heading sizes, no paragraph spacing, no list bullets, no blockquote/code styling), because tokens.css `.prose` only sets container font/size/line-height/color.**
Verify: read `tokens.css:155` and the proven sibling page `posts/[slug].astro`.
Result: ❌ 断言成立 [C:92] → **MUST-REVISE.**
- `tokens.css:155` is a single rule: `.prose{ font-family; font-size; line-height; color }` — NO descendant-element rules.
- `@tailwindcss/typography`'s `prose prose-lg` (confirmed installed, `package.json`) styles all descendants: headings, paragraphs, lists, blockquotes, code blocks, images, spacing.
- The already-migrated long-form page `posts/[slug].astro` ALSO uses `<div class="prose" set:html>` but defines **13 descendant rules in its own scoped `<style>`** (`.prose > p` :458, `.prose h2` :462, `.prose h3` :472, `.prose ul/ol` :492-493, `.prose blockquote` :503, `.prose blockquote p` :510, `.prose pre` :522, `.prose pre code` :531, `.prose img` :540). The global `.prose` is only the container baseline.
- Task 9 step 2 instructs only "use the global `.prose` class from tokens.css (replaces Tailwind `prose prose-lg`)" — it does NOT instruct porting/reusing the descendant typography. Executed literally, the `[slug]` CMS body renders as unstyled HTML. This is a silent downgrade (violates the "no silent degradation" rule). **Revision:** Task 9 step 2 must port the `.prose` descendant-element rules from `posts/[slug].astro:458–540` into `[slug].astro`'s scoped `<style>` (or factor them into a shared `.prose` block in tokens.css), not rely on the bare container rule.

**[断言 3] Task 2 — `/apps` has no existing app-selection helper, so it must reimplement featured/sort selection.**
Verify: read `src/lib/home.ts` exports + `index.astro:39–42`.
Result: ✅ 断言不成立 [C:95]. Helpers exist and are named: `selectFeaturedApp(apps)` (`home.ts:35`) and `restApps(apps, featured)` (`home.ts:63`); home uses both at `index.astro:40–41`. `getApps({status})` at `api.ts:232`. Task 2's "reuse, don't reimplement" is accurate and the helper names are real. PASS.

**[断言 4] Task 1 — removing the `/` (文章) nav item leaves the home unreachable from chrome.**
Verify: read `BaseLayout.astro:64–78`.
Result: ✅ 断言不成立 [C:90]. Brand `<a class="brand" href="/">` at `BaseLayout.astro:66` persists (Task 1 does not touch it). Home stays reachable via brand. New nav = Apps/Writing/Podcast only is the confirmed IA (D-001). Acceptable; noted as intended.

**[断言 5] Task 7/9 — removing all Tailwind utilities from the 3 pages breaks something else that depends on Tailwind being compiled.**
Verify: grepped Tailwind utility usage across `src`, read `astro.config.mjs` + `tailwind.config`.
Result: ✅ 断言不成立 [C:93]. `@astrojs/tailwind` is a global integration (`astro.config.mjs`) and ALL admin components (`src/components/admin/*.tsx`, `src/pages/admin/*`) depend on Tailwind utilities. The integration stays; only the 3 page files' utility classes are removed. Nothing else in the 3 target pages, and no shared component, relies on those specific utilities. Removal is safe. The 3 pages are the ONLY non-admin Tailwind utility users (grep confirmed). PASS.

S1 totals: 5 generated, 1 成立 (C:92 ≥ 80 → reported as must-revise), 4 不成立. No low-confidence (<80) filtered.

---

### [S2] Failure reverse reasoning

**[编译失败推理]** Hypothesis: Task 2 `/apps/index.astro` imports `selectFeaturedApp`/`restApps` from a wrong path, or `getApps` signature mismatch.
计划覆盖: ✅ — helpers confirmed at `home.ts:35,63`, `getApps` at `api.ts:232` with `{status}` param matching home's call. Task 2 step 1 explicitly says check `home.ts`/`app.ts`. Low risk.

**[运行时/构建 Regression 推理]** Hypothesis: Task 10 deletes the alias block while a page still references an alias → that page renders with `var(--color-x)` resolving to nothing (invalid CSS, falls back to inherited/initial), shipping wrong colors.
操作路径: any of 8 pages → BaseLayout global `<style>` alias resolution → page scoped `<style>` `var(--color-*)`.
计划覆盖: ✅ — Task 10 step 1 is a BLOCKING grep gate that aborts deletion if any consumer remains; Tasks 4–9 strip every alias first. The gate regex is complete (covers all 15 names). One precision defect in the gate command — see advisory below — but the ordering/guard logic is sound.

**[运行时 Regression — footer layout]** Hypothesis: Task 1 adds a 3rd `.foot-col`「更多」; `.foot-cols` is `display:flex; gap; flex-wrap` (`BaseLayout.astro:258`) so it absorbs a third column without grid-template changes.
计划覆盖: ✅ — flex-wrap container, additive column is layout-safe. Impact Map flags "verify every page's footer still lays out" — covered by Task 10 full build.

---

### [DF] Design faithfulness

No standalone design doc for aux pages (D-004: derived from existing system, DP-001=A authorized). Reuse anchors verified against live source:
- `/writing` `.item.post` / `.year-head` / `.list` / `.chip-f` patterns: real (`writing/index.astro:63–222`). Tasks 4–8 reuse them faithfully.
- home `.item.app` row markup: real (`index.astro:126–160`, inside `<div class="apps">`). Task 2 reuse is accurate.
- `.prose` (tokens.css): EXISTS but is container-only — see S1 断言 2. This is the one DF gap: Task 9 under-specifies the body typography it must reproduce.
- spine/`.no`/`.lab`/`.note`/`.item` language: global in BaseLayout (`:160–198`). Reusable as claimed.

DF mapped: 4/5 reuse anchors faithful; 1 gap (Task 9 `.prose` body typography under-specified).

---

### [AR] Architecture review

- **Shared-layout change (BaseLayout nav+footer):** single `navItems` array (`:17–26`) + footer cols (`:91–104`); one-spot edits, blast radius = all pages but structurally additive. Sound.
- **New route /apps:** parallels /writing & /podcast; `output:'static'` + `format:'file'` → emits `dist/apps.html`. Consistent with existing IA. Sound.
- **Prop contract:** new nav doesn't change `BaseLayout` Props `{title; description?; ogImage?}` — no importer breaks. Sound.
- **Nav/footer link resolution:** ALL targets exist or are created this phase — verified: `/apps` (Task 2 creates), `/writing` (`writing/index.astro`✓), `/podcast` (`podcast.astro`✓), `/about` (`about.astro`✓), `/categories`+`/tags`+`/archives` (✓). No dangling routes. Task 10 link sweep covers it.
- **Page inventory completeness (dispatch pt 6):** `find src/pages -name '*.astro' -not -path '*/admin/*'` = 14 files. The 8 migrated + the 6 already-new (`index`, `posts/[slug]`, `writing/index`, `podcast`, `about`, `apps/[slug]`) = 14. NO non-admin page is missed. Complete.

---

### Phase-level acceptance coverage

All 4 dev-guide Phase 7 criteria are covered by the 10 tasks (archives/categories/tags/pagination redesign → T4–8; grep-clean → T10 gate; full build + links resolve → T10; route build verify → final build). No uncovered acceptance criterion.

---

## MUST-REVISE items

1. **[S1/DF] Task 9 step 2 — CMS `[slug]` body typography is under-specified → silent unstyled-body downgrade.**
   Evidence: `tokens.css:155` `.prose` is container-only (font/size/line-height/color); the proven page `posts/[slug].astro:458–540` carries 13 descendant `.prose` rules (h2/h3/p/ul/ol/blockquote/pre/code/img) in its own scoped style. Task 9 replaces Tailwind `prose prose-lg` with bare `.prose` and does not port descendant rules.
   Revision: Task 9 step 2 must reproduce article-body typography — port the `.prose` descendant rules from `posts/[slug].astro:458–540` into `[slug].astro`'s scoped `<style>`, OR promote them into a shared `.prose {...}` block in `tokens.css` and reference it. Add a Verify assertion: built `dist/<slug>.html` `.prose h2`/`p`/`ul` have non-initial computed styling (or simply: the page's scoped style contains `.prose h2`/`.prose p`/`.prose ul`).

## Recommended (advisory)

1. **[S1] Task 10 step 1 — grep gate command returns the BaseLayout definition lines, reading as a false failure.**
   The gate runs BEFORE deletion, so `grep -rnE '...' packages/web/src` matches `BaseLayout.astro:304–320` (the alias definitions) and returns 17 lines, not 0. The plan's parenthetical "outside the BaseLayout definition itself" must be IN the command. Revision: append `| grep -v 'BaseLayout.astro'` (expect 0) — or grep `src/pages` only. Otherwise the executor sees a non-empty gate and may wrongly abort or wrongly delete.

2. **[AR] Task 3 viewall placement — `#apps` section structure differs from writing/podcast.** The home `#apps` content column is `<div class="apps">` wrapping `.feature` + `.list` (`index.astro:86–168`), whereas writing's viewall sits as a sibling of `.list` inside a bare `<div>` (`:180`). Task 3 says "match writing placement" — executor must place `<a class="viewall" href="/apps">` inside `<div class="apps">` after the `.list`, not after the section. Already flagged by plan wording; note for precision.

3. **[advisory] isActive on `/posts/[slug]`:** reading a blog post highlights NO nav item (`startsWith('/writing')` is false for `/posts/`). Posts have always lived at `/posts`; Writing index is `/writing`. Acceptable but worth a one-line note — if desired, `Writing` active could also match `currentPath.startsWith('/posts')`.

4. **[advisory] file-format dist paths CONFIRMED empirically:** prior Phase 4 `dist/` shows `dist/categories.html`, `dist/archives.html`, `dist/tags.html`, `dist/404.html` (index→file) and `dist/categories/<slug>.html`, `dist/page/2.html` (dynamic→dir). The plan's verify greps reference the correct paths. No change needed.

## No revision needed (verified sufficient)

- Alias-deletion blast radius: consumers = exactly the 8 migrated pages, zero elsewhere (S1 断言 1, C:95).
- Tailwind removal safe: integration stays for admin (S1 断言 5, C:93).
- /apps selection helpers real and named (S1 断言 3).
- Home reachable via brand (S1 断言 4).
- All nav/footer targets resolve incl. /about (AR).
- Full page inventory complete — no page missed (AR).
- Gate regex covers all 15 alias names (S2).

## Decisions
None. (The must-revise is a determinate fix — port existing `.prose` descendant rules — not a user choice.)
