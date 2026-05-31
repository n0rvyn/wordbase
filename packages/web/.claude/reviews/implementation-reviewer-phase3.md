## Implementation Review Summary
**Status:** complete
**Plan:** docs/06-plans/2026-05-31-phase3-writing-article-plan.md
**Design doc:** docs/design/reference/norvyn.com - Writing.html + norvyn.com - Article.html
**Crystal:** docs/11-crystals/2026-05-31-phase-3-visual-crystal.md
**Started:** 2026-05-31-082126

---

## Part 1 — Plan-vs-Code Verification

### 1. Deletion / Old-code Removal Verification
- [D-010] old serif `/posts/[slug]` layout fully replaced. `grep -ni 'cormorant|c23a22|vermillion|朱红|article-header|back-link' src/pages/posts/[slug].astro` → **0 hits** (clean). [C:100]
- Built artifact confirms: `grep -ci 'cormorant|#c23a22' dist/posts/内存分类-type-of-ram.html` → **0**. [C:100]
- ✅ No serif markup, no Cormorant font, no vermillion color remains in the article template or its build output.

### 2. Struct / Interface Field Comparison
- `writing.ts` exports `CategoryInput{slug,name,count}`, `CategoryItem{slug,name}`, `YearGroup{year,posts}` + 4 functions — matches the Task 1 contract exactly. [C:100]
- `article.ts` exports `TocEntry{id,level,text}`, `injectHeadingIds`, `selectAdjacent` — matches Task 2 contract, including the verbatim REPL-verified regex `/<h([23])>([\s\S]*?)<\/h\1>/g`. [C:100]
- ✅ No missing or renamed fields.

### 3. UI Element Verification
**/writing (Task 3):** hero spine `00 Writing` (:65-68), eyebrow `Essays · 自 2008` (:71), `h1 写作` (:72), lede (:73), `.topics` with 全部 chip + top-cat chips + `全部分类 →` `.viewall`→`/categories` (:74-80), `.post-feat` featured card with `.tag`/`.pdate`/`h2`/`.rmeta`/`.read-link` (:94-105), year-grouped archive with `.item.post {density}` rows (:119-160). All present. [C:100]

**/posts/[slug] (Task 4):** `.progress` bar (:51), `.art-wrap`/`.art-grid` (:53-54), `.rail` with `.meta`/`.toc`/restyled `<ShareButtons>` (:56-94), `.reading` `.cat`/`h1`/`.dek`/`.byline`/`.prose`/`.endmark ◆`/`.author-card`/`.pn-nav` (:97-135), `<CommentSection>` below grid (:140-142). All present. [C:100]
- ✅ All design-specified UI elements found.

### 4. "No Matches Found" Red-flag Check
- No expected-but-missing grep. All target classes/IDs/tokens resolved. [C:100]

### 5. Integration Point Verification
- `/writing` consumes `writing.ts` helpers (`selectTopCategories`/`groupByYear`/`selectFullYears`/`densityForYear`) — wired at :43,:48,:49,:120. [C:100]
- `/posts/[slug]` consumes `article.ts` (`injectHeadingIds`/`selectAdjacent`) at :44-45, and `home.ts`'s `formatMonoDate`. [C:100]
- ShareButtons receives `title`+`url` (:93); CommentSection receives `postId` (:141). Both prop contracts satisfied. [C:100]
- **Migration call-site check (token migration):** ShareButtons + CommentSection are visual components consuming design tokens. Both migrated off legacy `var(--color-*)`/`var(--font-sans)` onto new tokens; all tokens (`--accent`/`--on-accent`/`--font-read`/`--font-display`/`--font-ui`/`--font-mono`/`--line`/`--line-2`/`--surface`/`--surface-2`/`--ink`/`--ink-2`/`--ink-3`) verified declared at `src/styles/tokens.css` (:20-127). No raw values passed by callers. [C:100]
- ✅ All integrations connected.

### 6. "Never Trust Existing Code" (modify tasks)
- `index.astro` Task 3 step 8: `全部文章` link repointed `/` → `/writing` (verified at :180); stale DP-002=B comment removed (`grep 'DP-002'` → 0). [C:100]
- `[slug].astro` full rewrite verified by reading the file in full. [C:100]
- ShareButtons + CommentSection modifications verified by full read. [C:100]

### 7. Unauthorized Deferral Detection
- No task marked deferred/optional/postponed. All 6 tasks (1-tests, 1-impl, 2-tests, 2-impl, 3, 4, 5, 6) implemented. [C:100]
- ✅ No unauthorized deferral.

### 8. Conditional Branch Verification
- `density === 'full'` branch (full row: date+title+excerpt+meta) vs compact branch (single-line grid) — both branches implemented (writing :136-153). Condition `densityForYear(year, fullYears)` is computed, not assumed. [C:100]
- `older ? ... : empty` / `newer ? ... : empty` prev-next branches both rendered ([slug] :119-134). [C:100]

### 9. Removal-Replacement Reachability
- TOC rail only renders when `toc.length > 0` ([slug] :76). For heading-less posts the rail still shows `.meta` + share (no dead empty TOC). Reachable. [C:100]
- Progress bar `#progress` always rendered (:51); client script guards `if (!bar) return`. [C:100]

### 10. Term Consistency After Rename
- No old serif terms in active article code (section 1). [C:100]
- Product-facing names ("写作"/"Writing"/"全部分类"/"评论"/"留下评论"/"提交") come from real UI text per crystal [D-006] zh-CN copy decision, not code identifiers. [C:90]

### 11. ADR Action Completeness
- N/A — no ADR in scope; crystal [D-001]..[D-010] serves as the decision record and is fully actioned (see Part 2). [C:100]

### 12. Reverse Regression Reasoning
- **[Reverse] Hypothetical regression:** Reader opens an article whose markdown has no H2/H3 → TOC nav would be empty. **Code path:** `/posts/[slug]` :76 `{toc.length > 0 && ...}` guards the whole TOC block, so no empty `<nav>` and no dead scroll-spy (script's `tocLinks` would be `[]`, `spy()` no-ops). **Covered by:** section 9. ✅ no new finding.
- **[Reverse] Hypothetical regression:** Multi-category post hidden under one of its categories when filtering. **Code path:** filter script :175-179 splits `data-cats` on space and uses `.includes(cat)`; built HTML confirms 25 rows carry space-separated `data-cats`. ✅ covered by section Part-2-B. no new finding.
- **[Reverse] Hypothetical regression:** Newest archive year renders compact instead of full because the featured post consumed a "full" slot. **Code path:** `:48 selectFullYears(posts,2)` over ALL posts → `[2025,2024]`; `:47 archive=posts.slice(1)` drops the sole 2025 post; archive newest year is 2024. **Covered by:** ❌ NEW FINDING — see Part 2 Gap [E-1] / DP-001.

### 13. Rules Compliance Audit

**[R6 Audit]** Completion claims: build/test claims in context (71/71 green, 346 pages, astro check 0). Spot-verified independently: dist artifacts exist, article markers (`id="h-0"`, `class="progress"`, `◆`, 0 cormorant) and writing markers (125 rows, 7 chips, 125 data-cats, 25 multi-cat) all confirmed via grep on built output. ✅ claims corroborated by evidence.

**[R9 Audit]** Files edited: 8 — all plan-specified (writing.ts/.test, article.ts/.test, writing/index.astro, posts/[slug].astro, ShareButtons.astro, CommentSection.astro, index.astro one-line). Unplanned: **0**. ✅ no bypass, no scope creep.

**[Decision Audit]** View modifications: 2 new/rewritten pages + 2 restyled components. All user-visible changes are plan-specified and crystal-recorded ([D-001]..[D-010]). Unconfirmed: 0. ✅

### 13.1 Test Completeness Audit
- Task 1 test: `src/lib/writing.test.ts` exists, **17 assertions** across 4 describe blocks (selectTopCategories 6, groupByYear 5, selectFullYears 4, densityForYear 2). Real assertions, not shells. Covers zero-count exclusion, entity decode, count-desc + name-tiebreak, limit cap, UTC year bucketing, intra-year desc sort, null→year 0 trailing, k-newest-years, density branches. [C:100]
- Task 2 test: `src/lib/article.test.ts` exists, **10 assertions** (injectHeadingIds 5, selectAdjacent 5). Covers CJK heading id injection, h4-untouched, toc text strip, empty input, inner-html preservation, first/last/middle/solo/not-found adjacency. [C:100]
- Tasks 3-6 carry explicit `⚠️ No test` / `no-split` annotations (UI assembly + style-only) — not test-required.

```
[Test Completeness]
- Required tests: 2 (Task 1, Task 2)
- Files exist: 2
- Non-empty tests: 2
- Core path covered: 2
- Shell tests: 0
```

---

## Part 2 — Design Fidelity Audit

### 14. Spec Value Comparison (Gap A)
- [A] Article.html `.progress` 2px / `var(--accent)` — Impl :147-155 `height:2px;background:var(--accent)` ✅ match (position intentionally changed, see [E] below).
- [A] `.prose font-size:18px;line-height:1.95` — Impl :452-455 ✅ match.
- [A] `.prose h2 scroll-margin-top:96px` — Impl :469 ✅ match.
- [A] `.toc a.active` accent left-border — Impl :242-245 `border-color:var(--accent)` ✅ match.
- [A] blockquote `border-left:2px solid var(--accent)` — Impl :503-508 ✅ match.
- [A] `.endmark ◆` accent, font-size:22px — Impl :109,:311-316 ✅ match.
- [A] `.share button` 34px / `border-radius:50%` / `border:1px solid var(--line-2)` / hover accent — Impl ShareButtons :37-55 (keyed off `.share-btn`) ✅ match.
- [A] Writing.html `.chip-f` / `.chip-f.sel` (accent bg, on-accent) — Impl writing :215-222 ✅ match.
- [A] `.post-feat` + `.tag`/`.pdate`/`h2`/`.rmeta`/`.read-link` values — Impl writing :235-264 ✅ byte-for-byte match against prototype.
- **9 spec values checked, 0 mismatched.** [C:100]

### 15. Data Flow Connectivity Tracing (Gap B)
- [B] `getCategories()`+per-cat `getPosts` → `postCatSlugs Map` → `data-cats` attr → client filter `.includes()` → row hide. Connected end-to-end; built HTML shows 25 multi-cat rows with space-separated slugs. ✅ connected. [C:100]
- [B] `marked.parse` → `injectHeadingIds` → `{html,toc}` → `.prose set:html` + `.toc` anchors + scroll-spy `getElementById`. Built article: `href="#h-0..3"` exactly match `id="h-0..3"`. ✅ connected, anchors exact. [C:100]
- [B] `selectAdjacent(orderedSlugs, slug)` → prev/next cards with `slugTitle[...]` labels. ✅ connected. [C:100]
- **3 flows traced, 0 disconnected.**

### 16. Old Code Removal Completeness (Gap C)
- [C] [D-010] "serif 版式完全替换" — `grep cormorant|c23a22|article-header|back-link` in source + dist → 0. ✅ removed.
- [C] [D-006] Tailwind classes in CommentSection — `grep -ci 'bg-white|text-gray|rounded-lg|md:grid-cols'` → **0**. ✅ removed.
- [C] [D-005] legacy tokens in ShareButtons (incl. WeChat-overlay innerHTML) — `grep -c 'var(--color-|var(--font-sans)'` → **0**. ✅ removed.
- [C] legacy tokens in CommentSection renderComment — `grep -c` → **0**. ✅ removed.
- **4 removals checked, 0 still present.**

### 17. Missing Feature Detection (Gap D)
- [D-001] top-freq chips + `全部` + `全部分类 →`/categories — ✅ writing :74-80 (built: 7 chips).
- [D-002] `data-cats` plural for multi-cat — ✅ built: 25 rows.
- [D-003] year grouping, newest-2 full / older compact — ⚠️ **partially defeated**, see [E-1]/DP-001 (feature present; tiering outcome off by the featured-slot interaction).
- [D-004] featured = newest post, no data-cat, outside filter — ✅ built: post-feat carries 0 data-cat, dated 2025-06-02.
- [D-005] ShareButtons keep all 3, circular — ✅ Twitter `<a>` + WeChat + Copy buttons, `.share-btn` 34px circle.
- [D-006] CommentSection kept + restyled + zh-CN, logic unchanged — ✅ #comment-form/#comments-list/data-post-id/name= preserved (grep 5/5), fetch+POST logic intact.
- [D-007] vanilla scroll-spy/progress, bar owned by page — ✅ [slug] :51 page-owned `.progress`, :552-585 vanilla script, BaseLayout untouched.
- [D-008] index-based heading ids (h-0…) — ✅ built: id="h-0..3".
- [D-009] `:global` prose — ✅ ALL `.prose *` rules in `<style is:global>` (:449-550); scoped block (:146-446) has zero `.prose` child rules.
- [D-010] old serif replaced — ✅ (section 16).
- **10 features checked, 0 fully missing; 1 ([D-003]) functionally degraded — see [E-1].**

### 18. Implementation Quality Comparison (Gap E)

- [E-1] **[D-003] year-density tiering — ❌ functional degradation (recommended-severity)**
  Design/crystal: archive shows the **two newest years** at full density (date+title+excerpt+meta), older years compact. Code: `fullYears = selectFullYears(posts, 2)` is computed over **all** posts including the featured (`writing/index.astro:48`), but the archive is `posts.slice(1)` (`:47`) and only the archive is grouped/rendered (`:49,:119`). The sole 2025 post (2025-06-02) is the featured card, so `fullYears = [2025, 2024]` but the archive's newest year is **2024**. Built output confirms: archive year-heads start at 2024; only 4 full-density rows (all 2024); the 2025 "full" slot is consumed by a post that has no archive rows.
  **Impact:** the archive renders **one** full-density year, not two. [D-003]'s "近期详细" intent is half-delivered. This is **plan-faithful** (the plan literally specified `selectFullYears(posts, 2)`), so it is silent degradation against the *crystal* rather than against the plan. See DP-001. [C:100]

- [E] Progress bar `position:fixed;top:0;z-index:60` vs prototype `position:absolute;bottom:-1px` — ✅ **authorized divergence** ([D-007] explicitly: bar owned by article page, not BaseLayout nav). Faithful to crystal; intentional change from raw HTML prototype. Not a gap. [C:100]
- [E] Prototype `.pullquote`/`.cover`/`.figcap`/`.tok-*` styles absent from impl — ✅ **authorized** (Task 4 non-goals: "render only when present in markdown"; `marked@12` emits no syntax-token classes). Not a gap. [C:100]
- [E] `injectHeadingIds` regex matches plan's REPL-verified pattern verbatim — ✅ faithful. [C:100]
- [E] copy feedback changed from text-swap to icon-swap — ✅ authorized (Task 5 Non-goals explicitly permit the presentation change so a 34px circle shows success). Logic (clipboard + execCommand fallback, WeChat QR) unchanged. [C:100]
- **5 approaches compared: 4 faithful/authorized, 1 functional degradation ([E-1]).**

---

## Test-Fidelity Findings

Split pairs detected: **Task 1-tests / Task 1-impl**, **Task 2-tests / Task 2-impl** (strict `-tests`/`-impl` suffix match). No orphans. Tasks 3/4 carry `no-split`/`No test` annotations — excluded.

**Task 1-tests / Task 1-impl:**
- Check A (test-vs-contract): assertions encode user-observable rules from `EB_tests` (high-freq chips, year grouping newest-first, newest-2 full / older compact). No overfitting to internal names. → **pass**.
- Check B (contract consistency): `EB_tests` and `EB_impl` both state "high-freq chips, year-grouped archive, newest-2-years full / older compact" — same outcome two angles. → **pass**.
- Check C (test-vs-impl gap): every impl function (selectTopCategories/groupByYear/selectFullYears/densityForYear) has ≥1 asserting test. → **pass**.

**Task 2-tests / Task 2-impl:**
- Check A: assertions target user-observable behavior (stable CJK anchors, exact TOC match, correct prev/next). → **pass**.
- Check B: both contracts describe "stable anchors on Chinese headings + matching TOC + correct prev/next". → **pass**.
- Check C: `injectHeadingIds` + `selectAdjacent` both covered (id injection, h4-untouched, text strip, empty, adjacency edges). → **pass**.

**No blockers, no advisories.** Both pairs are real tests (not shells), cover core logic, and the two halves agree.

---

## Pre-existing Issues
- **dist output is flat `dist/posts/{slug}.html`, not `dist/posts/{slug}/index.html`** as the plan's automated-verify commands assume (e.g. `grep ... dist/posts/S/index.html`). Root cause: pre-existing Astro `build.format:'file'` config, not a Phase-3 change. Impact: **none on the product** — markers verified fine via the flat path (`id="h-0"`, `progress`, `◆`, 0 cormorant all present). Recommendation: update the plan's verify text to the flat path; no code change needed. [C:90]

---

## Decisions

### [DP-001] Archive renders one full-density year instead of two (recommended)

**Gap:** [D-003] crystal specifies the writing archive shows the **two newest years** at full density. Code computes `selectFullYears(posts, 2) = [2025, 2024]` over all posts (`writing/index.astro:48`) but the archive excludes the featured post (`:47 posts.slice(1)`), and 2025's only post IS the featured. Result: archive's newest year is 2024; only 2024 renders full (4 rows), 2023→2008 are all compact. The reader sees one detailed year, not two. The featured card already shows the 2025 post in full, so the "newest year" is still visible — but the archive's second full tier is lost.

**Options:**

| | A: compute fullYears over archive | B: bump k to 3 / accept as-is |
|---|---|---|
| Behavior | Archive shows 2024 + 2023 full (two newest *archive* years), matching [D-003] intent | A: featured(2025) + archive 2024 full ≈ two full years overall; or accept current 1-year-full |
| Implementation | 1-line: `selectFullYears(archive, 2)` instead of `selectFullYears(posts, 2)` at :48 | `selectFullYears(posts, 3)` (1 line) or zero change + crystal note |
| Risk | Featured year (2025) + next two archive years all detailed — slightly more "full" content | k=3 over-expands once 2025 gains archive posts; "as-is" leaves [D-003] half-met |

**Recommendation:** Option A — `writing/index.astro:47-49` already establishes that the archive is the rendered, grouped collection (`posts.slice(1)`), so density tiering should key off that same archive set for internal consistency; this is a 1-line change (`selectFullYears(archive, 2)`) that delivers [D-003]'s "two newest years detailed" against the data the archive actually shows.

---

## Low-Confidence Appendix (C < 80)
None. All findings carry file:line or built-artifact evidence (C ≥ 90).

---

## Verdict
❌ 1 gap requires remediation (recommended-severity): [E-1]/DP-001 — archive renders one full-density year vs the two [D-003] specifies. Plan-faithful but degrades crystal intent; 1-line fix available. Everything else (Parts 1 + 2, both test-fidelity pairs) is clean.
