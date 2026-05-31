---
type: plan
phase: 4
dev_guide: docs/06-plans/2026-05-30-frontend-redesign-dev-guide.md
design_ref: docs/design/reference/norvyn.com - App Detail.html
created: 2026-05-31
status: draft
---

# Phase 4 Plan — App Detail (/apps/[slug])

**Goal:** One data-driven template (`getStaticPaths` over published apps) rendering each app's landing page per the App Detail reference, per-app `--app`/`--app-2` coloring, real icon/screenshots with CSS-placeholder fallback, empty-safe. Renders the real Phase-3.5 data (Delphi: 15 screenshots, 5 features, #0CA8E5).

**Scope:** hero (icon + name + cat + tagline + meta row + App Store CTA + phone preview) · Features · Screenshots strip · About + credit · More apps. `getStaticPaths` over `getApps({status:'published'})`. Strip the reference's tweaks/edit-mode/font-switcher (BaseLayout owns chrome).

## Grounding facts (verified this session)

- **Design ref** `docs/design/reference/norvyn.com - App Detail.html`: spine sections 00 hero / 01 Features / 02 Screens / 03 About / 04 More. `--app-2 = shade(accentColor,-28)` (shade fn at ref lines 423-424). Meta row = 版本/评分★(count)/价格/系统要求/分类. **Reference icon, phone screen, and screenshots are all CSS-fake placeholders** (`.ad-icon` letter, `.ring`, `.sf-bar`/`.sf-ring`) — real data must swap in `<img>`.
- **Shared CSS** `.row2/.spine/.item/.sec/.list/.arrow` already in `BaseLayout.astro` (16 hits). Page-specific `.ad-hero/.ad-id/.ad-icon/.ad-tag/.ad-meta/.ad-cta/.btn/.phone/.feat-row/.shots/.shot/.shot-frame/.about/.ad-credit/.app` are NOT shared → add for this page.
- **`api.ts` App interface** (line 197): has all fields. `features/screenshots/links` are JSON **strings** (parse in consumer). `releaseDate/currentVersionReleaseDate` are unix **timestamps** (number) → reuse `formatMonoDate` (home.ts) for `2026 · 05 · 12`; year via `getUTCFullYear()`.
- **Home already links** `/apps/${slug}` (featured + `.item.app`) and renders real icon `<img>` with `name.charAt(0)` letter fallback — match that pattern.
- **`tokens.css:77`** documents the `--app`/`--app-2` convention; no page sets it yet — Phase 4 implements it.
- **Real Delphi data** (live in local DB, published): icon URL present, 15 screenshot URLs (`…/1290x2796bb.png`), accentColor `#0CA8E5`, 5 emoji features, category `Productivity`, version 1.0, price ¥1.00, **rating 0 / count 0**, minOS 18.6, description = long plain-text blob with `【…】` sections + `•` bullets + trailing 订阅说明/隐私 URLs.

## Decisions (all Chosen — user delegated "按合理默认走"; defaults follow empty-safe global constraint)

- **[DP-4.1] About rendering:** real `description` is a plain-text blob (`\n` newlines, `【…】` headers, `•` bullets), NOT the reference's curated HTML paragraphs. Render with paragraph split on blank lines + `white-space: pre-line` to preserve single newlines/bullets. Render **full** text (no trim — empty-safe, no fabrication; editorial trimming deferred to the reverse-integration MCP track). HTML-escape (plain text, not markdown).
- **[DP-4.2] Features icon:** real features store an emoji (`🎙️🔗📝🌱📊`). Render the stored `icon` string directly in `.feat-ic` as text (font-size ~21px) instead of the reference's SVG-by-name set. If `icon` is empty, show a neutral dot. (Reference SVG icon set not used — data is emoji.)
- **[DP-4.3] Phone preview = first screenshot** (real `<img>`); if no screenshots, fall back to the reference CSS placeholder screen.
- **[DP-4.4] Rating meta cell hidden when `!ratingCount`** (0 or null) — Delphi is 0/0. Other meta cells omitted when their field is null (null-safe).
- **[DP-4.5] More apps = other published apps (exclude current); hide whole section when empty** (only Delphi published now → section absent).
- **[DP-4.6] Credit developer line = static `norvyn`** (no developer field stored). 首发 = `releaseDate` year; 最近更新 = `formatMonoDate(currentVersionReleaseDate)`.
- **[DP-4.7] Screenshots = real `<img>` when `screenshots[]` non-empty; else CSS-placeholder fallback** (dev-guide scope). Icon = real `<img>` else `name.charAt(0)` letter (match Home).
- **[DP-4.8] `--app`/`--app-2` set per page** via `<style define:vars>` on the page (computed at build): `--app = accentColor ?? site --accent`; `--app-2 = shade(accentColor, -28)`. Scope to the page so site `--accent` is unchanged elsewhere.

## Impact Map

| Change | File | Consumers |
|---|---|---|
| New `shade()` + JSON-parse guards + meta-cell builder + formatting | `packages/web/src/lib/app.ts` (new) | `apps/[slug].astro`; `app.test.ts` |
| New page-specific styles (ported, real-image variants) | `packages/web/src/styles/app-detail.css` (new) or page `<style>` | `apps/[slug].astro` |
| New template | `packages/web/src/pages/apps/[slug].astro` (new) | resolves Home's existing `/apps/:slug` links |
| Unit tests | `packages/web/src/lib/app.test.ts` (new) | vitest |

> No edits to existing files — purely additive. Home's `/apps/:slug` links (currently dangling) start resolving.

---

## Task 1 — `src/lib/app.ts` (build utils) + tests

**Files:** `packages/web/src/lib/app.ts` (new), `packages/web/src/lib/app.test.ts` (new)

**Steps:**
1. Port `shade(hex, pct)` verbatim from the reference (App Detail.html:423-424): lighten/darken a `#rrggbb` by pct (-100..100). Guard non-hex input → return input unchanged.
2. `parseJsonArray<T>(s: string | null): T[]` — safe JSON.parse of features/screenshots/links; return `[]` on null/malformed/non-array (try/catch).
3. `appColors(accentColor: string | null, siteAccent='#3457B6'): { app: string; app2: string }` — `app = accentColor ?? siteAccent`; `app2 = shade(app, -28)`.
4. `buildMetaCells(app): Array<{k:string; v:string}>` — null-safe cells in order: 版本 `v{version}` (if version); 评分 (ONLY if `ratingCount`) `★{rating} ({ratingCount})`; 价格 (if price); 系统要求 (if minimumOsVersion); 分类 (if category, `.split(' · ').pop()`). Omit any cell whose source is null/falsy. Return star marker as a flag for the template to render the SVG (keep HTML out of the data).
5. `descriptionParagraphs(desc: string | null): string[]` — split on `/\n\s*\n/`, trim, drop empties; each paragraph rendered with `white-space:pre-line` (DP-4.1). Return `[]` if null.
6. `formatYear(ts: number | null): number | null` — `ts == null ? null : new Date(ts * 1000).getUTCFullYear()` (releaseDate stored in **seconds**). MR-2: `getUTCFullYear` is a Date instance method, not a free function — Task 3 step 7 must use THIS helper.

**Verification (`pnpm vitest run app`):**
- `shade('#0CA8E5',-28) === '#0979a5'` (exact literal: 12·.72→9, 168·.72→121=0x79, 229·.72→165=0xa5); `shade('not-a-hex',-28)==='not-a-hex'`.
- `parseJsonArray(null)===[]`, `parseJsonArray('[{"a":1}]')` length 1, `parseJsonArray('garbage')===[]`.
- `buildMetaCells` with `ratingCount=0` → NO 评分 cell; with `ratingCount=1200` → 评分 present. Null version/price/minOS/category → those cells omitted. category `'Productivity'` → `分类 Productivity`.
- `appColors('#0CA8E5', …).app2 === '#0979a5'` (exact literal, NOT `shade(...)` — that would be tautological); `appColors(null).app === '#3457B6'` (site accent).
- `formatYear(null)===null`; `formatYear(1714377600)` → a 4-digit year (e.g. 2024).
- `descriptionParagraphs` splits the real Delphi blob into ≥2 paragraphs, preserves `【语音捕获】` line.

## Task 2 — page-specific styles

**Files:** `packages/web/src/styles/app-detail.css` (new), imported by the page.

**Steps:**
1. Port from the reference's `<style>` ONLY the page-specific blocks: `.ad-hero/.ad-id/.ad-icon/.ad-tag/.ad-meta(.k/.v/.star)/.ad-cta/.btn(.btn-1/.btn-2)/.phone/.screen/.s-top/.feat-row/.feat-ic/.shots/.shot/.shot-frame/.cap/.about/.ad-credit/.app(.app-ic/.app-r/.store)` + the `@media(max-width:880px/560px)` rules for these. Do NOT re-declare shared `.row2/.spine/.item/.sec/.list/.arrow/.mono/.wrap` (already global in BaseLayout) — verify no duplication.
2. **Real-image adaptations:** `.ad-icon img{width:100%;height:100%;object-fit:cover;border-radius:inherit;}`; `.shot-frame img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}`; phone `.screen img{...cover}`. Keep the CSS-placeholder internals (`.ring/.sf-bar/.sf-ring/.sf-pill`) for fallback only.
2a. **MR-5 (About overflow):** add `.about p{ overflow-wrap:anywhere; }` — Delphi's description ends with long subscription/privacy URLs that overflow horizontally under `white-space:pre-line` without this.
3. Do NOT port `#tweaks/.tw-*/.seg/.sw`, nav, footer, or the EDITMODE/font-switcher CSS (BaseLayout owns chrome; tweaks stripped per global constraint).
4. `.feat-ic` adjusted to render an emoji as text (font-size:21px; the `color:var(--accent)` stays for any SVG fallback).

**Verification:** `pnpm build` compiles the CSS; grep the built `/apps/*` HTML for `.ad-hero`/`.shot-frame` and absence of `tweaks`/`EDITMODE`.

## Task 3 — `src/pages/apps/[slug].astro` (template)

**Files:** `packages/web/src/pages/apps/[slug].astro` (new)

**Steps:**
1. `getStaticPaths` (mirror posts/[slug].astro): `const { data: apps } = await getApps({ status:'published', limit: 10000 })` — **MR-3: `limit` is required; API default is 20 (`app.service.ts:34`), would silently drop apps 21+**. Map each → `{ params:{slug}, props:{ app, moreApps: apps.filter(a=>a.slug!==app.slug) } }`. Empty published set → returns `[]` (no pages, build still succeeds — empty-safe).
2. Frontmatter: import BaseLayout, `getApps`, `type App`, `formatMonoDate` (home.ts), and `shade/parseJsonArray/appColors/buildMetaCells/descriptionParagraphs` (app.ts). Compute `features=parseJsonArray(app.features)`, `screenshots=parseJsonArray<string>(app.screenshots)`, `links=parseJsonArray(app.links)`, `{app:appC, app2}=appColors(app.accentColor)`, `meta=buildMetaCells(app)`, `paras=descriptionParagraphs(app.description)`.
3. `<BaseLayout title={`${app.name} — norvyn`} description={app.tagline ?? ''}>`. **MR-1: set `--app`/`--app-2` via an inline `style` attribute on a `<div id="top">` wrapper** (MR-1b: NOT `<main>` — BaseLayout.astro:81 already renders `<main><slot/></main>`, a nested `<main>` is invalid HTML5; existing pages use `<article>`/`<div>` as slot content) — `<div id="top" style={`--app:${appC};--app-2:${app2}`}>` — NOT `define:vars` (Astro `define:vars={{app2}}` emits `--app2`, no hyphen, ≠ the ported CSS's `var(--app-2)` → darkened color silently never applies). Inline style on `<main>` scopes the vars to this page's subtree, leaving site `--accent` untouched everywhere else (DP-4.8). Import `app-detail.css`. Do NOT add a self-referencing `{--app:var(--app)}` remap.
4. **Hero (spine 00):** `.ad-icon` → real `<img src={app.icon}>` else `{app.name.charAt(0)}`. `h1={app.name}`, `.cat={app.category}`. `.ad-tag={app.tagline}`. `.ad-meta` → `meta.map(cell)` (render 评分 cell's star as the SVG when `cell.star`). `.ad-cta`: `App Store ↗` → `app.appStoreUrl ?? `https://apps.apple.com/app/id${app.appStoreId}`` (construct if appStoreUrl null), + `了解更多`→`#about`. `.phone .screen` → first screenshot `<img>` (DP-4.3) else placeholder.
5. **Features (01):** hide section if `features.length===0`; else `.feat-row` items: `.feat-ic` renders `f.icon` emoji as text; title `f.title`, sub `f.blurb`.
6. **Screenshots (02):** hide if `screenshots.length===0`; else `.shots` → each `.shot/.shot-frame` with real `<img src={url}>` + `.cap` `0N`.
7. **About (03):** `.about` → `paras.map(p=> <p style="white-space:pre-line">{p}</p>)`; `.ad-credit` → 首发 `{formatYear(app.releaseDate)}` (MR-2: the `formatYear` helper, NOT a bare `getUTCFullYear`) · 最近更新 `{formatMonoDate(app.currentVersionReleaseDate)}` · 开发者 norvyn (omit a credit if its date is null).
8. **More (04):** hide section if `moreApps.length===0` (DP-4.5); else `.item.app` rows (icon/name/tagline/category·year + App Store).

**Verification:** `pnpm build` emits `/apps/delphi-认识你自己/index.html`; see Task 4.

## Task 4 — Build verification (real + empty-safe)

**Steps:**
1. Ensure local API (:4101 or :4100) serves the published Delphi (already seeded in Phase 3.5). Run `pnpm build` in packages/web.
2. Assert built `dist/apps/delphi-认识你自己/index.html` contains: real icon `<img>`, inline `--app:#0CA8E5` + `--app-2:#0979a5` (darkened, hyphenated var name present), **15 `<img>` screenshots** (the `1290x2796bb.png` URLs), 5 feature rows, meta row WITHOUT a 评分 cell (ratingCount 0), category `Productivity`, App Store CTA href, About paragraphs, NO `tweaks`/`EDITMODE`/font-switcher. **MR-5: About section has `overflow-wrap:anywhere` and the trailing 隐私政策/用户协议 URLs do not overflow horizontally** (visual check — long notion.site URLs wrap).
3. Empty-safe check: confirm no `/apps/*` page is generated for the 8 draft apps (only published Delphi). (Optional: temporarily unpublish → build → no /apps pages, build exit 0 — or reason from getStaticPaths filter.)
4. `pnpm vitest run` full green; `astro check` 0 errors.

**Verification:** build exit 0; dist assertions pass; ⚠️ 真机/浏览器视觉确认(双色上色、横滑截图手感、手机预览)留累积评审。

---
## Verification
- **Verdict:** Approved
- **Date:** 2026-05-31
- **Cycle 1 (--fast/Sonnet):** must-revise 5 (define:vars hyphen, formatYear, getApps limit, tautological test, About overflow) — all applied.
- **Cycle 2 (focused):** 4/5 confirmed; 1 new (nested `<main>` invalid — my MR-1 fix kept reference's `<main>`) fixed → `<div id="top">` (BaseLayout:81 owns `<main>`, verified).
