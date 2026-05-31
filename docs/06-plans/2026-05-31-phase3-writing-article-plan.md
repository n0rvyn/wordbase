---
type: plan
status: active
contract_version: 2
tags: [astro, writing, article, toc, blog-frontend]
refs:
  - docs/design/reference/norvyn.com - Writing.html
  - docs/design/reference/norvyn.com - Article.html
  - docs/11-crystals/2026-05-31-phase-3-visual-crystal.md
---

# Phase 3 — Writing list (/writing) + Article (/posts/[slug]) Implementation Plan

**Goal:** Ship a new `/writing` index (filter chips + featured + year-grouped archive) and rebuild `/posts/[slug]` on the new Article design (left rail TOC scroll-spy + progress bar + new prose), replacing the serif post layout, with all 126 published posts on the new template.

**Architecture:** Two new pure-logic helper modules (`writing.ts`, `article.ts`) carry all testable logic (category selection, year grouping, density tiering, build-time heading-ID injection + TOC extraction, prev/next selection); the two `.astro` pages assemble UI from those helpers using the Phase 1 BaseLayout shell and the established `.row2`/`.spine`/`.item` row language. Heading IDs are injected by a version-stable regex pass over `marked`'s HTML output using **index-based IDs** (`h-0`…) so Chinese headings get stable anchors; prose is styled with `:global()` because `set:html` content is not reached by Astro scoped styles. Share + comments are kept (DP-002=A) and restyled to hairline.

**Tech Stack:** Astro 4 (SSG), `marked@12.0.2`, vanilla client scripts (no Preact island), Vitest.

**Design doc:** docs/design/reference/norvyn.com - Writing.html, docs/design/reference/norvyn.com - Article.html

**Design analysis:** none

**Crystal file:** docs/11-crystals/2026-05-31-phase-3-visual-crystal.md

**Bug diagnosis:** not applicable

**Threat model:** not applicable — no security-signal keywords; content is build-time read-only from a trusted internal API. (Markdown→HTML via `set:html` is existing pre-Phase-3 behavior, unchanged; no new external-input attack surface introduced.)

**Pre-flight risks:**
- `marked.parse()` in `marked@12.0.2` emits H2/H3 with NO `id` attribute (verified by REPL) — TOC anchors require build-time ID injection; without it scroll-spy/anchors are dead.
- Astro scoped `<style>` does NOT apply to `set:html`-injected DOM (compile-time attribute stamping) — `.prose h2 {}` written normally renders the article body unstyled. Must use `:global()`. Current `[slug].astro` has no prose-child styles so this is newly exercised.
- GitHub-style heading slugs collide/empty on CJK headings — must use index-based IDs.
- 25/126 published posts are multi-category — a single `data-cat` per row mis-hides them; rows must carry `data-cats` (space-separated all slugs) and filter must match within the list.
- Category names contain HTML entities (`&amp;`) — reuse `decodeEntities` from `home.ts`.
- `ShareButtons.astro` / `CommentSection.astro` use old/Tailwind classes; Tailwind is admin-only, so CommentSection likely renders unstyled on the public page today — restyle is required by DP-002=A regardless.

**Project health:** active_churn red (44 dirty files — Phase 1+2 frontend + backend Step-2 work, all uncommitted; not introduced by this phase). module_size yellow (`schema.d.ts` generated). doc_drift yellow (no AI-CONTEXT). None block Phase 3.

---

## Impact Map

**User path:** Visitor opens `/writing` → sees hero + topic chips + latest featured post + year-grouped archive → clicks a chip to filter in place → clicks a post → lands on the new Article reading page with rail TOC (scroll-highlighting), top progress bar, new prose, share buttons, prev/next, and comments below.
**Data path:** `getPosts({status:'published'})` + `getCategories()` + per-category `getPosts({category})` (build-time, API) → `writing.ts` (top categories, post→slugs map, year groups, density) → `/writing.astro` DOM. `getPosts` content → `marked.parse` → `article.ts.injectHeadingIds` → `{html, toc}` → `/posts/[slug].astro` DOM.
**Shared surfaces:** `src/lib/api.ts` (read-only, unchanged), `BaseLayout.astro` (consumed unchanged), `ShareButtons.astro` + `CommentSection.astro` (restyled), new `src/lib/writing.ts` + `src/lib/article.ts`.
**Existing consumers:** `posts/[slug].astro` is the only consumer of ShareButtons/CommentSection (grep-confirmed below in Task 5/6). `index.astro` consumes `home.ts` + BaseLayout (must stay green). Home's "全部文章" link currently points to `/` (DP-002=B) — Phase 3 repoints it to `/writing`.
**Must remain unchanged:** Home (`index.astro`) rendering; `/categories`, `/archives`, `/tags`, `/page/[page]` (Phase 7 scope) — keep old layout during transition; comment POST/load behavior and ShareButtons share targets (Twitter/WeChat/Copy) — only styling/copy changes; theme/accent persistence; BaseLayout nav/footer.
**Regression checks:** full `pnpm build` succeeds and still emits Home + all 126 `/posts/[slug]` pages + `/writing`; `vitest` green incl. existing `home.test.ts`/`theme.test.ts`/`api.test.ts`; grep dist for new Article markers and absence of Cormorant/vermillion on an article page.

---

<!-- section: task-1-tests keywords: writing, vitest, year-group, categories -->
### Task 1-tests: writing.ts helper unit tests

**Maps to Impact Map:** Data path

**Files:**
- Create: `packages/web/src/lib/writing.test.ts`

**Expected outcome:** Tests exist for the `/writing` pure helpers and FAIL because `writing.ts` does not yet exist.

**Non-goals:**
- No API/integration testing (the per-category post→slugs map is built in-page via API loop, mirroring `index.astro`; not unit-tested here).

**Touched surface:** new test file only.

**Regression shield:** none (new file).

**Task Contract:**
- Expected behavior: The `/writing` page will show only high-frequency categories as chips, group the archive by year newest-first, and render the two newest years at full density and older years compact — these rules are pinned by tests.
- Automated verify: `cd packages/web && npx vitest run src/lib/writing.test.ts` exits non-zero (module not found / not defined).
- Real path verify: n/a (pure logic; real path verified in Task 3 build).
- Manual/device verify: none.

**Steps:**
1. Write tests against this intended `writing.ts` API:
   - `selectTopCategories(cats: {slug:string; name:string; count:number}[], limit: number): {slug:string; name:string}[]` — sorts by `count` desc (tiebreak: name asc), drops zero-count, decodes `&amp;` in names, returns up to `limit`. Assert: input incl. `uncategorized` count 0 and `macos_apple_pc` name `"MacOS &amp; Apple &amp; PC"` → zero-count excluded, name decoded to `"MacOS & Apple & PC"`, length ≤ limit, order by count desc.
   - `groupByYear(posts: Post[]): {year:number; posts:Post[]}[]` — buckets by UTC year of `publishedAt`, groups sorted year desc, posts within sorted by `publishedAt` desc; posts with null `publishedAt` go to a trailing group with `year: 0`. Assert ordering on a 3-year fixture.
   - `selectFullYears(posts: Post[], k: number): number[]` — the `k` newest distinct UTC years present. Assert `[2025-post,2024-post,2023-post]`, k=2 → `[2025,2024]`.
   - `densityForYear(year: number, fullYears: number[]): 'full' | 'compact'` — `full` iff `year ∈ fullYears`. Assert both branches.
2. Use small inline `Post` fixtures (only `id`, `title`, `publishedAt`, `content` needed).

**Verify:**
Run: `cd packages/web && npx vitest run src/lib/writing.test.ts`
Expected: fails to resolve `./writing` (red) — confirms test-first.
<!-- /section -->

<!-- section: task-1-impl keywords: writing, year-group, categories, density -->
### Task 1-impl: writing.ts helpers

**Depends on:** Task 1-tests
**Crystal ref:** [D-001] [D-002] [D-003]

**Maps to Impact Map:** Data path

**Files:**
- Create: `packages/web/src/lib/writing.ts`

**Expected outcome:** `writing.test.ts` passes; helpers implement top-category selection, year grouping, newest-K-years selection, and density classification.

**Non-goals:**
- Does not fetch data or build the post→category map (page-level concern).

**Touched surface:** new module.

**Regression shield:** Do not modify `writing.test.ts` written in Task 1-tests (changes to tests here are test tampering).

**Task Contract:**
- Expected behavior: Same user-visible outcome as Task 1-tests — high-freq chips, year-grouped archive, newest-2-years full / older compact.
- Automated verify: `cd packages/web && npx vitest run src/lib/writing.test.ts` exits 0.
- Real path verify: exercised by Task 3's build of `/writing`.
- Manual/device verify: none.

**Steps:**
1. Implement the four functions per the Task 1-tests contract. Reuse `decodeEntities` from `./home`. Year via `new Date(ts*1000).getUTCFullYear()` (UTC, consistent with `formatMonoDate`).
2. Keep functions pure (no API import); import only `type Post` and `decodeEntities` from `./home`/`./api`.

**Verify:**
Run: `cd packages/web && npx vitest run src/lib/writing.test.ts`
Expected: all green.
<!-- /section -->

<!-- section: task-2-tests keywords: article, toc, marked, vitest -->
### Task 2-tests: article.ts helper unit tests

**Maps to Impact Map:** Data path

**Files:**
- Create: `packages/web/src/lib/article.test.ts`

**Expected outcome:** Tests for heading-ID injection + TOC extraction + prev/next selection exist and FAIL (module absent).

**Non-goals:**
- Does not test `marked` itself; feeds pre-rendered HTML strings into `injectHeadingIds`.

**Touched surface:** new test file only.

**Regression shield:** none (new file).

**Task Contract:**
- Expected behavior: Article pages will get stable anchors on Chinese headings and a TOC that matches them exactly, plus correct prev/next links — pinned by tests.
- Automated verify: `cd packages/web && npx vitest run src/lib/article.test.ts` exits non-zero (module absent).
- Real path verify: n/a (verified in Task 4 build).
- Manual/device verify: none.

**Steps:**
1. Test `injectHeadingIds(html: string): { html: string; toc: {id:string; level:number; text:string}[] }`:
   - Input `'<h2>三种声音 <em>一只手</em></h2><p>x</p><h3>小标题 <code>x</code></h3><h2>ship</h2><h4>skip</h4>'`.
   - Assert: returned `html` has `<h2 id="h-0">`, `<h3 id="h-1">`, `<h2 id="h-2">`, and `<h4>` is untouched (no id).
   - Assert: `toc` = `[{id:'h-0',level:2,text:'三种声音 一只手'},{id:'h-1',level:3,text:'小标题 x'},{id:'h-2',level:2,text:'ship'}]` (inline tags stripped from `text`).
   - Empty/no-heading input → `{html: <same>, toc: []}`.
2. Test `selectAdjacent(orderedDescSlugs: string[], current: string): { newer: string|null; older: string|null }` — array is newest→oldest; `newer` = item before current, `older` = item after; ends return null. Assert first item → `{newer:null, older:<next>}`, last → `{newer:<prev>, older:null}`, middle → both.

**Verify:**
Run: `cd packages/web && npx vitest run src/lib/article.test.ts`
Expected: red (module not found).
<!-- /section -->

<!-- section: task-2-impl keywords: article, toc, marked, headings -->
### Task 2-impl: article.ts helpers

**Depends on:** Task 2-tests
**Crystal ref:** [D-007] [D-008]

**Maps to Impact Map:** Data path

**Files:**
- Create: `packages/web/src/lib/article.ts`

**Expected outcome:** `article.test.ts` passes; `injectHeadingIds` + `selectAdjacent` implemented.

**Non-goals:**
- No scroll-spy/progress logic here (that is the page's client script).

**Touched surface:** new module.

**Regression shield:** Do not modify `article.test.ts` from Task 2-tests.

**Task Contract:**
- Expected behavior: Same outcome as Task 2-tests.
- Automated verify: `cd packages/web && npx vitest run src/lib/article.test.ts` exits 0.
- Real path verify: Task 4 build emits article HTML with `id="h-0"` anchors.
- Manual/device verify: none.

**Steps:**
1. Implement `injectHeadingIds` with the REPL-verified single regex pass:
   ```ts
   export interface TocEntry { id: string; level: number; text: string; }
   export function injectHeadingIds(html: string): { html: string; toc: TocEntry[] } {
     const toc: TocEntry[] = [];
     let i = 0;
     const out = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_m, lvl: string, inner: string) => {
       const id = `h-${i++}`;
       toc.push({ id, level: Number(lvl), text: inner.replace(/<[^>]+>/g, '').trim() });
       return `<h${lvl} id="${id}">${inner}</h${lvl}>`;
     });
     return { html: out, toc };
   }
   ```
2. Implement `selectAdjacent(orderedDescSlugs, current)` returning `{ newer, older }` per the test contract.

**Verify:**
Run: `cd packages/web && npx vitest run src/lib/article.test.ts`
Expected: all green.
<!-- /section -->

<!-- section: task-3 keywords: writing, chips, year-archive, filter -->
### Task 3: /writing.astro page (chips · featured · year-grouped archive · client filter)

<!-- no-split: page is UI assembly + CSS + a small DOM-only filter script; testable logic lives in writing.ts (Task 1) which is unit-tested -->

**Depends on:** Task 1-impl
**Crystal ref:** [D-001] [D-002] [D-003] [D-004]

**Maps to Impact Map:** User path · Data path · Shared surfaces

**Files:**
- Create: `packages/web/src/pages/writing/index.astro`
- Modify: `packages/web/src/pages/index.astro` (repoint Home "全部文章" link `/` → `/writing`; line ~181)

**Expected outcome:** `/writing` builds and renders: hero (spine `00 Writing`), topic chips (top-frequency categories + 全部) and a `全部分类 →` link to `/categories`, a featured latest-post card, and a year-grouped archive (newest-2 years full rows, older compact). Clicking a chip hides/shows rows in place; year headers with no visible rows hide.

**Non-goals:**
- No pagination (Phase 7). No `/categories` restyle. No server `?category=` route.
- Featured card excluded from filtering (no `data-cat`), stays fixed.

**Touched surface:** new page; one-line link change in `index.astro`.

**Regression shield:** Home build/render unchanged except the one link target; `npx astro check` stays at 0 errors.

**Design ref:** Writing.html (`.topics`/`.chip-f`, `.post-feat`, `.list`/`.item.post`, `.viewall`)
**Expected values:** chips use `.chip-f`/`.chip-f.sel`; featured uses `.post-feat` with `.tag`/`.pdate`/`h2`/`.rmeta`/`.read-link`; rows use `.item.post` with `.pdate`/`.item-title`/`.item-sub`(full only)/`.item-meta`.
**Data flow:** `getPosts({status:'published',limit:10000})` + `getCategories()` + per-category `getPosts({category})` → `writing.ts` helpers + in-page post→slugs map → DOM.
**UX ref:** ⚠️ No UX ref: design doc has no `## UX Assertions` table (HTML prototype only).
**User interaction:** User scans latest + archive by year; taps a topic chip → list filters instantly without reload; taps 全部分类 → goes to the full category index.

**Task Contract:**
- Expected behavior: A reader sees the newest post featured, a short row of topic chips, and the rest of the writing grouped by year (recent years detailed, older years as tight one-liners); tapping a chip narrows the list immediately.
- Automated verify: `cd packages/web && npx astro check` → 0 errors; after a build, `grep -c 'class="item post' dist/writing/index.html` ≥ 100 and `grep -c 'chip-f' dist/writing/index.html` ≥ 6 and `grep -c 'data-cats' dist/writing/index.html` ≥ 100.
- Real path verify: `pnpm build` emits `dist/writing/index.html`; open it / grep year headers + `post-feat`.
- Manual/device verify: ⚠️ 需浏览器验证：chip 点击即时筛选 + 空年份标题隐藏的交互手感（留累积评审）。

**Steps:**
1. Frontmatter: fetch all published posts (`limit:10000`), sort desc by `publishedAt`. Build per-post category-slug map by looping `getCategories()` → `getPosts({status:'published', category: cat.slug, limit:10000})`, accumulating ALL slugs per post id into `Map<string,string[]>` (NOT first-only — 25 posts are multi-category). Also accumulate per-category published counts for `selectTopCategories(... , 6)`.
2. `featured = posts[0]`; `archive = posts.slice(1)`. `fullYears = selectFullYears(posts, 2)`. `groups = groupByYear(archive)`.
3. Render hero per Writing.html (spine `00`/`Writing`/note; eyebrow; `h1 写作`; lede). Render `.topics`: a `全部`(`data-cat="all" sel`) chip + one `.chip-f` per `selectTopCategories(...)` with `data-cat={slug}` and decoded name; after chips, a `.viewall`-style `全部分类 →` link to `/categories`.
4. Render featured as `.post-feat` (tag `最新 · Featured`, mono date via `formatMonoDate`, title, excerpt/stripMarkdown, `.rmeta` with read-time + first category, `继续阅读` link) → href `/posts/{featured.slug}`. No `data-cat`.
5. Render archive: for each year group output a year heading element (e.g. `<div class="year-head"><span class="mono">{year}</span></div>`) then its rows. Each row `<a class="item post {density}" data-cats={slugs.join(' ')} href="/posts/{slug}">`. For `density==='full'`: date + title + excerpt + meta. For `compact`: a single-line grid (date + title + category meta, no excerpt). `density = densityForYear(year, fullYears)`.
6. Add a vanilla client `<script>` (no import needed): chip click → set `.sel`; for each `.item.post[data-cats]`, toggle `.hide` when `cat!=='all' && !data-cats.split(' ').includes(cat)`; then for each `.year-head`, hide it when it has no following visible `.item.post` before the next `.year-head`.
7. Scoped `<style>`: reuse Home's `.post`/`.pdate`/`.viewall` patterns; add `.topics`/`.chip-f`/`.chip-f.sel`, `.post-feat` (+`.tag`/`.read-link`), `.year-head`, `.post.compact` (grid `auto 1fr auto`, no `.item-sub`), `.hide{display:none}`. Mirror Writing.html values.
8. `index.astro`: change the Writing `全部文章` link `href="/"` → `href="/writing"` and drop the now-stale DP-002=B comment.

**Verify:**
Run: `cd packages/web && npx astro check`
Expected: 0 errors, 0 warnings (or pre-existing-only, documented).
<!-- /section -->

<!-- section: task-4 keywords: article, slug, toc, scroll-spy, progress, prose -->
### Task 4: /posts/[slug].astro rebuilt on Article design (rail · TOC · progress · prose · author · prev/next)

**Depends on:** Task 2-impl, Task 5, Task 6
**Crystal ref:** [D-005] [D-006] [D-007] [D-008] [D-009] [D-010]

**Maps to Impact Map:** User path · Data path · Existing consumers

**Files:**
- Modify: `packages/web/src/pages/posts/[slug].astro` (full rewrite, replaces serif layout)

**Expected outcome:** Every published post renders on the new Article template: left rail (meta + TOC scroll-spy + restyled share), top progress bar, dek/byline, `:global` prose (H2/H3 anchored, blockquote, code, lists, `◆` end-mark), author card, prev/next cards, comments below. No Cormorant/vermillion remains.

**Non-goals:**
- Does not change `marked` config beyond ID injection, nor comment/share behavior.
- Pull-quote/figure: render only when present in markdown (no fabricated content).

**Touched surface:** the article page template + its scoped/global styles + client script.

**Regression shield:** `getStaticPaths` still returns all 126 published slugs; build still emits every `/posts/[slug]` page.

**Design ref:** Article.html (`.art-wrap`/`.art-grid`, `.rail`/`.meta`/`.toc`/`.share`, `.progress`, `.reading`/`.cat`/`h1`/`.dek`/`.byline`, `.prose`, `.endmark`, `.author-card`, `.pn-nav`)
**Expected values:** progress bar `.progress` (2px, `var(--accent)`); `.toc a.active` left-border accent; prose `font-size:18px;line-height:1.95`; blockquote left-border accent; `.endmark` `◆` in accent; `h2{scroll-margin-top:96px}`.
**Replaces:** the existing serif article layout (back-link/`article-header`/`.prose` serif styles).
**Data flow:** `getPosts({status:'published',limit:10000})` → getStaticPaths (props: post + ordered slug list) → `marked.parse(post.content)` → `injectHeadingIds` → `{html, toc}` → DOM.
**Quality markers:** TOC entries === injected heading IDs (use `toc` for both anchors and `href`); progress bar reflects scroll; active TOC item updates on scroll; prose styled (not bare) via `:global`.
**UX ref:** ⚠️ No UX ref: no `## UX Assertions` table in design doc.
**User interaction:** Reader scrolls a long article; the top bar fills with progress; the left TOC highlights the current section; clicking a TOC entry smooth-scrolls; share buttons copy/share; prev/next move between articles; comments load below.

**Task Contract:**
- Expected behavior: Opening any article shows a magazine-style reading page — a sticky left index that highlights as you scroll, a thin progress bar at the top, clean new typography ending in ◆, and links to the previous/next pieces, with sharing and comments at the bottom.
- Automated verify: after build, for a sampled real slug `S`: `grep -q 'id="h-0"' dist/posts/S/index.html` (heading anchored) AND `grep -q 'class="progress"' dist/posts/S/index.html` AND `grep -q '◆' dist/posts/S/index.html` AND `grep -ci 'cormorant\|#c23a22' dist/posts/S/index.html` = 0.
- Real path verify: `pnpm build` emits all `/posts/[slug]`; inspect the sampled page for rail/TOC/prose.
- Manual/device verify: ⚠️ 需浏览器验证：滚动时进度条增长 + TOC 高亮跟随 + 平滑滚动 + 复制链接反馈（留累积评审）。

**Steps:**
1. Frontmatter: `getStaticPaths` fetches published posts (`limit:10000`), sorts desc by `publishedAt`, builds `orderedSlugs`, passes `props:{ post, orderedSlugs }` (and optional title/slug maps for prev/next labels — pass a `slugTitle: Record<slug,title>` too). Per page: `const { html, toc } = injectHeadingIds(marked.parse(post.content) as string)`; `const { newer, older } = selectAdjacent(orderedSlugs, post.slug)`; read-time via `estimateReadTime`; first category via a build-time reverse lookup OR pass through props (reuse `getCategories`+`getPosts({category})` map like `/writing`; acceptable build cost). dek = `post.excerpt || meta.description || stripMarkdown`.
2. Layout per Article.html inside BaseLayout slot: `<div class="art-wrap"><div class="art-grid"><aside class="rail">…</aside><article class="reading">…</article></div></div>`. Rail: `.meta` (发表于 mono date / 分类 / 阅读时长), divider, `<nav class="toc">` built from `toc` (`<a href={'#'+t.id} class:list={[{active:i===0}]} style={t.level===3?'padding-left:26px':''}>{t.text}</a>`), divider, restyled `<ShareButtons .../>`.
3. Progress bar: render `<div class="progress" id="progress"></div>` as a fixed-position element OWNED by this page (do NOT modify BaseLayout's nav). Style it `position:fixed;top:0;left:0;height:2px;background:var(--accent);z-index:60`.
4. `.reading`: `.cat` (first category · Essay-style label), `h1` title, `.dek`, `.byline` (avatar `N`, `norvyn · {formatDate}`), then `<div class="prose" set:html={html} />`, then `<div class="endmark">◆</div>`, `.author-card`, `.pn-nav` with prev(older)=上一篇 / next(newer)=下一篇 cards (omit a card if null).
5. Below the grid, render `<CommentSection postId={post.id} />` inside a hairline-separated container in the content column width.
6. Port the Article.html client `<script>` (vanilla): progress width on scroll; TOC scroll-spy (`offsetTop<=scrollY+120` → active); smooth-scroll on TOC click (`offsetTop-92`). Adapt selectors to this page. nav `.scrolled` is already handled by BaseLayout — do not duplicate.
7. Styles: put `.art-wrap`/`.art-grid`/`.rail`/`.toc`/`.progress`/`.reading`/`.byline`/`.author-card`/`.pn-nav` in scoped `<style>`; put ALL `.prose *` rules in `<style is:global>` (or `.prose :global(h2)` form) so `set:html` content is styled. Mirror Article.html values incl. `.prose h2{scroll-margin-top:96px}`.
8. Remove the old serif markup/styles entirely (back-link, article-header serif title, old `.prose`).

**Verify:**
Run: `cd packages/web && npx astro check`
Expected: 0 errors. (Full build + dist grep happens in test-changes.)
<!-- /section -->

<!-- section: task-5 keywords: share-buttons, hairline, rail -->
### Task 5: ShareButtons.astro restyle to circular hairline (rail variant)

⚠️ No test: style-only change; share logic (Twitter/WeChat/Copy handlers) is unchanged.

**Crystal ref:** [D-004]

**Maps to Impact Map:** Shared surfaces · Must remain unchanged (behavior)

**Files:**
- Modify: `packages/web/src/components/ShareButtons.astro`

**Expected outcome:** The three share controls (Twitter / WeChat / Copy) render as 34px circular hairline buttons matching Article.html `.share` (border `var(--line-2)`, hover accent), suitable for the narrow left rail. All three handlers still work.

**Non-goals:**
- Do not remove any of the three buttons (scope-guard: design showing 2 ≠ delete). Keep all share ACTIONS intact: Twitter intent URL, WeChat QR overlay, clipboard copy (+ execCommand fallback). The copy-success FEEDBACK presentation may change from text-swap to icon-swap (this is the only behavior-adjacent change, authorized so a 34px circle can show success without a text label).

**Touched surface:** component markup (drop `.share-label` + `#copy-text` span), scoped styles, and the copy-feedback lines + WeChat-overlay inline tokens in the `<script>`.

**Regression shield:** `grep -rn "ShareButtons" packages/web/src` shows only `posts/[slug].astro` imports it — confirm before editing; the `copy-link`/`wechat-share` element IDs, `data-url` attrs, Twitter anchor href, and the clipboard + QR-overlay actions stay intact (only the copy-success visual changes).

**Task Contract:**
- Expected behavior: In the article's left rail, sharing appears as small round icon buttons that highlight in the accent color on hover; copying a link still confirms, WeChat still shows the QR, Twitter still opens.
- Automated verify: `cd packages/web && npx astro check` → 0 errors; both handler targets preserved (`grep -q 'id="copy-link"' src/components/ShareButtons.astro` AND `grep -q 'id="wechat-share"' src/components/ShareButtons.astro`); component fully on new tokens (`grep -c 'var(--color-' src/components/ShareButtons.astro` = 0 AND `grep -c 'var(--font-sans)' src/components/ShareButtons.astro` = 0, incl. the WeChat-overlay innerHTML).
- Real path verify: rendered inside Task 4's article page.
- Manual/device verify: ⚠️ 需浏览器验证：复制成功的图标反馈 + 微信二维码弹层（留累积评审）。

**Steps:**
1. Confirm sole consumer: `grep -rn "ShareButtons" packages/web/src` (expect only `posts/[slug].astro`).
2. Replace the scoped CSS: style the shared **`.share-btn`** class — all three controls carry it; note Twitter is `<a class="share-btn">` (:14), NOT a `<button>`, so keying off `.share button` would leave Twitter unstyled. Circular per Article.html `.share button` visual: 34px, `border-radius:50%`, `border:1px solid var(--line-2)`, `color:var(--ink-3)`, hover → `var(--accent)` border+color; SVG ~14px.
3. Markup: drop the `分享` label (`.share-label`, :12) AND the copy button's text span (`<span id="copy-text">复制链接</span>`, :29) — a 34px circle holds only an icon. Keep all three controls, their element IDs (`copy-link`, `wechat-share`), `data-url`, and the Twitter anchor href.
4. Copy feedback: in the `<script>`, change the success feedback from `#copy-text` textContent-swap (:83-86) to an **icon swap** — replace the copy button's SVG with a checkmark (per Article.html:240) for ~1.4s, then restore the link icon. Keep the `navigator.clipboard.writeText` + `execCommand` fallback unchanged, and the WeChat QR overlay behavior unchanged.
5. Move the WeChat-overlay inline `innerHTML` styles (:106-109) off the legacy `--color-*`/`--font-sans` names onto new tokens (`--surface`/`--ink`/`--surface-2`/`--line`/`--font-ui`). Note: the legacy aliases DO resolve (defined at `BaseLayout.astro:306-318`), so this is consistency hygiene aligned with [D-004] — keeping the restyled component off the Phase-7-doomed alias layer — not a transparent-background fix.

**Verify:**
Run: `cd packages/web && npx astro check`
Expected: 0 errors.
<!-- /section -->

<!-- section: task-6 keywords: comment-section, hairline, tokens -->
### Task 6: CommentSection.astro restyle to hairline + zh-CN (logic unchanged)

⚠️ No test: style + copy change only; fetch/post/tree-render logic in the `<script>` is unchanged.

**Crystal ref:** [D-006]

**Maps to Impact Map:** Shared surfaces · Must remain unchanged (behavior)

**Files:**
- Modify: `packages/web/src/components/CommentSection.astro`

**Expected outcome:** Comments render in the new hairline style (new tokens, no Tailwind utility classes), with zh-CN restraint copy (评论 / 留下评论 / 提交), still loading approved comments and posting via the existing API.

**Non-goals:**
- Do not change the comment fetch/post endpoints, the moderation flow, or the reply-tree structure. No backend changes.

**Touched surface:** component markup (remove Tailwind classes, add semantic classes), add a scoped `<style>`, translate copy; the `<script>` logic stays (selectors/IDs preserved; the inline `renderComment` string template restyled with new tokens).

**Regression shield:** `grep -rn "CommentSection" packages/web/src` shows only `posts/[slug].astro` imports it — confirm; `#comments`, `#comment-form`, `#comments-list`, `data-post-id`, `data-api-url`, input `name=` attributes preserved so the script + API contract stay intact.

**Task Contract:**
- Expected behavior: Below an article, comments show in a quiet hairline style with Chinese labels; readers can still read approved comments and submit a new one (which appears after moderation).
- Automated verify: `cd packages/web && npx astro check` → 0 errors; `grep -ci 'bg-white\|text-gray\|rounded-lg\|md:grid-cols' src/components/CommentSection.astro` = 0 (Tailwind classes removed) AND `grep -q 'id="comment-form"'` AND `grep -q 'data-post-id'`.
- Real path verify: rendered in Task 4's article page; comment list loads from API.
- Manual/device verify: ⚠️ 需浏览器/接口验证：加载已审核评论 + 提交后「待审核」提示（留累积评审）。

**Steps:**
1. Confirm sole consumer: `grep -rn "CommentSection" packages/web/src`.
2. Replace Tailwind utility classes in markup with semantic class names; add a scoped `<style>` using new tokens + hairline borders (`1px solid var(--line)`), mono labels per the design's row language. Translate copy: `Comments`→`评论`, `Leave a comment`→`留下评论`, `Name/Email/Website/Comment`→`名字/邮箱/网站/评论`, `Submit`→`提交`, and the JS status/empty/error strings to zh-CN.
3. In the `<script>`, keep all logic; only restyle the `renderComment` HTML string (swap Tailwind classes for new-token inline styles / classes) and translate its text. Preserve all element IDs, `name=` attrs, `data-*`.
4. Verify no `bg-white`/`text-gray-*`/`rounded-*`/`md:grid-cols-*` remain.

**Verify:**
Run: `cd packages/web && npx astro check`
Expected: 0 errors.
<!-- /section -->

---

## Decisions

None. (All Phase-3 architecture/UX forks were resolved with the user this session and recorded as [D-001]–[D-010] in docs/11-crystals/2026-05-31-phase-3-visual-crystal.md: chips = top-frequency categories + 全部分类→/categories; archive grouped by year, newest-2-years full / older compact; featured = newest post outside the filter; share/comments kept and restyled per DP-002=A; index-based heading IDs; `:global` prose.)

---
## Verification
- **Verdict:** Approved (must-revise resolved, 1 cycle)
- **Date:** 2026-05-31
- **Verifier:** plan-verifier (opus) — `.claude/reviews/plan-verifier-2026-05-31-074414.md`. 5/6 tasks clean (T1/T2/T3/T4/T6); CF 10/10, DF 8/8, no scope violations.
- **Revision:** All 4 must-revise items were in Task 5 (ShareButtons). Fixed: (#1) circular style now keys off `.share-btn` (Twitter is an `<a>`, not `<button>`); (#4) dropped the `#copy-text` label + switched copy feedback to icon-swap + authorized the presentation change in Non-goals; (#2) migrated the WeChat-overlay inline tokens to new names + added a `var(--color-*)`/`var(--font-sans)` zero-grep gate.
- **Override:** Verifier item #3 (claim: `--color-*`/`--font-sans` are undefined → QR card transparent) was REJECTED on primary-source evidence — those aliases are defined at `BaseLayout.astro:306-318` (TRANSITION ALIASES, `<style is:global>`), confirmed by `grep -rn '--color-ink:' src/`. The verifier's `grep -c '--color-' src/ = 0` was a wrong-cwd artifact. Re-verification of the revised Task 5 was done in main context (findings are mechanical/objectively checkable; a second full Opus pass was disproportionate for a single-task revision and would have repeated the wrong-cwd grep).
