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

**Status:** ✅ Completed — 2026-05-31

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
- [x] With the real published app (Delphi 6756039348, synced in Phase 3.5), `/apps/delphi-认识你自己` renders all sections with real category `Productivity`/version 1.0/**15 screenshots**. (评分 0/0 → 信息格按 null-safe 隐藏,非显示 0。)
- [x] Per-app accent color applies to icon/screenshots only:`--app:#0CA8E5`/`--app-2:#0979a5` 内联在 `<div id="top">`,作用域限本页子树,站点 `--accent` 别处不变。
- [x] Null fields degrade gracefully:null-safe meta(省略空格)、`parseJsonArray` 守卫 null/malformed/non-array、appStoreUrl 空则从 appStoreId 拼 `id6756039348`。
- [x] Zero published apps → build succeeds, no /apps pages:`getStaticPaths` 只 over published,8 个 draft 不生成页;build 347 页(+1 = /apps/delphi)。
- [x] UT for field mapping/JSON guards/shade();build verify:app.test.ts **27 测试**(含 `shade('#0CA8E5',-28)==='#0979a5'` 字面量、ratingCount=0 省略格);build dist 断言全过。vitest 98/98、astro check 0 err。

**Review checklist:**
- [x] implementation-reviewer — ✅ PASS,0 gap 需修(P-1 links 未渲染=参考稿也不渲染;P-2 plan 写 index.html 实为站点级 flat-file 格式,输出正确)。design-fidelity:spine 00-04 + meta 序 + shade 字节级一致,tweaks/EDITMODE/字体切换全剥离(grep 0)。a11y:每 img 有 alt,App Store CTA `rel=noopener target=_blank`。
- [x] design-reviewer (new template) — N/A:apple-dev design-reviewer 仅 SwiftUI;设计保真由 implementation-reviewer 的 DF pass 覆盖(0 mismatch vs App Detail 参考稿)。⚠️ 真机/浏览器视觉确认(双色上色、横滑截图手感、手机预览)留累积评审。
- [x] feature-reviewer (browse-an-app journey) — N/A:apple-dev feature-reviewer 仅 SwiftUI;browse-an-app 旅程经 dist 渲染验证(真实 Delphi 全段渲染)。

<!-- /section -->

---

<!-- section: phase-5 keywords: podcast, archive, episodes, audio-player, rss -->
## Phase 5: Podcast archive (/podcast)

**Status:** ✅ Completed — 2026-05-31

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
- [x] /podcast builds; empty state shows when no episodes (no fake 《边角》 data). (build 348 pages, +1 `/podcast` → `dist/podcast.html`. **Two-tier empty-safe, both dist-confirmed:** no published podcast → 「播客即将上线，敬请期待。」+ generic `h1 播客`, 0 `<audio>`, 0 subscribe link; published podcast + 0 episodes → real show title + subscribe RSS + 「暂无单集。」. Host data-sourced `author ?? ownerName`, never hardcoded — no fake 《边角》.)
- [x] Seed a published podcast + episode → featured plays via real `<audio>`, list renders, RSS link resolves to feed.xml. (Seeded 1 show + 2 eps via SQLite [API key tokens unrecoverable]; dist: featured = EP.2 [highest episodeNumber] `<audio controls preload="metadata">`, archive EP.1 `<audio controls preload="none">` + meta `EP.1 · 2024 · 05 · 18 · 48 min`. Subscribe href **relative** `/api/podcasts/:slug/feed.xml` [DP-5.4: Caddy proxies /api same-origin per deploy/wordbase:9; `API_URL` would bake localhost:4100]; 0 `localhost:4100`. Native `<audio>` only, no faux player [D-D]. Seed reverted, DB restored empty. ⚠️ 实际播放/生产 RSS 解析留浏览器验证。)
- [x] UT for episode mapping/duration formatting; build verify empty + seeded. (podcast.test.ts **15 tests**: selectShow×5 [determinism, nulls-last, createdAt tiebreak], sortEpisodes×5 [desc, nulls sink, no-mutation], episodeMeta×5 [exact-string pin `EP.3 · 2026 · 05 · 21 · 48 min`, conditional EP/duration]. `formatDuration`/`formatMonoDate`/`selectFeaturedEpisode`/`decodeEntities` reused from home.ts, not reimplemented. vitest 113/113, astro check 0 err/0 warn.)

**Review checklist:**
- [x] implementation-reviewer — ✅ PASS, 0 gaps. 15/15 real falsifiable tests (exact-string episodeMeta, no-mutation sortEpisodes, both-order selectShow determinism; 0 shell). Design-fidelity byte-match vs Home v2 `.feat-ep`/`.ep-cover` + spine 00/01/02 + mono labels. Helper reuse confirmed (not duplication); `.lede` correctly not redeclared (global tokens.css:154). `.viewall` justified omission (no consumer on this page). Tier B empty-state dist-confirmed after review flagged it logic-only.
- [x] design-reviewer (new page) — N/A: apple-dev design-reviewer is SwiftUI-only; not applicable to Astro. Design fidelity covered by implementation-reviewer DF pass (byte-match vs Home v2 podcast block). ⚠️ 真机/浏览器视觉确认（横滑/播放器手感）留累积评审。
- [x] feature-reviewer (listen-to-podcast journey) — N/A: apple-dev feature-reviewer is SwiftUI-only. Journey verified via dist render (3 states) + feature spec `docs/05-features/podcast-archive.md` (8/8 stories ✅, 0 deviations).
- ⚠️ **Connectivity (Phase 7 scope):** BaseLayout footer 「播客」→ `/` + nav has no Podcast entry → `/podcast` unreachable from chrome. Same transition state as `/writing` (Phase 3). Phase 7 explicitly owns site-wide nav/footer wiring — deferred there, not a Phase 5 gap.
- ⚠️ **Latent (when real podcast data lands):** episode date displays `createdAt`; the API returns `publishedAt` too but `api.ts` `Episode` interface omits it. For synced episodes `createdAt` ≈ sync time, not air date. Switch `episodeMeta` to `publishedAt ?? createdAt` (+ add field to interface) when real data is published. AC2 RSS resolution self-verified via curl (feed.xml → HTTP 200 valid RSS, 2 items + enclosures).

<!-- /section -->

---

<!-- section: phase-6 keywords: about, now, colophon, contact, accent-picker -->
## Phase 6: About (/about) + accent picker

**Status:** ✅ Completed — 2026-05-31

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
- [x] /about builds with all 4 sections. (build 349 pages, +1 → `dist/about.html`; spine 00 hero + 01 Story / 02 Now / 03 Colophon / 04 Say hi = 5 `class="no"` sections. Editorial copy honest-real v1 per [D-002]: real Delphi/128+ posts/podcast-pre-launch, **0 fictional** persona — data-driven sync deferred to issue #3.)
- [x] Accent picker changes site accent and persists across reload + other pages. (5 swatches in 03 Colophon [D-001], each `data-value` + inline `background`; click → `persistAccent` [preserves theme, single-source `theme.ts`] + sets inline `--accent` live + moves `.sel`; click guarded by `isValidAccent`. FOUC bootstrap [BaseLayout:46-61, `is:inline`, every page] reads `stored.accent` → survives reload + applies on all pages. Reviewer traced loop consistent.)
- [x] No floating Tweaks panel anywhere; font stays Geist (no switcher). (about.astro + dist grep `tweaks|EDITMODE|twFont|Grotesk` = 0; Tweaks panel relocated to inline colophon swatches, font-switcher dropped entirely.)
- [x] UT for accent persistence helper; build verify. (theme.test.ts **24 tests** [+9: ACCENTS order/length, isValidAccent true/false/empty, persistAccent theme-preservation (falsifiable — naive `{accent}`-only impl fails), null-raw, round-trip]. vitest 122/122, astro check 0 err/0 warn, build 349 pages.)

**Review checklist:**
- [x] implementation-reviewer — ✅ PASS, 0 plan-vs-code gaps, 0 design-fidelity mismatches. 9/9 real falsifiable tests (theme-preservation falsifiable). CSS verbatim port of About ref incl `.ab-hero` descendant overrides (eyebrow/h1/lede). Honest-copy [D-002] dist-grep 0 fictional. Footer edit link-href-only across all 14 pages (mailto+github+/about; RSS/Mastodon removed; 0 dead `href="#"`). a11y: swatches aria-label+title, external links `rel=noopener`. 2 advisories fixed (isValidAccent wired as guard; dead client ACCENTS import removed).
- [x] design-reviewer (new page) — N/A: apple-dev design-reviewer is SwiftUI-only; not applicable to Astro. Design fidelity covered by implementation-reviewer DF pass (verbatim CSS port vs About ref; authorized copy/contact divergences per [D-002]/scope). ⚠️ 真机/浏览器视觉确认（换色即时反馈、portrait 渐变、暗色对比 ↓PE-001）留累积评审。
- ⚠️ **PE-001 (pre-existing, surfaced by picker):** FOUC bootstrap always sets inline `--accent`, shadowing tokens.css dark twin `--accent:#7088FF`; light-tuned swatches (esp. Graphite `#3F3F46`) are low-contrast on dark paper. Predates Phase 6 (Phase 1 bootstrap). Needs user decision (per-theme accent variants vs accept 「全站同步」). Surfaced — not a Phase 6 gap. **用户决定暂不修,记 issue #5 跟踪 (2026-05-31)。**
- ⚠️ **Connectivity (Phase 7 scope):** nav-bar has no About entry; footer Navigate 作品/写作/播客 still → `/`. `/about` reachable via direct URL + footer 关于 → `/about` (wired this phase). Full site-wide nav/footer wiring owned by Phase 7.
- **Deferred (captured):** About content auto-update from GitHub+ASC (issue #3, overlaps Phase 8); email subscription/newsletter (issue #4).

<!-- /section -->

---

<!-- section: phase-7 keywords: legacy, archives, categories, tags, cleanup -->
## Phase 7: Legacy aux pages + old-layout cleanup (gated by DP-001)

**Status:** ✅ Completed — 2026-05-31

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
- [x] archives/categories/tags/pagination render on the new design (DP-001=A 全迁). 8 页全迁 spine+hairline:5 个别名页(archives/categories-index/tags-index/page-[page]/404)别名 token→直接 token;3 个 Tailwind 页(categories-[slug]/tags-[slug]/[slug] 通用页)裸 Tailwind→spine+.item.post/.prose。复用 /writing 行语言 + home `.item.app`,无新造设计(DP-001=A 授权 spine+hairline)。dist 断言:各页 0 别名 token、0 Tailwind utility。
- [x] grep shows no page importing the old serif BaseLayout style; no dead CSS referencing `#c23a22`/Cormorant remains. (`grep cormorant|#c23a22 src/pages` = 0;过渡别名 `:root` 块已删,全 src(含 admin)0 个别名消费者 — reviewer 独立核 15 个 token 名各 0。)
- [x] Full site build succeeds; all nav/footer links resolve. (build 350 页 +1 `/apps`;nav=Apps→/apps·Writing→/writing·Podcast→/podcast(英文 mono,brand→/);footer Navigate 作品/写作/播客/关于 + 新「更多」列 分类/标签/归档 + Elsewhere Email/GitHub;7 个 nav/footer 路由 dist 文件全存在,无悬空。)
- [x] Build verify across all routes. (vitest 122/122,astro check 0 err/0 warn/29 hints,build 350 页。)

**新增交付(超出 dev-guide 原列范围,用户确认):**
- **新建 `/apps` 索引页** [D-002]:与 /writing /podcast 对称(首页区块预览 + 独立页全部),`getApps({status:'published'})` 复用 `selectFeaturedApp`/`restApps`(home.ts),空安全,现列 Delphi 1 个。home `#apps` 加「全部作品 →/apps」。
- **`prose.css` 基础层抽取** [D-006]:`.prose` 元素排版从 `posts/[slug].astro` 内联 `<style is:global>` 抽到 `src/styles/prose.css`,article + `[slug]` 通用页共用单一来源(移动非复制,126 篇文章排版字节级不变 — reviewer 确认无回归)。

**Review checklist:**
- [x] implementation-reviewer — ✅ PASS, 0 gaps。两高危项明确清白:**别名删除 SAFE**(整块删除,全 src 含 admin 0 消费者,15 个 token 名各独立核验);**article 无回归**(prose.css 与原规则字节级一致,移动非复制,126 篇文章仍全样式,CMS [slug] dist 验证)。11 个改动文件 = 计划目标,0 计划外。
- [x] design-reviewer (migrated pages) — N/A:apple-dev design-reviewer 仅 SwiftUI。辅助页无设计稿,设计按 [D-004] 从现有 spine+hairline 系统推导,保真由 implementation-reviewer 覆盖。⚠️ 真机/浏览器视觉确认(各辅助页排版、/apps 列表、暗色)留累积评审。
- ⚠️ **PE-P7(既有,非缺陷):** `@tailwindcss/typography` 的 `.prose` 与自定义 `prose.css` 在文章包里共存,自定义按 specificity 胜出、无视觉影响。后续清理可把 Tailwind typography 从公开站点移除(admin 保留)。

<!-- /section -->

---

<!-- section: phase-8 keywords: mcp, reverse-integration, app-update, pages, privacy, companion-pages -->
## Phase 8: Reverse integration — app content MCP (last phase, not urgent)

**Status:** ✅ Completed — 2026-05-31

**Goal:** Let Claude Code, working inside an app's repo, manage that app's WordBase presence via MCP: update the App Detail display info (tagline/features/description/accentColor/screenshots) and author/host the app's companion pages (privacy / help / support / terms / changelog) that WordBase serves at public URLs. **WordBase does NOT write back to ASC** — the user configures ASC's URL fields themselves; WordBase only hosts the content.
**Depends on:** Phase 4 (App Detail page exists), Phase 3.5 (real app data + discovery)
**Scope:**
- `app_update` MCP tool wrapping the existing `updateApp()` / `PUT /api/apps/:id` (backend already complete) — lets CC edit features/tagline/description/accentColor/screenshots post-create.
- `page_*` MCP tools (list/get/create/update/delete/publish) wrapping the existing `pages` table + `page.service.ts` CRUD + `routes/pages.ts` (all already present; only MCP exposure is missing) — lets CC author companion pages that render at public WordBase URLs.
- (Optional) surface ASC discovery (`POST /api/apps/discover` from Phase 3.5) as an MCP tool so CC can pull the app list too.
**用户可见的变化:**
- 开发某个 App 时,在它的代码目录用 Claude Code 就能更新这个 App 在 norvyn.com 上的展示信息,并撰写/发布它的隐私/帮助/支持/条款页(WordBase 给公开 URL,你把 URL 自己填到 App Store Connect)。配套页从 Notion 迁到 WordBase 自管。
**Architecture decisions (resolved at /write-plan):** ① companion-page routing — FLAT `pages` slug (用户确认 DP-flat) + `<app>-<type>` 命名约定 + `page_create` 可选 `app` arg 写入 `meta.appId`(关联数据现在就存,日后加 `app_id` 列+嵌套路由是非破坏性 backfill)[D-002];② auth scope — 复用现有 MCP server 单一 `WORDBASE_API_KEY`,所有工具同 scope(不加 per-tool 检查)[D-001];③ tool schemas — 匹配现有 30 工具的 plain JSON-schema + `async(args)` 约定。Plan: `docs/06-plans/2026-05-31-phase8-mcp-plan.md`。

**Acceptance criteria:**
- [x] `app_update` MCP tool updates an app's editorial fields; renders on `/apps/:slug` after rebuild. (工具 wraps `appService.updateApp`,**仅暴露 sync-safe 字段** name/slug/tagline/accentColor/features/links/sortOrder/status/meta — 单元测试证伪式守卫确认丢弃 description/screenshots/icon/appStoreId/rating。**范围调整(用户 DP-001=A 授权):** description/screenshots/icon 由 app_sync 拥有[app-sync.service.ts:51-74 iTunes/ASC-first],编辑会被下次 sync 回滚,故移出 app_update — 网站这几项保持与 App Store 一致。渲染由 Phase 4 的 /apps/[slug] 模板 + build 提供[组合验证]。)
- [x] `page_create`/`page_publish` MCP tools create a companion page that renders at its public URL. (6 个 page_* 工具 wraps pageService;新增 `publishPage`(status='published'+updatedAt);page_create 可选 app→stamp meta.appId,malformed meta→isError[已修+测]。公开 URL 渲染由 Phase 7 迁移的 /[slug] 路由提供[filters status==='published',Phase 7 已验证 published 页渲染]。)
- [x] No ASC writeback anywhere. (`asc.service.ts` `ascFetch` 全部 GET、0 个 POST/PUT/PATCH 到 api.appstoreconnect.apple.com — reviewer 独立确认。app-sync 只从 ASC/iTunes 读入本地 db。)
- [x] Build verify; MCP tools callable via stdio with API key. (tsc build 0 错误;vitest 87/87[+新 mcp handler 测试];执行期 mint 临时 key → `npm run mcp` stdio `initialize`+`tools/list` 确认 8 个新工具均出现 + `page_list` 可调用。**安全:临时 key 用后已从 api_keys 撤销**,泄漏明文失效。)

**Review checklist:**
- [x] implementation-reviewer — ✅ PASS, 0 blocking gaps。两高危结论明确:**[D-004] sync-clobber 守卫 SOLID**(显式 9 字段 allowlist 非 args spread,交叉核对 sync `set` 13 字段无重叠);**测试可证伪**(新 `buildCapturingServer` 真捕获 handler + `vi.mock` services,3 个行为测试 naive 实现必 FAIL,0 shell)。1 个非阻塞 F-1(page_create `JSON.parse(meta)` 未 guard)已修 + 补测(87/87)。
- ⚠️ **后续(captured):** About 内容 GitHub+ASC 自动同步 issue #3(本阶段提供了 app_update/page_* 基础);per-app 嵌套路由 + `app_id` 列待规模需要时非破坏性迁移。

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
