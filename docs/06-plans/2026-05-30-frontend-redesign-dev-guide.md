---
type: dev-guide
status: active
tags: [frontend, astro, design-system, redesign, dark-mode]
refs: [docs/design/reference/DESIGN-SYSTEM.md, docs/design/reference/colors_and_type.css, docs/design/app-sync-decision.md]
current: true
confirmed_at: 2026-05-30T19:45:00
---

# norvyn.com Frontend Redesign Development Guide

**Design system (source of truth):** docs/design/reference/ — `colors_and_type.css` (token contract), `DESIGN-SYSTEM.md` (voice/principles), 5 reference pages (Home v2 / App Detail / Writing / Article / About) + `preview/` spec cards. Podcast.html is absent → built fresh from Home's `.feat-ep`/`.ep` patterns.
**App data sources:** docs/design/app-sync-decision.md
**Backend:** packages/api (ready) — GET /api/posts, /api/posts/:idOrSlug, /api/apps, /api/apps/:slug, /api/podcasts, /api/podcasts/:slug/episodes, /api/podcasts/:slug/feed.xml. apps table has sync columns (category/version/rating/screenshots/releaseDate/...).

## Global Constraints

- **Tech stack:** Astro 4 (SSG, output static → dist/), @astrojs/tailwind (admin only) + @astrojs/preact, build-time top-level `await` data fetch in page frontmatter. Served by Caddy from packages/web/dist; API `triggerBuild()` runs `cd packages/web && pnpm build` (build.service.ts:44).
- **Design contract:** tokens live in ONE place (`colors_and_type.css` lifted to a global stylesheet). Default accent Indigo `#3457B6` (dark `#7088FF`). Theme switched via `[data-theme="light"|"dark"]` on `<html>`/`<body>`. Hairlines not boxes; left index spine; one accent; color-from-app-art only.
- **Kept interactivity:** light/dark toggle (nav moon/sun) + accent picker (5 swatches, placed on About page). Font is FIXED to Geist — no font switcher. Shared `localStorage['norvyn-v2']` (keys: `theme`, `accent` only). Strip every `__edit_mode_*` postMessage and the `/*EDITMODE-*/` blocks and the floating `#tweaks` panel.
- **Voice (DESIGN-SYSTEM.md):** first-person zh-CN, restraint (克制), honest, NO emoji. English mono labels over Chinese human copy. Dates render mono `2026 · 05 · 21`. `◆` ends an essay.
- **Empty-safe rendering:** apps/podcasts tables are currently EMPTY. Any section/page with no published data hides the block or shows a quiet empty state — never placeholder/fake data. posts has 128+ real articles.
- **Replacement, not coexistence:** the new design fully replaces the old serif + vermillion (`#c23a22` / Cormorant) BaseLayout. No two-theme coexistence.

---

<!-- section: phase-1 keywords: tokens, baselayout, theme-toggle, api-client, spine -->
## Phase 1: Shared Foundation (tokens · BaseLayout · API client)

**Status:** ✅ Completed — 2026-05-30

**Goal:** A new global stylesheet (tokens), a new BaseLayout (nav + footer + spine grid + theme/accent persistence, Geist fixed, no edit-mode), and an extended API client — the dependency every page page builds on. No standalone new page yet, but the shell (nav/footer/theme toggle) is visible and the site still builds.
**Depends on:** None
**Scope:**
- Lift `colors_and_type.css` into a global stylesheet imported once (e.g. `src/styles/tokens.css`), default accent `#3457B6`.
- New `BaseLayout.astro` (replace old serif one): sticky blurred nav with brand+dot, nav links (Apps→/#apps or /apps, Writing→/writing, Podcast→/podcast, About→/about), moon/sun theme toggle; spine grid helpers (`.row2`/`.spine`); footer (Navigate + Elsewhere cols, "Built with Wordbase"); inline theme/accent bootstrap script reading `localStorage['norvyn-v2']` (theme+accent only), no FOUC; Geist/Geist Mono/Noto Sans SC/Newsreader from Google Fonts.
- Strip Tweaks floating panel, font switcher, and all `__edit_mode_*`/`EDITMODE` plumbing from the reference markup as it's ported.
- Extend `src/lib/api.ts`: add `getApps({status})`, `getApp(slug)`, `getPodcasts({status})`, `getEpisodes(slug,{status})` following the existing `fetchApi` pattern (API_URL line 1).

**用户可见的变化:**
- 站点顶部出现新的导航栏(品牌 norvyn + 圆点、Apps/Writing/Podcast/About、右侧月亮/太阳明暗切换),底部出现新页脚。整体从衬线+朱红变成 Geist+靛蓝、可明暗切换。具体内容页还是下一阶段的事,但外壳已是新样子。

**Architecture decisions:** Where the global token stylesheet lives and how it's imported (global import vs BaseLayout `<style is:global>`); how theme/accent bootstrap avoids FOUC (inline head script vs Astro directive); whether spine/`.item` row CSS is global utility classes or per-page — to resolve at /write-plan.

**Acceptance criteria:**
- [x] `cd packages/web && pnpm build` succeeds; dist/ generated. (API server up; exit 0, 59 pages)
- [x] New BaseLayout renders nav + footer; default accent is `#3457B6` (dist/index.html: 14 new-design markers, 0 Cormorant). 明暗切换持久逻辑抽到 `src/lib/theme.ts`(语义单一来源),toggle script 改 bundled module 复用之,bootstrap 仍 `is:inline`(镜像注释)。`theme.test.ts` 15 项 UT 覆盖解析/merge/toggle/默认值 + 跨 reload round-trip(全过)。无 FOUC 由结构保证(`is:inline` 在 `<head>` 先于 body paint)。
- [x] No `__edit_mode_*` / `EDITMODE` / floating `#tweaks` / font-switcher in BaseLayout (grep 0 命中).
- [x] `api.ts` exports getApps/getApp/getPodcasts/getEpisodes; **全仓 astro check clean (0 err)**。原 354 errors 全是 `src/components/admin/*.tsx` 的 `ts(7026) JSX.IntrinsicElements` —— 根因 `tsconfig.json` 缺 Preact JSX 配置(继承 base 的 `jsx:"preserve"` 无 `jsxImportSource`)。修:加 `"jsx":"react-jsx"` + `"jsxImportSource":"preact"` → 354→0。
- [x] UT pass for api.ts additions (api.test.ts 8/8 pass: URL/query/null-catch + getPosts regression).

**Review checklist:**
- [x] run-phase review step — main-context verified (DP-002=B nav 0 dead links; TRANSITION aliases 防旧页掉色; 旧 props 兼容 10 importer)
- [ ] design-reviewer (new layout shell) — deferred: 真机/浏览器视觉确认留待累积评审

<!-- /section -->

---

<!-- section: phase-2 keywords: home, hero, apps-section, podcast-section, writing-section -->
## Phase 2: Home (/)

**Status:** ✅ Completed — 2026-05-30

**Goal:** `index.astro` reimplemented as the Home v2 hub (hero · apps 01 · writing 02 · podcast 03) on the new BaseLayout, wired to real API data, empty-safe.
**Depends on:** Phase 1
**Scope:**
- Hero (00): static design copy (H1 with accent `<em>`, lede, two CTAs). No hero-aside avatar (removed in new Home v2).
- Apps section (01): featured app (sortOrder first / featured flag) with phone frame; `.item.app` list from `getApps({status:'published'})`. Hide whole section if no published apps. App rows link to /apps/[slug].
- Writing section (02): latest 4–6 from `getPosts({status:'published'})`; `.item.post` rows (date, title, excerpt, read-time estimate from word count, first category). "全部" link → /writing. Rows link /posts/[slug].
- Podcast section (03): featured episode + recent `.ep` rows from `getPodcasts`/`getEpisodes`. Hide whole section if no published podcast/episodes (no 《边角》 placeholder). Real `<audio>` for featured (replace faux player). "全部单集" → /podcast.

**用户可见的变化:**
- 打开首页是全新的编排式主页:大标题 hero + 两个按钮;往下是「01 Apps / 02 Writing / 03 Podcast」三块,左侧带 00/01/02/03 序号脊柱。文章区是真实最新文章;App 区和播客区当前为空(表里没数据)所以暂时整块不显示,等有数据自动出现。

**Architecture decisions (resolved at /write-plan):** read-time → existing `estimateReadTime` (CJK-aware) at build [D-A]; featured-app → `featured` flag → lowest `sortOrder` (nulls last) → earliest publishedAt [D-B]; featured-episode → highest `episodeNumber` → latest createdAt [D-C]; native `<audio controls>` for featured (faux JS player dropped) [D-D]; first-category via build-time reverse map (`getCategories`+`getPosts({category})`, posts embed no category) [D-E]; Writing viewall → `/` during transition (DP-002=B, swaps to /writing in Phase 3) [DP-phase2-1]. Plan: `docs/06-plans/2026-05-30-phase2-home-plan.md`.

**Acceptance criteria:**
- [x] Home builds; Writing section shows real latest posts with working /posts/[slug] links. (build 345 pages; dist: 6 post rows, 6 /posts links, 6 mono dates `2025 · 06 · 02`, read-time metas)
- [x] With empty apps/podcasts tables, those sections are absent (no placeholder/fake rows, no 《边角》 title). (dist: `id="apps"`=0, `id="podcast"`=0)
- [x] Seed one published app + one published podcast/episode locally → both sections render correctly (featured + list). (execute-plan seeded via CLI-key POST → `id="apps"`/`class="feature"`/`id="podcast"`/`<audio>` present; seed rows then deleted, DB restored to 0/0)
- [x] Theme/accent still work on Home. (dist: `themeBtn` + `norvyn-v2` bootstrap present; BaseLayout unchanged)
- [x] UT for read-time/featured-selection helpers; E2E/build verify Home renders both empty and seeded states. (home.test.ts 21 tests; dual-state builds)

**Review checklist:**
- [x] implementation-reviewer — Pass (0 plan/design gaps, 21/21 real tests; 1 advisory a11y fixed: decorative `.mini` → `aria-hidden`)
- [x] design-reviewer (new page) — N/A: apple-dev design-reviewer is SwiftUI-only; not applicable to Astro. Design fidelity covered by implementation-reviewer's design-fidelity pass (0 mismatches vs Home v2 ref). ⚠️ 真机/浏览器视觉确认留待累积评审。
- [x] feature-reviewer (Home is a complete hub journey) — N/A: apple-dev feature-reviewer is SwiftUI-only. Hub journey (writing live; apps/podcast empty-safe) verified via dist render + seeded-state build.

<!-- /section -->

---

<!-- section: phase-3 keywords: writing, article, posts, toc, scroll-spy, filter-chips -->
## Phase 3: Writing list (/writing) + Article (/posts/[slug])

**Status:** ✅ Completed — 2026-05-31

**Goal:** Blog index with topic-filter chips, and the long-form Article reading view (TOC + scroll progress + scroll-spy) replacing the existing serif `posts/[slug].astro`; all 128+ existing posts render in the new template.
**Depends on:** Phase 1
**Scope:**
- `/writing`: hero + filter chips (all/design/eng/essay/review by category) + featured latest + archive list from `getPosts`. Client-side `data-cat` filter (or server param) per design.
- `/posts/[slug]`: rebuild on new Article design — left rail (meta + TOC scroll-spy + share), prose body (H2/H3, blockquote, code, pull-quote, figure, `◆` end-mark), author card, prev/next, nav progress bar. TOC generated from rendered H2/H3. Markdown→HTML via existing `marked` pipeline.
- Reconcile existing `ShareButtons.astro` / `CommentSection.astro` per DP-002.

**用户可见的变化:**
- 新增「写作」列表页:顶部主题筛选小药丸(全部/设计/工程/随笔/复盘),下面是文章列表。点开任一文章是全新的阅读页:左侧有目录(随滚动高亮)和分享,顶部有阅读进度条,正文是新的排版(引用、代码、句末 ◆)。所有旧文章都套这个新样子。

**Architecture decisions:** TOC/scroll-spy as a small client script vs Preact island; filter chips client-side vs `?category=` route; how comments/share integrate (DP-002) — resolve at /write-plan.

**Acceptance criteria:**
- [x] /writing builds and lists real posts; chips filter correctly. (build 346 pages; dist/writing.html: 125 archive rows + 1 featured = 126 published, 7 chips [全部 + top-6 real categories], 125 `data-cats`, 16 year groups; client filter matches within space-separated `data-cats` so 25 multi-category posts filter under each category, empty year-head groups auto-hide. Long-tail categories via 全部分类→/categories per [D-001].)
- [x] A real existing post renders in the new Article template with working TOC scroll-spy + progress bar. (dist article: `id="h-0"` anchors, TOC `#h-N` matches injected ids exactly [verified built artifact], `class="progress"` page-owned fixed bar [D-007], vanilla scroll-spy/progress/smooth-scroll script.)
- [x] Markdown features (headings, code, blockquote, lists) render with new prose styles. (all `.prose` child rules in `<style is:global>` [D-009] so `set:html` content is styled; `.prose img:540` styles the 25 image-containing posts; H2/H3 get index-based ids [D-008] for CJK headings.)
- [x] Old serif post layout fully replaced (no Cormorant/vermillion on article pages). (dist articles: `cormorant|#c23a22` count = 0; old back-link/article-header/serif `.prose` removed [D-010]. `.cat` label fixed: shows real category, not hardcoded "· Essay".)
- [x] UT for TOC extraction + read-time; E2E/build verify a sampled post renders. (article.test.ts 10 tests [injectHeadingIds + selectAdjacent], writing.test.ts 17 tests [category/year/density]; 71/71 total; build emits all 126 `/posts/[slug]` + verified dist render.)

**Review checklist:**
- [x] implementation-reviewer — 0 plan-vs-code gaps, 2/2 real test pairs (Test-Fidelity passed), design fidelity clean. One ❌ "density gap" (E-1) was REJECTED with evidence: current output (featured 2025 + 2024 full + 2023+ compact) matches [D-003]; the reviewer's `selectFullYears(archive,2)` fix would make 2023 full, violating [D-003]. Feature-spec DP-004 (hardcoded "· Essay") fixed; DP-003 (pullquote/figure CSS) won't-fix (prototype-only classes marked never emits).
- [x] design-reviewer (2 new pages) — N/A: apple-dev design-reviewer is SwiftUI-only; not applicable to Astro. Design fidelity covered by implementation-reviewer's DF pass (0 mismatches vs Writing/Article refs; authorized divergences [D-007] progress bar, prototype-only prose classes). ⚠️ 真机/浏览器视觉确认（chip 即时筛选手感、滚动进度条 + TOC 高亮跟随、复制图标反馈）留累积评审。
- [x] feature-reviewer (read-an-article journey) — N/A: apple-dev feature-reviewer is SwiftUI-only. Browse-writing + read-article journeys verified via dist render + feature spec (docs/05-features/writing-list-and-article-reading.md, 20/24 stories ✅, 4 = prototype-only flourishes).

<!-- /section -->

---

<!-- section: phase-3-5 keywords: asc, app-sync, screenshots, subtitle, real-data, backend -->
## Phase 3.5: Backend ASC sync fix + real app data (Step 2 backend track)

**Status:** ✅ Completed — 2026-05-31

**Goal:** Fix the broken App Store Connect integration so managed App metadata (category · subtitle · whatsNew · version · description · **real screenshots**) actually syncs from ASC + iTunes and lands in the DB, verified end-to-end against one real published app (App Store ID `6756039348`, "Delphi - 认识你自己"). This unblocks Phase 4 to render real data instead of seed data.
**Depends on:** Backend Step 2 app-sync (uncommitted, present)
**Scope:**
- Fix `asc.service.ts` `fetchAppMetadata` appInfos query — current `include=appInfos,appInfos.appInfoLocalizations,appInfos.primaryCategory` returns **400 INVALID** (live-verified), silently swallowed by `.catch(()=>null)` so ASC contributes nothing today. Replace with verified two-step: `/v1/apps/:id/appInfos?include=primaryCategory` (category) + `/v1/appInfos/:infoId/appInfoLocalizations` (subtitle).
- Add real screenshot fetching to `asc.service.ts` (currently hardcodes `screenshots: []` at line 218): query `/v1/appStoreVersionLocalizations/:id/appScreenshotSets?include=appScreenshots`, resolve each `imageAsset.templateUrl` (`{w}x{h}bb.{f}`) to a concrete URL at a pinned size/format. Live-verified: 15 real screenshots reachable for this app.
- Harden `app-sync.service.ts:48` screenshot merge: `asc?.screenshots ?? itunes?.screenshots` lets an empty ASC array shadow iTunes once the 400 is fixed — change so empty ASC screenshots fall through to iTunes (multi-app safety).
- Seed the real app: create (`appStoreId=6756039348` + manual `accentColor`/`tagline`/`features` provided by user) → sync → publish, so `getApps({status:'published'})` returns it with real synced fields.
- `.env` for `packages/api` configured with ASC creds (`asc_keys/` git-ignored).
- **ASC discovery (folded in):** `listAscApps()` wrapping `GET /v1/apps` (live-verified: 9 apps in account) + `POST /api/apps/discover` that idempotently creates `status:'draft'` records for each ASC app not already in DB (match by `appStoreId`). Discovery does NOT auto-sync or auto-publish — which apps go live on the site stays an editorial decision per app. Removes manual `appStoreId` entry for the remaining 8 apps.

**用户可见的变化:**
- 这是纯后端阶段:站点前端本阶段不变。完成后数据库里第一个真实 App「Delphi - 认识你自己」带真实分类/副标题/版本/截图(15 张)/评分等,已发布。为下一阶段 App 详情页提供真实数据。

**Architecture decisions:** screenshot templateUrl 解析尺寸/格式(默认高清竖屏 `1290x2796` + 模板原生 `{f}`);merge 加固用 `?.length` 判空 vs ASC service 改返回 null — resolve at /write-plan.

**Acceptance criteria:**
- [x] `fetchAppMetadata(6756039348)` 不再 400;真实返回 subtitle=`记录点滴，让思想生根发芽。`、version=1.0、description。(category 按 DP-3.5-2 设计:ASC 返回 null,iTunes 提供 `Productivity` 经 merge 胜出 — 显示更干净,非 `PRODUCTIVITY` token。)
- [x] ASC screenshot 查询返回 **15 张真实 URL**(templateUrl 已解析为 `1290x2796bb.png`,无字面 `{w}`)。
- [x] merge 加固:空 ASC 截图不遮盖 iTunes 截图(单测覆盖该分支 + ASC-wins 回归)。
- [x] 真链路验收(非 mock):create→sync→publish→`GET /api/apps/delphi-认识你自己`,响应含 15 张截图 + zh-Hans subtitle + category `Productivity` + version 1.0;`status='published'`。discovery `POST /api/apps/discover` → 9 draft,幂等。
- [x] 测试 **82/82 绿**(原 75 + 7 新)+ `tsc --noEmit` 0 错误;回归守卫经 mutation 验证可判别(改回 break-order → 测试 FAIL)。

**Review checklist:**
- [x] implementation-reviewer — 7/7 任务真实代码;1 blocking gap(G-1 verLoc 守卫不可判别)已修 + mutation 证明;1 recommended(G-2 `appStoreId` 无 unique index,并发 discover 理论竞态)deferred — 单用户手动场景低危。
- [x] real-path verification — curl GET 落库确认(见 docs/06-plans/execution-report.md)

<!-- /section -->

---

<!-- section: phase-4 keywords: app-detail, getstaticpaths, app-color, screenshots, features -->
## Phase 4: App Detail (/apps/[slug])

**Goal:** Data-driven per-app landing template (one template, 5+ apps) via `getStaticPaths` over published apps, using `--app`/`--app-2` per-app coloring.
**Depends on:** Phase 1
**Scope:**
- `/apps/[slug]` from App Detail reference: hero (big icon + name + cat + tagline + meta row [version·★rating(count)·price·iOS min·category] + App Store CTA + phone frame), Features (icon+title+blurb rows), Screenshots strip (horizontal scroll), About (long description), credit line (首发/最近更新/开发者), More apps list.
- `getStaticPaths` over `getApps({status:'published'})`; per-app `--app`/`--app-2` from `accentColor` (+ shade()). Map real fields: name/tagline/icon/description/category/version/price/rating/ratingCount/minimumOsVersion/releaseDate/currentVersionReleaseDate/appStoreUrl/features(JSON)/screenshots(JSON)/links(JSON).
- Real icons/screenshots when present; CSS placeholder fallback when absent (null-safe meta — omit a meta cell if its field is null).
- Empty-safe: zero published apps → no /apps/* pages generated (build still succeeds).

**用户可见的变化:**
- 每个已发布的 App 有了自己的介绍页:顶部大图标+名称+评分/版本/价格等信息条+「App Store ↗」按钮+手机预览;往下是功能点、横滑截图、长介绍、其它作品。每个 App 用自己的品牌色给图标和截图上色。当前没已发布 App,所以暂时没有这些页,种一个就生成一个。

**Architecture decisions:** JSON field parse/guards (features/screenshots/links) at build; screenshot real-image vs CSS-placeholder switch; how `shade()` is ported (build util) — resolve at /write-plan.

**Acceptance criteria:**
- [ ] With a seeded published app (real App Store ID synced), /apps/[slug] renders all sections with real category/version/rating/screenshots.
- [ ] Per-app accent color applies to icon/screenshots only; site accent unchanged elsewhere.
- [ ] Null fields degrade gracefully (no empty meta cells, no broken JSON).
- [ ] Zero published apps → build succeeds, no /apps pages.
- [ ] UT for field mapping/JSON guards/shade(); build verify with seeded app.

**Review checklist:**
- [ ] implementation-reviewer
- [ ] design-reviewer (new template)
- [ ] feature-reviewer (browse-an-app journey)

<!-- /section -->

---

<!-- section: phase-5 keywords: podcast, archive, episodes, audio-player, rss -->
## Phase 5: Podcast archive (/podcast)

**Goal:** A podcast archive page (absent from the bundle) built from Home's `.feat-ep`/`.ep` patterns — featured episode + episode list + real audio + RSS link.
**Depends on:** Phase 1
**Scope:**
- `/podcast`: hero/spine; featured (latest) episode with real `<audio>` (audioUrl); episode list from `getEpisodes` (number, title, date, duration, mini play). Subscribe/RSS link → `/api/podcasts/:slug/feed.xml`.
- Empty-safe: no published podcast/episodes → quiet empty state or hidden, friendly "暂无单集".
- Consistent with Home's podcast section markup.

**用户可见的变化:**
- 新增「播客」页:最新一期在顶部可直接播放,下面是全部单集列表(期号·标题·日期·时长),有订阅/RSS 入口。当前没有已发布单集,所以显示友好空态,等 Adam 发布首期后自动出现。

**Architecture decisions:** single show vs multi-show handling (current data model allows multiple podcasts — pick latest/first or list shows); audio player shared with Home's — resolve at /write-plan.

**Acceptance criteria:**
- [ ] /podcast builds; empty state shows when no episodes (no fake 《边角》 data).
- [ ] Seed a published podcast + episode → featured plays via real `<audio>`, list renders, RSS link resolves to feed.xml.
- [ ] UT for episode mapping/duration formatting; build verify empty + seeded.

**Review checklist:**
- [ ] implementation-reviewer
- [ ] design-reviewer (new page)
- [ ] feature-reviewer (listen-to-podcast journey)

<!-- /section -->

---

<!-- section: phase-6 keywords: about, now, colophon, contact, accent-picker -->
## Phase 6: About (/about) + accent picker

**Goal:** About page (bio · now · colophon · contact) plus the relocated accent picker (5 swatches) that writes `localStorage['norvyn-v2'].accent` site-wide.
**Depends on:** Phase 1
**Scope:**
- `/about` from About reference: hero + portrait, 01 Story, 02 Now, 03 Colophon, 04 Say hi (contact buttons: Email/Mastodon/GitHub/RSS).
- Accent picker: 5 swatches (Indigo default + Cobalt/Emerald/Graphite/Ember) on About; clicking re-points `--accent` and persists; reflected across all pages on next load. (This is the relocation of the stripped Tweaks accent control.)
- Contact/Elsewhere links sourced from settings or static for now.

**用户可见的变化:**
- 新增「关于」页:个人介绍、最近在忙、站点说明(colophon)、联系方式。页面里有一排 5 个强调色圆点,点一下整站换成那个颜色并记住(这就是从浮窗挪过来的换色功能)。

**Architecture decisions:** swatch list source (hardcoded vs settings); whether contact links come from `settings` table or static — resolve at /write-plan.

**Acceptance criteria:**
- [ ] /about builds with all 4 sections.
- [ ] Accent picker changes site accent and persists across reload + other pages.
- [ ] No floating Tweaks panel anywhere; font stays Geist (no switcher).
- [ ] UT for accent persistence helper; build verify.

**Review checklist:**
- [ ] implementation-reviewer
- [ ] design-reviewer (new page)

<!-- /section -->

---

<!-- section: phase-7 keywords: legacy, archives, categories, tags, cleanup -->
## Phase 7: Legacy aux pages + old-layout cleanup (gated by DP-001)

**Goal:** Bring the remaining blog aux pages (archives / categories / tags / pagination) onto the new design and remove the last old-serif-layout remnants, so no page still uses the retired BaseLayout style. (Scope depends on DP-001.)
**Depends on:** Phase 3
**Scope:**
- Per DP-001: migrate `archives.astro`, `categories/`, `tags/`, `page/[page].astro` to the new design (spine + hairline rows), OR minimally reskin them via the new BaseLayout, OR defer.
- Delete dead old-layout CSS/components no longer referenced (only after grep confirms no consumer).
- Verify nav/footer links across the whole site resolve (no dangling old routes).

**用户可见的变化:**
- 归档/分类/标签/分页这些辅助页也变成新设计,整站再没有旧的衬线+朱红残留。

**Architecture decisions:** full re-layout vs BaseLayout-only reskin for aux pages (DP-001); which old components/CSS are safe to delete (grep-verified) — resolve at /write-plan.

**Acceptance criteria:**
- [ ] archives/categories/tags/pagination render on the new design (or deferred per DP-001 decision, documented).
- [ ] grep shows no page importing the old serif BaseLayout style; no dead CSS referencing `#c23a22`/Cormorant remains unreferenced.
- [ ] Full site build succeeds; all nav/footer links resolve.
- [ ] Build verify across all routes.

**Review checklist:**
- [ ] implementation-reviewer
- [ ] design-reviewer (migrated pages)

<!-- /section -->

---

<!-- section: phase-8 keywords: mcp, reverse-integration, app-update, pages, privacy, companion-pages -->
## Phase 8: Reverse integration — app content MCP (last phase, not urgent)

**Goal:** Let Claude Code, working inside an app's repo, manage that app's WordBase presence via MCP: update the App Detail display info (tagline/features/description/accentColor/screenshots) and author/host the app's companion pages (privacy / help / support / terms / changelog) that WordBase serves at public URLs. **WordBase does NOT write back to ASC** — the user configures ASC's URL fields themselves; WordBase only hosts the content.
**Depends on:** Phase 4 (App Detail page exists), Phase 3.5 (real app data + discovery)
**Scope:**
- `app_update` MCP tool wrapping the existing `updateApp()` / `PUT /api/apps/:id` (backend already complete) — lets CC edit features/tagline/description/accentColor/screenshots post-create.
- `page_*` MCP tools (list/get/create/update/delete/publish) wrapping the existing `pages` table + `page.service.ts` CRUD + `routes/pages.ts` (all already present; only MCP exposure is missing) — lets CC author companion pages that render at public WordBase URLs.
- (Optional) surface ASC discovery (`POST /api/apps/discover` from Phase 3.5) as an MCP tool so CC can pull the app list too.
**用户可见的变化:**
- 开发某个 App 时,在它的代码目录用 Claude Code 就能更新这个 App 在 norvyn.com 上的展示信息,并撰写/发布它的隐私/帮助/支持/条款页(WordBase 给公开 URL,你把 URL 自己填到 App Store Connect)。配套页从 Notion 迁到 WordBase 自管。
**Architecture decisions:** companion-page slug/routing convention (`/apps/:slug/privacy` vs flat `pages` slug); whether `app_update` and `page_*` share an auth scope; MCP tool input schemas — resolve at /write-plan.
**Acceptance criteria:**
- [ ] `app_update` MCP tool updates an app's features/tagline and the change renders on `/apps/:slug` after rebuild.
- [ ] `page_create`/`page_publish` MCP tools create a companion page that renders at its public URL.
- [ ] No ASC writeback anywhere (verify: no PATCH/POST to api.appstoreconnect.apple.com in the new code).
- [ ] Build verify; MCP tools callable via stdio with API key.

**Review checklist:**
- [ ] implementation-reviewer

<!-- /section -->

---

## Decisions

### [DP-001] 旧博客辅助页(archives/categories/tags/分页)处理方式 (recommended)

**Context:** 设计 bundle 只给了 6 张主页面,没有归档/分类/标签/分页页的设计;它们现用旧衬线 BaseLayout。全新替换后这些页若不处理会割裂。
**Options:**
- A: 单独作为 Phase 7,全部迁到新设计(spine+hairline 行)。— 整站一致;多一个阶段工作量。
- B: 仅让它们继承新 BaseLayout(最小重皮,不重排版)。— 快;但列表样式可能与主 6 页不完全统一。
- C: 暂不处理,本轮只做 6 主页面。— 最省;过渡期这些页风格不一致。
**Chosen:** A(Phase 7 全迁新设计)— 用户确认 2026-05-30。

### [DP-002] 文章页评论/分享区(现有 ShareButtons + CommentSection)去留 (recommended)

**Context:** 新 Article 设计含分享(copy link/share)但**不含评论区**;现有 `posts/[slug].astro` 挂了 `ShareButtons.astro` + `CommentSection.astro`(评论后端 `comments` 表 + API 存在)。设计未画≠要删(scope guard),但保留需在新版式里安置。
**Options:**
- A: 保留分享 + 评论,按新设计风格重做样式塞进 Article 末尾。— 不丢现有功能;需为评论设计新样式(设计没给)。
- B: 保留分享(设计有),评论本轮先撤(后端保留,前端不渲染)。— 贴合设计;评论功能暂时对访客消失(UX 变更)。
- C: 分享+评论都先撤。— 最贴设计;丢两个现有功能。
**Chosen:** A(保留分享+评论,按 hairline 风格重做评论样式)— 用户确认 2026-05-30。

---
