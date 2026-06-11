---
type: feature-spec
status: active
tags: [i18n, bilingual, language-toggle, chrome-strings, client-side, fouc]
refs:
  - docs/06-plans/2026-06-11-phase1-ui-bilingual-plan.md
  - docs/06-plans/2026-06-11-bilingual-dev-guide.md
---

# UI 双语（站点界面中英切换 / language switching）

> Client-side bilingual UI for the Astro SSG site. A 中/EN toggle in the nav switches all static site chrome between Chinese and English at runtime, with no flash of content, no per-language URL, and no change to API-driven content bodies.

**Design sources:**
- `docs/06-plans/2026-06-11-phase1-ui-bilingual-plan.md` (full Phase 1 plan, 14 tasks, DP-001=B)
- `docs/06-plans/2026-06-11-bilingual-dev-guide.md` § Phase 1

---

## User Stories

- 用户可以在 nav 右侧找到「中 / EN」切换钮 → `packages/web/src/layouts/BaseLayout.astro:133` ✅
- 用户可以点切换钮即时全站切换中英文 chrome（无刷新） → `packages/web/src/layouts/BaseLayout.astro:251-260` ✅
- 用户可以在切换后刷新/换页保持当前语言 → `packages/web/src/lib/theme.ts:18-23` (lang 字段写入 norvyn-v2 blob) + `BaseLayout.astro:97-117` (head bootstrap 重读) ✅
- 首次访问时浏览器语言为 zh* 自动看到中文，英文 UA 默认看到英文 → `packages/web/src/lib/i18n.ts:376-380` (detectLang 三级守卫) + `BaseLayout.astro:106` (head bootstrap 手镜像) ✅
- 用户切换语言时页面无 chrome 文案闪烁 → `packages/web/src/styles/tokens.css:180-183` ([data-lang] CSS 显隐) + `T.astro:35` (双副本 SSR) + `BaseLayout.astro:97-117` (head 首绘前定 data-lang) ✅
- 用户切换语言时 `<html lang>` 同步更新到 zh-CN / en → `BaseLayout.astro:110, 202` ✅
- 切换语言时 aria-label / placeholder / title 同步切换 → `packages/web/src/lib/i18n.ts:402-413` (applyAttrI18n) + `BaseLayout.astro:229, 258` (load + toggle 时调用) ✅
- 切换语言时静态页浏览器标签页 `<title>` 同步英文，API 标题页保持中文 → `BaseLayout.astro:14, 34, 49, 211-212` (titleEn prop + dataset + head-swap) ✅
- 切换语言时评论表单（名字 / 邮箱 / 网站 / 提交 / 留下评论 等）随语言切换 → `packages/web/src/components/CommentSection.astro` (T 双副本) ✅
- 切换语言时分享按钮 tooltip（Twitter/WeChat/复制链接/分享）随语言切换 → `packages/web/src/components/ShareButtons.astro` (data-i18n-title) ✅
- 切换语言时微信扫码浮层 / 关闭文案随语言切换 → `packages/web/src/components/ShareButtons.astro` (runtime t() lookup) ✅
- 切换语言时 podcast 反馈 chip（很棒 / 重复 / 不同意 / 没意思 / 太水）随语言切换 → `packages/web/src/lib/feedback.ts:4-10` (labelEn) + `pages/podcast/[slug].astro` (<T zh en>) ✅
- 切换语言时 podcast 逐字稿展开/收起 / 提交失败 / 加载失败 运行时文案随语言切换 → `packages/web/src/lib/episode-ui.ts:12, 18-20, 123, 186` (import dict + uiLang()) ✅
- 切换语言时 About 整页静态文案随语言切换 → `packages/web/src/pages/about.astro:14-127` (26+ <T> 节点) ✅
- 切换语言时 404 页文案随语言切换 → `packages/web/src/pages/404.astro` ✅
- 切换语言时 archives / categories / tags / pager / post 页所有 chrome 标签随语言切换 → `packages/web/src/pages/archives.astro` + `pages/categories/{index,[slug]}.astro` + `pages/tags/{index,[slug]}.astro` + `pages/page/[page].astro` + `pages/posts/[slug].astro` ✅
- 切换语言时 nav (Apps / Writing / Podcast) / footer (Navigate / 更多 / Elsewhere / 作品 / 写作 / 播客 / 关于 / 分类 / 标签 / 归档 / Built with Wordbase) 全部随语言切换 → `BaseLayout.astro:42-46, 148-172` (T 双副本) ✅

## Expected Behavior

The site offers a single client-side language toggle visible in the top-right of the nav, adjacent to the existing theme button. Toggling swaps the active language between Chinese and English for all site chrome — navigation labels, footer columns and links, every page's hero / eyebrow / section notes / button text / empty states, the comment form and its runtime messages, share button tooltips and the WeChat QR overlay, the About page in its entirety, the 404 page, and the per-page browser tab title. Article body text, app names/descriptions, and podcast show notes remain in Chinese — this is a chrome-only change.

Language preference is detected on every page load from a single source: the `lang` field inside the existing `norvyn-v2` localStorage blob (where theme and accent already live). A stored value of `zh` or `en` wins. If absent, the value falls through to `navigator.language`: a prefix match of `zh` resolves to Chinese, anything else to English, and a missing/empty `navigator.language` defaults to Chinese. The decision runs in a head `is:inline` bootstrap before the body paints, so the `<html>` element carries `data-lang` and `lang` attributes synchronously on first paint — no flash, no shift.

The visible-text mechanism is dual-copy rendering. Every translatable string is emitted at build time as a pair of `<span data-l="zh">…</span><span data-l="en">…</span>` siblings wrapped in a layout-transparent `.i18n` container. CSS rules on `:root[data-lang]` show exactly one of the two spans and hide the other; the toggle is therefore just an attribute flip with no DOM mutation. The static HTML default (no `data-lang` / no JS / crawler) is Chinese — the `:root[data-lang="en"]` selector is required to reveal English, so crawlers and no-JS users always see the Chinese content. The English copy is present in the source as a hidden secondary span, doubling the chrome markup's byte size but keeping the dictionary as the single source of truth (no string duplication at the call site).

Non-visible attributes — `aria-label`, `placeholder`, `title` — use a post-body JS swap because the HTML-level attribute can be set once and there's no flash concern. The bundled module reads the dictionary and writes each attribute for every element tagged with `data-i18n-aria` / `data-i18n-placeholder` / `data-i18n-title`, on first load and again after every toggle. Unknown keys are intentionally skipped to preserve the static Chinese default rather than overwrite it with the literal key string.

The browser tab title uses the same head-swap pattern. Each page that has a static title (home, writing, apps, podcast, about, archives, categories index, tags index, 404, pager) passes an English title to `BaseLayout` as a `titleEn` prop; `BaseLayout` joins it with the site name the same way it joins the Chinese title, then stores it in a `data-title-en` attribute on `<html>`. The static `<title>` in the head always renders Chinese. The bundled script writes `document.title` from `data-title-en` only when the active language is `en`. Pages whose title comes from API content (articles, app detail, podcast episode, tag/category detail) do not pass a `titleEn`, so their tab title stays Chinese — this is the deliberate "body is not translated" boundary.

`<meta name="description">`, `og:title`, `og:description`, `twitter:title`, and `twitter:description` stay Chinese in both states. These are reader-invisible and crawlers don't run JS, so per-language meta is meaningless at this stage; real per-language SEO (URL-locale `/en`, `hreflang`) is explicitly deferred to Phase 2.

### Scenario 1: First-visit English browser

A visitor lands with `navigator.language = "en-US"` and no `norvyn-v2` localStorage. The head bootstrap sets `data-lang="en"` and `lang="en"` before paint. The CSS rules hide every `[data-l="zh"]` span and show every `[data-l="en"]` span. The `<title>` head-swap script writes the English title from `data-title-en` for static pages. The nav shows `EN` highlighted; the entire site chrome — nav links, footer, hero, section notes, buttons, empty states, About, 404 — is English on first paint. API content (article body, app names, podcast show notes) remains Chinese. On click, the visitor can switch to Chinese; the preference persists in the same blob as theme/accent.

### Scenario 2: Chinese-speaking returning visitor

The visitor has previously set `lang: "zh"` in `norvyn-v2` (via a click). On any page load the head bootstrap reads the stored value, sets `data-lang="zh"` and `lang="zh-CN"` synchronously, and the CSS rules show Chinese. The toggle button displays `中` highlighted. The visitor's prior choice overrides the browser language on every subsequent visit.

### Scenario 3: No-JS / crawler

A search engine or no-JS client receives the static HTML. `<html>` has `data-lang` set by the inline bootstrap (which is not module-scoped) or defaults to no `data-lang` if localStorage is unavailable. The CSS rule `[data-l="en"] { display: none; }` always hides English; Chinese is always visible. The static `<title>`, `<meta description>`, og, and twitter all render in Chinese. The English copy is present in the DOM but hidden — crawlers see only the Chinese surface, which is intentional.

### Scenario 4: Developer adds a new page

The developer adds a new static page to `pages/`, imports `T` from `components/T.astro`, and writes translatable text as `<T k="<key>" />` (looking up a key in `lib/i18n.ts`) or `<T zh="…" en="…" />` (passing strings inline). They add both languages to the dictionary (or supply both inline) and import the page through `BaseLayout`. Aria / placeholder / title attributes that need translation get `data-i18n-aria` / `data-i18n-placeholder` / `data-i18n-title` markers; the bundled script in `BaseLayout` applies them automatically.

## Key Files

| File | Responsibility |
|------|----------------|
| `packages/web/src/lib/i18n.ts` | Dictionary (~209 keys), `Lang` type, `detectLang` (3-level guard), `nextLang`, `t` (fallback-safe lookup), `applyAttrI18n` (attribute sweeper with key-presence guard) |
| `packages/web/src/components/T.astro` | Dual-copy text component. Props: `k` (dict lookup) or `zh`+`en` (inline). Renders `<span class="i18n"><span data-l="zh">…</span><span data-l="en">…</span></span>` |
| `packages/web/src/layouts/BaseLayout.astro` | Head inline bootstrap (mirrors detectLang 3-level), nav lang button, bundled toggle script (mergePrefs + applyAttrI18n + title head-swap), BaseLayout's own chrome (footer, nav links) dual-copied |
| `packages/web/src/styles/tokens.css` | CSS rules for `.i18n { display: contents }`, `[data-l="en"] { display: none }`, `:root[data-lang="en"] [data-l="zh"] { display: none }` + `[data-l="en"] { display: inline }` |
| `packages/web/src/lib/theme.ts` | `ThemePrefs` gains `lang?: string`; `THEME_LS_KEY` ('norvyn-v2') carries theme/accent/lang as one JSON blob; `readPrefs`/`mergePrefs` extend generically |
| `packages/web/src/lib/feedback.ts` | `FEEDBACK_CHIPS` gains `labelEn` next to `label`; podcast template renders `<T zh en>` for chip text |
| `packages/web/src/lib/episode-ui.ts` | `uiLang()` reads `<html data-lang>`; runtime error and transcript-fail messages lookup `dict['podcast.fbError'/'txError']` at the current language |
| `packages/web/src/lib/i18n.test.ts` | Unit tests for detectLang 3-level guard, nextLang, t() fallback, dict completeness (every entry non-empty zh AND en) |
| `packages/web/src/components/CommentSection.astro` | Form labels dual-copied; runtime status messages read `t(key)[uiLang()]` |
| `packages/web/src/components/ShareButtons.astro` | Tooltips use `data-i18n-title`; WeChat QR / close use `t(key)[uiLang()]` |
| `packages/web/src/pages/*.astro` (15 pages, admin excluded) | All hardcoded chrome text replaced with `<T k="…">` lookups |

## Boundary Conditions / Constraints

- **Static HTML always renders Chinese** for crawlers and no-JS clients. The English copy is present in the DOM but hidden via CSS until `data-lang="en"` is set. `<title>`, `<meta description>`, `og:*`, and `twitter:*` are never translated.
- **API-driven content (article body, app name/description, podcast show notes) stays Chinese** in both language states. Translation of content is explicitly Phase 2. The dictionary carries chrome strings only; the API surface is untouched.
- **Toggle is client-side, not URL-locale.** No `/en` route, no `hreflang`, no per-language sitemap entry in Phase 1. The language is a runtime preference stored in localStorage, not a part of the addressable web. This is a deliberate scope decision: URL-locale is the Phase 2 SEO upgrade.
- **Chrome markup doubles in size.** Every translatable string renders twice. For static chrome (nav, footer, hero, About short prose) this is well within the SSG payload budget; the longest string is the `about.story.p4` paragraph at ~150 chars in each language, so the absolute cost is modest.
- **Head bootstrap is `is:inline` and hand-mirrors `detectLang`.** It cannot import the module, so the three-level guard logic (stored → falsy nav-lang → prefix test) is duplicated in vanilla JS at `BaseLayout.astro:106`. The two must stay in sync; the inline script has no test coverage of its own.
- **`applyAttrI18n` skips unknown keys.** The static Chinese default on the element survives, so a typo in a `data-i18n-aria` key never overwrites the fallback with the literal key string. This is the inverse of `t()`, which echoes the key for graceful degradation — different concerns.
- **Body tag and existing theme/accent fields are unchanged.** `norvyn-v2` blob keeps `theme` and `accent`; `lang` is added without breaking existing readers. `THEME_LS_KEY` is the same string.
- **Admin pages are out of scope.** `pages/admin/*` keeps its existing single-language chrome; bilingual admin is not in Phase 1.
- **Date locale stays `zh-CN`.** `toLocaleDateString('zh-CN')` in build-time API calls and runtime comment rendering is intentionally not localized. This is the "no surprises" boundary for a chrome-only change; date format localization is Phase 2 territory.
- **Feed / RSS / sitemap / `llms.txt` titles stay Chinese.** The RSS title `文章` in `BaseLayout.astro:55` is feed metadata, not user-visible chrome.
- **Active `[data-l]` is forced `display: inline`.** Dictionary values must be inline content (text or inline markup like `<em>` / `<strong>`); block-level elements would break. The `T.astro` component comment calls this out explicitly.

## Deviation Record

| # | Type | Design Intent | Current Implementation | Source |
|---|------|---------------|----------------------|--------|
| 1 | 推迟 | Phase 1 plan § Phase 2 lists URL-locale `/en`, `hreflang`, per-language sitemap, and API-content translation as Phase 2 goals | Shipped scope is client-side toggle only; no `/en` route, no `hreflang`, no content translation; API bodies (article, app, podcast) remain Chinese | dev-guide § Phase 2 |
| 2 | 推迟 | Phase 1 plan § "OUT" lists "feed/sitemap/llms" metadata | `<title>文章</title>` in RSS link (BaseLayout.astro:55), sitemap, llms.txt remain Chinese | plan § "OUT" |
| 3 | 推迟 | Phase 1 plan § "OUT" lists "日期格式" | `toLocaleDateString('zh-CN')` in `api.ts:160` (build-time) and `CommentSection.astro:188` (runtime) remain Chinese-formatted | plan § "OUT" |

No scope deviations from the Phase 1 plan were detected — all shipped user-visible behavior matches the design intent exactly. The three items above are explicit OUT markers from the plan, recorded as deferred-to-Phase-2 for traceability rather than as unplanned scope cuts.

## Change History

| Date | Change |
|------|--------|
| 2026-06-11 | Initial spec (generated by /write-feature-spec) |

## Decisions

None. All architectural decisions were locked during the design session: client-side preference (not URL-locale), default-by-navigator-language, Claude translates with hero/About final-pass by user, and DP-001=B dual-copy CSS for flash-free text swap. The implementation matches these choices. The Phase 2 deferral (URL-locale, content translation, hreflang) is by design, not a deferred decision.
