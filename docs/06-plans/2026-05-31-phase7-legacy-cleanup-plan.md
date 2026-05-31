---
type: plan
phase: 7
project: norvyn.com Frontend Redesign
dev_guide: docs/06-plans/2026-05-30-frontend-redesign-dev-guide.md
created: 2026-05-31
contract_version: 1
---

# Phase 7 Plan — Legacy aux pages + old-layout cleanup + site-wide nav/footer wiring

**Project health:** yellow (doc-drift, module_size, churn) — pre-existing, none block. Web frontend only.

**Goal:** Migrate every remaining old-design page to the new spine+hairline system, wire the site to the final IA (Apps·Writing·Podcast nav; /writing /podcast /about reachable from chrome), add the missing `/apps` index page, and delete the transition-alias scaffolding so no page depends on old token names. After this phase the whole site is one design system.

**Scope (confirmed with user 2026-05-31):**
1. **Nav IA** → `Apps · Writing · Podcast` (English mono labels per Home v2 ref) + theme toggle. Brand → `/`. About reachable via footer 关于 (already wired). Old blog nav (文章/分类/标签/归档) retired.
2. **`/apps` index page (NEW)** — parallels /writing & /podcast. `getApps({status:'published'})`, spine + featured + `.item.app` list, empty-safe. nav `Apps→/apps`; home `#apps` gets「全部作品 →/apps」.
3. **Footer** → Navigate: 作品→/apps, 写作→/writing, 播客→/podcast, 关于→/about. New「更多」col: 分类→/categories, 标签→/tags, 归档→/archives (so they aren't orphaned). Elsewhere unchanged (Email/GitHub).
4. **Migrate 8 pages** to new design (spine+hairline, direct tokens, reuse /writing & home patterns):
   - alias-based (5): `archives.astro`, `categories/index.astro`, `tags/index.astro`, `page/[page].astro`, `404.astro`
   - Tailwind-based (3): `categories/[slug].astro`, `tags/[slug].astro`, `[slug].astro` (generic CMS page — ⚠️ AI-added, user-approved)
5. **Cleanup** — after all consumers migrated, delete the entire transition-alias block (BaseLayout.astro:298–321) once `grep` across ALL of `src/` (incl admin) shows 0 consumers.
6. **Verify** all nav/footer links resolve across the built site (no dangling old routes).

**Out of scope:** admin pages (AdminLayout/Tailwind, separate system); companion-page content model (Phase 8). The generic `[slug]` route is restyled only — its CMS/MCP authoring stays Phase 8.

## Decisions

- **[D-001]** Nav = Apps·Writing·Podcast (3, English mono), About via footer only — matches Home v2 reference nav-r (`#apps/#writing/#podcast`, no About). Confirmed over the dev-guide Phase 1 "+About" wording.
- **[D-002]** Build `/apps` index (not `/#apps` anchor) — IA consistency with /writing & /podcast (home section previews + standalone index); future-proofs the growing app catalog (1 published now, 8 ASC drafts). Home `#apps` section gains a「全部作品 →/apps」viewall mirroring Writing/Podcast.
- **[D-003]** 分类/标签/归档 demoted from nav → footer「更多」column (not deleted, not orphaned). Reachable there + from /writing (chips +「全部分类」).
- **[D-004]** Aux-page design is derived from the EXISTING system (no design ref exists; DP-001=A authorized spine+hairline). Reuse verbatim: `/writing` `.item.post`/year-group/`.list` language for all post-lists; home/App-Detail `.item.app` for /apps; tokens.css `.prose` for the generic page; "hairlines not boxes" → category/tag cards become hairline rows/pills, not boxed cards.
- **[D-005]** Migrate ALL pages this phase → the transition-alias block is fully deletable (not partially). Grep-gated delete (Task 10).
- **[D-006]** `.prose` element typography (h2/blockquote/code/img/...) currently lives only in `posts/[slug].astro`'s `<style is:global>` (loads only on /posts). The generic `[slug]` CMS page needs the same styling. Rather than duplicate the rules (base-layer drift, forbidden), extract them to a shared `src/styles/prose.css` imported by BOTH pages — single source for prose typography. Container `.prose` stays in tokens.css. (Touches the reviewed article page → gated by an article-regression dist+test check in Task 9.)

## Impact Map

| Change | Direct file(s) | Blast radius |
|---|---|---|
| Nav + footer IA | `BaseLayout.astro` | ALL pages (shared layout). Nav `navItems` array + footer cols. Structural-ish (footer +1 column) — verify every page's footer still lays out. |
| New /apps | `pages/apps/index.astro` (new) | +1 route. `getApps` build fetch (same as home/podcast). |
| Home viewall | `pages/index.astro` | Home `#apps` section only — additive link. |
| 8 page migrations | each page's own file | Each self-contained (scoped `<style>`). No cross-page coupling. |
| Delete alias block | `BaseLayout.astro:298–321` | Removes `--color-*`/`--font-sans`/`--content-*` globals. SAFE ONLY after all 8 migrated — grep-gated. |

---

## Task 1 — BaseLayout: nav IA + footer rewiring

**Files:** `packages/web/src/layouts/BaseLayout.astro`

**Task Contract:**
- Precondition: navItems = 文章/分类/标签/归档; footer Navigate 作品/写作/播客→/, 关于→/about; Elsewhere Email/GitHub.
- Postcondition: nav = Apps→/apps, Writing→/writing, Podcast→/podcast (English labels, isActive by path prefix); footer Navigate 作品→/apps,写作→/writing,播客→/podcast,关于→/about; new「更多」col (分类→/categories,标签→/tags,归档→/archives); Elsewhere unchanged. astro check clean.

**Steps:**
1. Replace `navItems` array:
   - `{ href: '/apps', label: 'Apps', isActive: currentPath.startsWith('/apps') }`
   - `{ href: '/writing', label: 'Writing', isActive: currentPath.startsWith('/writing') }`
   - `{ href: '/podcast', label: 'Podcast', isActive: currentPath.startsWith('/podcast') }`
   Drop the old 4 + their transition comments.
2. Footer Navigate col: 作品 `href="/apps"`, 写作 `href="/writing"`, 播客 `href="/podcast"`, 关于 `href="/about"` (already correct).
3. Add a new `.foot-col`「更多」between Navigate and Elsewhere: `<a href="/categories">分类</a><a href="/tags">标签</a><a href="/archives">归档</a>`.

**Verify:** build; grep any `dist/*.html`: nav has `href="/apps"` + `>Apps<`/`>Writing<`/`>Podcast<`; footer has 分类/标签/归档 + 写作→/writing, 播客→/podcast; 0 nav `href="/categories"` in the top `.nav-r` (moved to footer).

## Task 2 — New /apps index page

**Files:** `packages/web/src/pages/apps/index.astro` (new)

**Task Contract:**
- Precondition: only `/apps/[slug]` exists; `getApps` available in api.ts.
- Postcondition: `/apps` builds → `dist/apps.html` (file format); lists published apps as `.item.app` rows; empty-safe (0 published → quiet state, build still succeeds). astro check clean.

**Steps:**
1. Frontmatter: `getApps({ status: 'published' })`. Sort featured-first then sortOrder (reuse the same selection the home `#apps` uses — check `index.astro` / `src/lib/home.ts` or `app.ts` for the existing helper; reuse, don't reimplement).
2. Markup: BaseLayout `title="Apps"`. Spine `00 / Apps / 我做的小而克制的应用。`. Hero (`.eyebrow` + `<h1>作品</h1>` + `.lede`). Then a `.list` of `.item.app` rows (icon | name+tagline | meta/store), each linking `/apps/[slug]` — copy the `.item.app` row markup + styles from the home `#apps` section (read `index.astro`) so it's byte-consistent.
3. Empty-safe: 0 published → `<div class="empty">作品即将上线。</div>` (mirror podcast.astro empty pattern), no fake rows.
4. Scoped `<style>`: `.sec`/`.eyebrow` (local, per page precedent) + the `.app`/`.app-ic`/`.app-r`/`.store` rules (reuse from home or app-detail.css patterns). Reuse global `.lede`? use `.lede` from tokens or local `.lede-w` like writing — match writing's choice.

**Verify:** build → `dist/apps.html` exists; lists Delphi (`/apps/delphi-认识你自己` link present); 0 alias tokens; astro check clean. (Currently 1 published app → 1 row.)

## Task 3 — Home #apps「全部作品 →/apps」viewall

**Files:** `packages/web/src/pages/index.astro`

**Task Contract:**
- Precondition: home `#apps` section has no viewall link (unlike writing/podcast which link to their index).
- Postcondition: `#apps` section has a `.viewall`「全部作品 →/apps」link, only when apps section renders (≥1 published app). No change when section hidden.

**Steps:**
1. Read `index.astro`, locate the `#apps` section. Its structure differs from writing/podcast (apps live in a `.apps`/`.list` container, not the same wrapper) — place `<a class="viewall" href="/apps">全部作品 →</a>` according to the ACTUAL `#apps` markup (typically inside the `#apps` section after its `.list`, where writing/podcast put their viewall), reusing the existing `.viewall` style. Confirm placement against the real markup, not assumed parallelism.

**Verify:** build; `dist/index.html` `#apps` block contains `href="/apps"` viewall (since Delphi published). With 0 apps the section + link are both absent.

## Task 4 — Migrate /archives → spine + year timeline

**Files:** `packages/web/src/pages/archives.astro`

**Task Contract:**
- Precondition: uses transition aliases (`--color-*`, `--font-sans`); old timeline design.
- Postcondition: spine `00 / Archive` + year-group `.list` of `.item.post` rows; ALL tokens direct (0 `--color-*`/`--font-sans`); no Cormorant/#c23a22. astro check clean.

**Steps:**
1. Reuse `/writing` archive structure: spine (`00`/`Archive`/note) + per-year `.year-head` + `.list` of `.item.post` compact rows (date · title · category). No chips/featured (archives = pure timeline). Reuse `groupByYear`/`formatMonoDate` from existing libs.
2. Replace every alias token with its direct token (`--color-ink`→`--ink`, `--color-rule`→`--line`, `--color-vermillion`→`--accent`, `--font-sans`→`--font-ui`, etc.). Scoped `<style>` ported from /writing's `.item`/`.year-head`/`.list`.

**Verify:** build; `dist/archives.html`: 0 matches for `--color-|--font-sans|cormorant|c23a22`; spine `class="no"` present; post rows link `/posts/`.

## Task 5 — Migrate /categories/index → hairline rows

**Files:** `packages/web/src/pages/categories/index.astro`

**Task Contract:**
- Precondition: card grid using aliases.
- Postcondition: spine `00 / Categories` + `.list` of `.item` rows (category name + post count + arrow), hairlines not cards; direct tokens only. astro check clean.

**Steps:**
1. Spine hero (`00`/`Categories`/note). Convert the card grid → `.item` rows: each `<a class="item" href="/categories/[slug]">` with `.item-title` (name), `.item-meta` (count), `.arrow`. Reuse `.item` language from /writing/BaseLayout.
2. Strip alias tokens → direct.

**Verify:** build; `dist/categories.html`: 0 `--color-|--font-sans`; `.item` rows link `/categories/`; arrow markup present.

## Task 6 — Migrate /tags/index → token-styled pill cloud

**Files:** `packages/web/src/pages/tags/index.astro`

**Task Contract:**
- Precondition: pill cloud using aliases.
- Postcondition: spine `00 / Tags` + pill cloud styled with `.chip-f`-like tokens (links, not buttons); direct tokens only. astro check clean.

**Steps:**
1. Spine hero. Keep the pill-cloud affordance (tags are many) but restyle pills like `/writing`'s `.chip-f` (mono, hairline border, pill radius) as `<a href="/tags/[slug]">` links. Strip aliases → direct.

**Verify:** build; `dist/tags.html`: 0 `--color-|--font-sans`; pill links → `/tags/`.

## Task 7 — Migrate /categories/[slug] + /tags/[slug] → spine + post list

**Files:** `packages/web/src/pages/categories/[slug].astro`, `packages/web/src/pages/tags/[slug].astro`

**Task Contract:**
- Precondition: pure Tailwind (`text-blue-600`, `bg-white`, `rounded-lg`...), no tokens.
- Postcondition: both = spine (`00` / term name) + `.item.post` archive rows (reuse /writing); 0 Tailwind utility classes; direct tokens only. astro check clean.

**Steps:**
1. Both share one shape: spine (`00`/term type/term name as note) + hero (`.eyebrow` term-type, `<h1>` term name, optional description `.lede`) + `.list` of `.item.post` rows for the filtered posts (date · title · excerpt · read-time · category) — copy /writing's full-density `.item.post` row markup + scoped styles.
2. Remove ALL Tailwind classes; replace with token-based scoped `<style>`. Keep the back-link as a styled element (or rely on nav/footer).

**Verify:** build a sample of each (`dist/categories/<slug>.html`, `dist/tags/<slug>.html`): 0 `text-gray-|text-blue-|bg-white|rounded-lg|shadow-sm`; `.item.post` rows link `/posts/`; spine present.

## Task 8 — Migrate /page/[page] pagination → spine + post list + prev/next

**Files:** `packages/web/src/pages/page/[page].astro`

**Task Contract:**
- Precondition: alias-based paginated list.
- Postcondition: spine + `.item.post` rows + hairline prev/next pager; direct tokens only. astro check clean.

**Steps:**
1. Spine hero (`00` / `Page N`). `.list` of `.item.post` full-density rows (reuse /writing). Prev/next as mono hairline links (`.viewall`-style or a small pager). Strip aliases → direct.

**Verify:** build (`dist/page/2.html` if ≥2 pages): 0 `--color-|--font-sans`; `.item.post` rows; prev/next links resolve.

## Task 9 — Migrate /404 + /[slug] generic page → new tokens (+ extract shared prose.css)

**Files:** `packages/web/src/pages/404.astro`, `packages/web/src/pages/[slug].astro`, `packages/web/src/styles/prose.css` (new), `packages/web/src/pages/posts/[slug].astro` (consolidation edit)

**Task Contract:**
- Precondition: 404 uses aliases; `[slug]` uses Tailwind (`text-4xl`, `prose prose-lg`). The rich `.prose` descendant rules (h2/h3/a/ul/ol/li/blockquote/code/pre/img/hr/p/strong) live ONLY in `posts/[slug].astro`'s `<style is:global>` (lines ~449–545+), so they load only on `/posts` pages — the bare global `.prose` (tokens.css:155) is container-only.
- Postcondition: 404 = centered new-token error block; `[slug]` = spine + fully-styled `.prose` body; `prose.css` is the single source of `.prose` element typography, imported by BOTH `[slug].astro` and `posts/[slug].astro`; a real article still renders byte-identical prose. 0 aliases, 0 Tailwind. astro check clean; vitest + Phase-3 article assertions still green.

**Steps:**
1. **404.astro:** restyle the existing error block (code/title/message/home link) with direct tokens (`--ink`/`--ink-3`/`--accent`/`--font-display`/`--font-mono`). Centered, minimal — no spine needed (error page). Replace all alias tokens.
2. **Extract `src/styles/prose.css` (base-layer consolidation — [D-006]):** byte-copy the `.prose <element>` descendant rules from `posts/[slug].astro`'s `<style is:global>` block (the `.prose > p`, `.prose h2/h3`, `.prose a/strong`, `.prose ul/ol/li`, `.prose blockquote(+p)`, `.prose code/pre/pre code`, `.prose img`, `.prose hr` rules) into `prose.css`. Do NOT move the container `.prose` base (that stays in tokens.css:155 — avoid a duplicate container declaration; if the article's line-450 `.prose` adds anything beyond tokens.css, fold the delta into prose.css as `.prose { ... }` additions, but keep it single-source).
3. **posts/[slug].astro:** add `import '../../styles/prose.css';` to frontmatter; DELETE the now-extracted `.prose *` descendant rules from its `<style is:global>` block (leave any non-`.prose` global rules intact). This removes the duplication rather than creating a second copy.
4. **[slug].astro:** add `import '../styles/prose.css';`; wrap content in spine `00` + hero `<h1>{title}</h1>` + `<div class="prose" set:html={...}>`. Strip ALL Tailwind classes.

**Verify:**
- `dist/404.html`: 0 `--color-|--font-sans`.
- **Article regression (critical):** build; pick a real article `dist/posts/<slug>.html` and grep its loaded CSS for `.prose blockquote` / `.prose h2` / `.prose code` / `.prose img` — all must still be present (prose styling preserved post-extraction). `npx vitest run` (article.test.ts) green; astro check 0 err.
- `[slug]`: if a published CMS page exists, `dist/<slug>.html` has `.prose` + 0 `text-4xl|prose-lg|text-gray-`; else log "no published CMS page to assert — [slug] template built, runtime unverified".

## Task 10 — Delete transition-alias block + full link-resolution verify

**Files:** `packages/web/src/layouts/BaseLayout.astro`

**Task Contract:**
- Precondition: Tasks 1–9 done; no page should consume `--color-*`/`--font-sans`/`--content-*`/`--font-body` anymore.
- Postcondition: alias block (BaseLayout.astro:298–321) deleted; full build succeeds; 0 consumers of any alias name across `src/` (incl admin); all nav/footer links resolve to emitted routes.

**Steps:**
1. **Grep gate (BLOCKING):** `grep -rnE '\-\-color-(ink|paper|vermillion|rule)|\-\-font-sans|\-\-font-body|\-\-content-(width|wide|padding)' packages/web/src | grep -v 'BaseLayout.astro'` → expect **0** (the `grep -v BaseLayout.astro` excludes the alias-definition lines themselves, which would otherwise false-fail the gate). If any line remains, do NOT delete — report the file:line (a migration missed a consumer).
2. Delete the `:root { /* TRANSITION ALIASES ... */ ... }` block (lines ~298–321, the whole aliases `:root`).
3. **Link-resolution verify:** build; for each nav (/apps /writing /podcast) + footer (/apps /writing /podcast /about /categories /tags /archives) href, assert the corresponding `dist` file exists. List any dangling.

**Verify:** `pnpm build` succeeds; grep gate returns 0; every nav/footer target route file exists in dist; `grep -rciE 'cormorant|#c23a22' packages/web/src/pages` = 0.

---

## Phase-level acceptance (dev-guide Phase 7)

- [ ] archives/categories/tags/pagination render on the new design. → Tasks 4–8 + dist asserts.
- [ ] grep: no page importing old serif BaseLayout style; no dead Cormorant/#c23a22; no page consuming transition aliases. → Task 10 grep gate (0).
- [ ] Full site build succeeds; all nav/footer links resolve. → Task 10 link-resolution.
- [ ] Build verify across all routes. → final build (expect ~350 pages, +1 /apps).

## Test strategy

- **No new pure logic expected** (migrations reuse tested helpers: groupByYear, formatMonoDate, getApps/getPosts/getCategories/getTags, selectTopCategories). If /apps needs a new selection helper, add it to a lib + a falsifiable UT; otherwise reuse.
- **Build/dist assertions per page:** 0 alias tokens, 0 Tailwind utilities, 0 Cormorant/#c23a22, new spine/`.item` markup present, links resolve.
- **Regression:** full vitest stays green (currently 122); astro check 0 err/0 warn.
- **Link-resolution sweep** (Task 10): every chrome link → an emitted dist route.
