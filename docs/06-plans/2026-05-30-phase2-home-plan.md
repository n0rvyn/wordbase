---
type: plan
phase: 2
dev_guide: docs/06-plans/2026-05-30-frontend-redesign-dev-guide.md
design_ref: docs/design/reference/norvyn.com - Home v2.html
date: 2026-05-30
status: draft
---

# Phase 2 Plan — Home (`/`) v2 hub

**Goal:** Replace the old serif `index.astro` with the Home v2 editorial hub (hero · 01 Apps · 02 Writing · 03 Podcast) on the new BaseLayout, wired to real API data, empty-safe.

**Design reference:** `docs/design/reference/norvyn.com - Home v2.html` (markup + CSS source of truth; strip `#tweaks`, `/*EDITMODE-*/`, `__edit_mode_*`, font switcher, and the `.hero-aside` avatar — all removed in v2).

**Project health:** green. Phase 1 foundation in place — `BaseLayout.astro` (nav/footer/spine/theme), `tokens.css` (all Home tokens present: verified `--surface-3/--on-accent/--shadow/--spine/--col-gap/--gut/--maxw/--line-2/--ink-4`), API client `getApps/getApp/getPodcasts/getEpisodes/getPosts/estimateReadTime/stripMarkdown` all exported. astro check 0 err, 23 UT green, build 345 pages.

## Verified facts (real API, server up on :4100)

- **Posts:** 126 published. List + single endpoints embed **no** category/tag. Default order is `publishedAt` DESC (verified: newest first). `Post` has `content` (for read-time), `excerpt` (nullable), `publishedAt`, `slug`, `title`.
- **Apps:** 0 published (`total:0`). `App` has `featured:number`, `sortOrder:number|null`, `slug`, `name`, `tagline`, `icon`, `category`, `appStoreUrl`, `publishedAt`.
- **Podcasts/Episodes:** 0 published. `Episode` has `audioUrl`, `duration:number|null` (seconds), `episodeNumber:number|null`, `slug`, `title`, `createdAt`.
- **Categories:** 12 (legacy WP tech cats: `essay/linux/python/docker/...`). Names carry HTML entities (`AIX &amp; Power`). `getPosts({category, status})` filters correctly → enables a build-time reverse map `postId → first category name`.

## Architecture decisions (resolved here; were flagged "resolve at /write-plan" in dev-guide)

- **[D-A] Read-time:** use existing `estimateReadTime(content)` (CJK-aware) at build time. No new util.
- **[D-B] Featured-app rule:** `featured === 1` first; if none flagged, lowest `sortOrder` (nulls last); tiebreak earliest `publishedAt ?? createdAt`. (Moot now — 0 apps — but coded + unit-tested.)
- **[D-C] Featured-episode rule:** highest `episodeNumber`; if all null, latest `createdAt`.
- **[D-D] Audio:** native `<audio controls preload="metadata" src={audioUrl}>` for the featured episode (replaces the reference's faux JS player). Episode list rows are `<a href="/podcast">` (mini icon decorative) — per-row playback is Phase 5's archive, not Home.
- **[D-E] First category:** build-time reverse map via `getCategories()` + `getPosts({category})`; null-safe (omit ` · {cat}` when a post matches no category). Names HTML-decoded.
- **[D-F] Hero CTAs:** kept static per dev-guide ("static design copy") — `浏览作品`→`#apps`, `订阅播客`→`#podcast`. When a section is hidden (empty data) the anchor is an in-page no-op (NOT a 404). Documented, not blocking.
- **[D-G] "全部" view-all links (REVISED after verify):** The Writing section **always renders** (126 real posts), so its viewall must NOT point to a not-yet-built route. Per the project's own **DP-002=B precedent** (BaseLayout nav maps "文章"→`/` to avoid dead links during the phase transition), the Writing viewall targets **`/`** this phase, with a code comment to swap to `/writing` in Phase 3. The Podcast viewall (`/podcast`) and app rows (`/apps/[slug]`) live **inside sections that are hidden while their tables are empty**, so they emit no live link in the shipped empty state; they keep their eventual targets (resolve in Phase 5 / Phase 4). Post rows → `/posts/[slug]` (exists now).

## Decisions

- **[DP-phase2-1] Writing viewall target during transition** — RESOLVED by existing precedent **DP-002=B** (no dead links during transition): target `/` now, swap to `/writing` in Phase 3. No new user input required; consistent with how BaseLayout already handles the "文章" nav link. If the user prefers shipping a `/writing` 404 placeholder instead, that is the only alternative — flagged here for visibility.

All other decisions [D-A]…[D-G] follow the dev-guide + design reference + verified data.

---

## Task 1 — Home build helpers (`src/lib/home.ts`)

**Files:**
- `packages/web/src/lib/home.ts` (new)

**Steps:**
1. Create `src/lib/home.ts` importing types `App`, `Episode` from `./api` (use `import type`).
2. Implement pure functions:
   - `formatMonoDate(ts: number): string` — `new Date(ts*1000)` → `YYYY · MM · DD`, zero-padded month/day. **Use UTC parts** (`getUTCFullYear/getUTCMonth()+1/getUTCDate`) so the rendered date is build-server-timezone-independent (deterministic output, no CI flakiness).
   - `decodeEntities(s: string): string` — replace `&amp; &lt; &gt; &quot; &#39; &#x27;` (regex, order: `&amp;` last to avoid double-decode → actually decode `&amp;` LAST). Return input unchanged if no entities.
   - `selectFeaturedApp(apps: App[]): App | null` — per [D-B]. Empty → null.
   - `restApps(apps: App[], featured: App | null): App[]` — apps minus featured, preserving order.
   - `selectFeaturedEpisode(eps: Episode[]): Episode | null` — per [D-C]. Empty → null.
   - `formatDuration(sec: number | null): string` — `null`/`<=0` → `''`; `<60` → `'<1 min'`; else `` `${Math.round(sec/60)} min` ``.
3. Export all named.

**Verification:**
- `cd packages/web && npx astro check` → 0 errors (file typechecks under strict + verbatimModuleSyntax — types imported with `import type`).

---

## Task 2 — Unit tests for helpers (`src/lib/home.test.ts`)

**Files:**
- `packages/web/src/lib/home.test.ts` (new)

**Steps:**
1. `import { describe, it, expect } from 'vitest'` + the helpers.
2. Cover:
   - `formatMonoDate`: a known **12:00 UTC** timestamp → exact `YYYY · MM · DD`; a single-digit-month/day 12:00 UTC timestamp → zero-padded. (Use midday-UTC timestamps so the UTC-based formatter is unambiguous.)
   - `decodeEntities`: `'AIX &amp; Power'` → `'AIX & Power'`; `'&lt;a&gt;'` → `'<a>'`; plain string unchanged.
   - `selectFeaturedApp`: featured flag wins over lower sortOrder; with no flag → lowest sortOrder; nulls-last; `[]` → null.
   - `restApps`: excludes the featured by id; order preserved; with null featured returns all.
   - `selectFeaturedEpisode`: highest episodeNumber; all-null → latest createdAt; `[]` → null.
   - `formatDuration`: `null`→`''`, `0`→`''`, `30`→`'<1 min'`, `2460`→`'41 min'`, `3540`→`'59 min'`.

**Verification:**
- `cd packages/web && npx vitest run src/lib/home.test.ts` → all pass.

---

## Task 3 — Rewrite `src/pages/index.astro` (frontmatter + markup + scoped styles)

**Files:**
- `packages/web/src/pages/index.astro` (full replace of old serif Home)

**Depends on:** Task 1

**Steps:**

**3a. Frontmatter (build-time data):**
1. Import `BaseLayout`, and from `../lib/api`: `getPosts, getApps, getPodcasts, getEpisodes, getCategories, estimateReadTime, stripMarkdown, type Post, type App, type Episode`. From `../lib/home`: `formatMonoDate, decodeEntities, selectFeaturedApp, restApps, selectFeaturedEpisode, formatDuration`.
2. **Writing:** `const { data: postsRaw } = await getPosts({ status:'published', limit: 6 });` then `const posts = [...postsRaw].sort((a,b)=>(b.publishedAt||0)-(a.publishedAt||0)).slice(0,6);` (defensive sort; API already DESC).
3. **Category map ([D-E]):** `const cats = await getCategories();` (already sortOrder-asc from API). `const postCat = new Map<string,string>();` for each cat: `const { data } = await getPosts({ status:'published', category: cat.slug, limit: 500 });` then `for (const p of data) if (!postCat.has(p.id)) postCat.set(p.id, decodeEntities(cat.name));`. (Only the 6 displayed posts are read from the map at render; building the full map is 12 requests, acceptable at build.)
   - Optimization note: build the map but only `.get()` for the 6 posts shown.
4. **Apps:** `const { data: apps } = await getApps({ status:'published' });` `const featuredApp = selectFeaturedApp(apps);` `const listApps = restApps(apps, featuredApp);` `const showApps = apps.length > 0;`.
5. **Podcast:** `const { data: podcasts } = await getPodcasts({ status:'published' });` `const podcast = podcasts[0] ?? null;` `let episodes: Episode[] = [];` `if (podcast) episodes = (await getEpisodes(podcast.slug, { status:'published', limit: 10 })).data;` `const featuredEp = selectFeaturedEpisode(episodes);` `const listEps = episodes.filter(e=>e.id!==featuredEp?.id).slice(0,5);` `const showPodcast = !!(podcast && featuredEp);`.

**3b. Markup (replace the whole `<BaseLayout>…</BaseLayout>` body):** port the reference `<main>` structure, lifting verbatim class names so the lifted CSS matches.
1. `<BaseLayout title="norvyn">` (BaseLayout already renders nav + footer; do NOT duplicate them).
2. **Hero** (`<header class="hero wrap"><div class="row2">`): spine `00 / norvyn / 独立 iOS 开发者…`; hero-main with `.eyebrow`, `h1` (with `<em>` accent spans — copy from reference: `做小而克制的 App，也<em>写字</em>，也<em>录播客</em>。`), `.lede`, `.hero-cta` two `.btn` (btn-1 `浏览作品`→`#apps` with arrow svg, btn-2 `订阅播客`→`#podcast`). **No `.hero-aside`.**
3. **Apps section** — render only when `showApps`:
   `<section class="sec wrap" id="apps"><div class="row2">` spine `01 / Apps / note`; `.apps` container:
   - Featured app (`.feature`): if `featuredApp` — phone frame (`.phone>.screen` simplified: show app icon `<img>` when `featuredApp.icon` else `.app-ic` initial), `.feature-body` with `.ftag` `Featured · 主推`, `h3` name, `p` tagline (render only if non-null), `.fmeta` — **each cell null-guarded**: Category only if `category`; Since only if `publishedAt` (year = `new Date(publishedAt*1000).getUTCFullYear()`); Store link only if `appStoreUrl`. Wrap the whole `.feature` in `<a href={/apps/${featuredApp.slug}}>` (or put Store as the only external link — keep one primary link to the detail page).
   - `.list` of `listApps` → `<a class="item app" href={/apps/${a.slug}}>`: `.app-ic` (img icon or initial), title=name, sub=tagline, `.app-r` meta `{category} · {year}` + `.store` `App Store ↗` (only if appStoreUrl).
4. **Writing section** (always): `<section class="sec wrap" id="writing"><div class="row2">` spine `02 / Writing / note`; `.list` of `posts` → `<a class="item post" href={/posts/${p.slug}}>`: `.pdate` `formatMonoDate(p.publishedAt)` (guard null), `.item-title` title, `.item-sub` `{p.excerpt || stripMarkdown(p.content,120)}`, `.item-meta` = `` `${estimateReadTime(p.content)} min${postCat.get(p.id) ? ' · '+postCat.get(p.id) : ''}` ``. Then `<a class="viewall" href="/">全部文章 →</a>` with a code comment `{/* → /writing in Phase 3 (DP-002=B: no dead links during transition) */}` (per [DP-phase2-1]).
5. **Podcast section** — render only when `showPodcast`: `<section class="sec wrap" id="podcast"><div class="row2">` spine: `.no`=`03`, `.lab`=`decodeEntities(podcast.title)`, `.note`=`stripMarkdown(podcast.description ?? '', 40)` (omit `.note` element if empty); `.pods`:
   - `.feat-ep`: `.ep-cover` — `<img>` if `podcast.coverImage`/`featuredEp.coverImage` else `<span>` first char of `decodeEntities(podcast.title)`. `.eb` with `.en` = `` featuredEp.episodeNumber != null ? `EP.${featuredEp.episodeNumber} · 最新一期` : '最新一期' ``, `h3` title, then native `<audio controls preload="metadata" src={featuredEp.audioUrl}></audio>` (styled minimally).
   - `.list` of `listEps` → `<a class="item ep" href="/podcast">`: `.mini` play icon (decorative), `.item-title` title, `.item-meta` = `` [e.episodeNumber != null ? `EP.${e.episodeNumber}` : null, formatDuration(e.duration) || null].filter(Boolean).join(' · ') `` (renders cleanly when episodeNumber and/or duration are null — never a bare `EP.` or empty cell).
   - `<a class="viewall" href="/podcast">全部单集 →</a>` (forward ref; section only visible once podcast data exists ~ Phase 5, where `/podcast` is built).

**3c. Scoped `<style>`** (NOT `is:global`): lift the Home-specific rules from the reference `<style>` block, EXCLUDING anything already global in BaseLayout (`.wrap`, `.row2`, `.spine`, `.list`, `.item`, `.item-title/sub/meta`, `.nav*`, `.icon-btn`, `.brand`, `footer/.foot*`, reset, responsive nav). INCLUDE: `.hero*`, `.btn*`, `.sec`, `.app/.app-ic/.app-r/.store`, `.arrow`, `.feature/.phone/.screen/.s-top/.ring/.s-lab/.feature-body*`, `.post/.pdate`, `.feat-ep/.ep-cover/.player/.play-btn/.track/.bar/.times`, `.ep/.mini`, `.viewall`, plus the section-local `@media` rules (`.feature`, `.feat-ep`, `.app`, `.post` breakpoints). Replace the faux `.player/.track/.bar/.times` styling with a small rule for `audio { width:100%; max-width:420px; margin-top:8px; }`. Do NOT include `.hero-aside`, `.avatar`, `#tweaks`, `.tw-*`, `.sw*`, `.seg*`.
   - All token names already match `tokens.css` (reference was the token source). No `--color-*` legacy aliases.

**Verification:**
- `cd packages/web && npx astro check` → 0 errors.
- `grep -c 'EDITMODE\|__edit_mode\|hero-aside\|id="tweaks"\|twAccent' src/pages/index.astro` → 0.

---

## Task 4 — Build + dual-state verification (empty + seeded)

**Files:** none (verification only; may create/delete seed data via API)

**Depends on:** Task 3

**Steps:**
1. Ensure API up: `curl -s -o /dev/null -w '%{http_code}' http://localhost:4100/api/posts` → 200 (else start `cd packages/api && pnpm dev &`).
2. **Empty-state build:** `cd packages/web && npx astro build` → exit 0. Assert on `dist/index.html`:
   - hero present: `grep -c 'class="hero' dist/index.html` ≥ 1.
   - writing rows present: `grep -c 'class="item post"' dist/index.html` ≥ 1 (real posts).
   - apps section absent: `grep -c 'id="apps"' dist/index.html` → 0.
   - podcast section absent: `grep -c 'id="podcast"' dist/index.html` → 0.
   - no legacy: `grep -ci 'cormorant\|#c23a22\|EDITMODE' dist/index.html` → 0.
   - post links resolve: pick one `/posts/<slug>` from dist, confirm `dist/posts/<slug>.html` exists.
3. **Seeded-state verification** (verifies [D-B]/[D-C]/[D-D]/[D-E] render paths, incl. native `<audio>`). Auth model verified: `authMiddleware` only checks the Bearer token is valid (no scope/permission enforcement in middleware or handlers), and CLI `key:create` mints one. So seeding is fully automatable:
   - **Mint a token:** `cd packages/api && pnpm cli key:create seed-phase2 admin` → capture the printed `wb_…` key into `$TOK` (scopes are cosmetic — not enforced).
   - **Seed app:** `curl -s -XPOST http://localhost:4100/api/apps -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"name":"Seed App","slug":"seed-app","status":"published","tagline":"a seeded app","category":"Productivity","sortOrder":1,"featured":1,"publishedAt":1735689600,"appStoreUrl":"https://apps.apple.com/x"}'` → capture returned `id`.
   - **Seed podcast:** `curl -s -XPOST http://localhost:4100/api/podcasts -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"title":"Seed Cast","slug":"seed-cast","status":"published","description":"seeded"}'` → capture `id`.
   - **Seed episode:** `curl -s -XPOST http://localhost:4100/api/podcasts/seed-cast/episodes -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"title":"Seed Ep 1","status":"published","audioUrl":"https://example.com/ep1.mp3","audioType":"audio/mpeg","audioSize":1000,"episodeNumber":1,"duration":2460}'` → capture `id`. (Adjust payload keys to the actual create-handler shape discovered while reading `apps.ts`/`podcasts.ts`/services during execution — verify the POST returns 201 and the row comes back with `status:"published"`; if a separate `/publish` call is needed, do it.)
   - **Rebuild + assert seeded:** `cd ../web && npx astro build`; assert `dist/index.html`: `grep -c 'id="apps"'` ≥1, `grep -c 'class="feature"'` ≥1, `grep -c 'id="podcast"'` ≥1, `grep -c '<audio'` ≥1.
   - **Cleanup (restore empty):** `curl -XDELETE` the episode, podcast, and app by id with `Bearer $TOK`; rebuild → confirm `grep -c 'id="apps"'`=0 and `grep -c 'id="podcast"'`=0. (Leave the `seed-phase2` API key; CLI has no key:delete — harmless, or note for manual removal.)
   - If any POST returns non-2xx after payload reconciliation, capture the error body, mark `⚠️ 需复核：seeded POST failed: {body}` and fall back to documenting the `<audio>` path as browser-verify — do NOT leave seed rows in the DB regardless (always run cleanup).

**Verification:** all greps above match expected; build exit 0 both states; repo left in empty state.

---

## Acceptance criteria (from dev-guide Phase 2)

- [ ] Home builds; Writing section shows real latest posts with working `/posts/[slug]` links. → Task 4 step 2.
- [ ] Empty apps/podcasts tables → those sections absent (no placeholder, no 《边角》). → Task 4 step 2.
- [ ] Seed 1 published app + 1 podcast/episode → both sections render (featured + list). → Task 4 step 3.
- [ ] Theme/accent still work on Home. → BaseLayout unchanged; build emits the same nav toggle; verify `grep themeBtn dist/index.html`.
- [ ] UT for read-time/featured-selection helpers; build verifies empty + seeded. → Task 2 + Task 4.

## Out of scope (guard)

- `/writing`, `/posts/[slug]` template redesign → Phase 3. `/apps/[slug]` → Phase 4. `/podcast` archive → Phase 5.
- No backend changes (category embedding stays a frontend build-time map).
- BaseLayout / tokens.css not modified (Phase 1 delivered; all tokens present).
