---
type: feature-spec
status: active
tags: [about, accent-picker, theme, contact, colophon, editorial]
refs:
  - docs/design/reference/norvyn.com - About.html
  - docs/06-plans/2026-05-31-phase6-about-plan.md
  - docs/06-plans/2026-05-30-frontend-redesign-dev-guide.md
---

# About Page + Accent Picker

> A static editorial /about page (00 hero · 01 Story · 02 Now · 03 Colophon · 04 Say hi) on the new design system, with a 5-swatch accent picker in Colophon that persists `localStorage['norvyn-v2'].accent` site-wide.

**Design sources:**
- `docs/design/reference/norvyn.com - About.html` — full layout reference (sections 00–04, swatches, contact buttons)
- `docs/06-plans/2026-05-31-phase6-about-plan.md` — scope confirmation, D-001 through D-004 design decisions
- `docs/06-plans/2026-05-30-frontend-redesign-dev-guide.md` § Phase 6

---

## User Stories

- 用户可以访问 `/about` 页面，阅读站点作者的个人介绍 → `packages/web/src/pages/about.astro:7` ✅
- 用户可以在 Story 区（01）读到作者的背景与信念 → `packages/web/src/pages/about.astro:32` ✅
- 用户可以在 Now 区（02）了解作者当前在做的事 → `packages/web/src/pages/about.astro:49` ✅
- 用户可以在 Colophon 区（03）了解站点使用的设计、字体与技术栈 → `packages/web/src/pages/about.astro:77` ✅
- 用户可以在 Colophon 区点击 5 个色块之一切换全站强调色 → `packages/web/src/pages/about.astro:93` ✅
- 用户可以在页面重载后或切换到其他页面后看到强调色依然保持选择 → `packages/web/src/layouts/BaseLayout.astro:56` ✅
- 用户可以在 Colophon 中看到当前激活的强调色被高亮标记 → `packages/web/src/pages/about.astro:309` ✅
- 用户可以在 Say hi 区（04）点击「写封邮件」发送邮件给作者 → `packages/web/src/pages/about.astro:124` ✅
- 用户可以在 Say hi 区点击 GitHub 链接访问作者的 GitHub 主页 → `packages/web/src/pages/about.astro:128` ✅
- 用户可以在页脚「Elsewhere」列找到 Email 与 GitHub 链接 → `packages/web/src/layouts/BaseLayout.astro:101` ✅
- 用户可以在页脚「Navigate」列点击「关于」跳转到 `/about` → `packages/web/src/layouts/BaseLayout.astro:97` ✅
- 用户可以在 Say hi 区点击 Mastodon 链接 → ❌ not implemented (no account; removed per scope decision)
- 用户可以在 Say hi 区点击 RSS 链接订阅内容 → ❌ not implemented (no feed yet; deferred to issue #4)

---

## Expected Behavior

### Scenario 1: Visiting /about

The user navigates to `/about`. The page renders five spine-numbered sections in a left-index grid layout (`.row2` / `.spine`):

- **00 hero**: spine label "About / 一个人，几件事。"; hero area shows eyebrow "Independent developer · 自 2023", H1 "关于 norvyn", a lede paragraph, and a portrait block displaying the letter "N" as a gradient placeholder (no real photo yet).
- **01 Story**: prose paragraphs introducing the author; states 1 published app (Delphi), 128+ blog articles, podcast in preparation.
- **02 Now**: four k/v rows (在做 / 在建 / 在准备 / 在写) with honest real-state content.
- **03 Colophon**: five labeled rows (设计 / 字体 / 主题 / 强调色 / 构建). The 强调色 row contains the accent picker.
- **04 Say hi**: intro sentence + two contact buttons (Email primary, GitHub secondary).

### Scenario 2: Picking an accent color

The accent picker (`.sw-row#accentPicker`) renders 5 circular swatches, each with:
- `data-value` set to the hex string
- `style="background:<hex>"` making the color visible
- `title` and `aria-label` set to the color name

On page load, the script reads `localStorage['norvyn-v2']`, resolves the current accent via `resolveAccent(readPrefs(...))`, and marks the matching swatch with class `.sel` (border + white dot indicator).

When the user clicks a swatch:
1. `persistAccent(localStorage.getItem(THEME_LS_KEY), value)` merges the new accent into the stored blob, preserving the `theme` key.
2. The blob is written back to `localStorage['norvyn-v2']`.
3. `document.documentElement.style.setProperty('--accent', value)` re-points the CSS custom property immediately.
4. The `.sel` class moves to the clicked swatch.

On the next page load (any page), the BaseLayout FOUC-prevention bootstrap (`BaseLayout.astro:46–61`, `is:inline` head script) reads `localStorage['norvyn-v2'].accent` and calls `document.documentElement.style.setProperty('--accent', accent)` before the page paints. This is the mechanism that makes the chosen accent persist site-wide across reloads and page navigations.

### Scenario 3: Contacting the author

The Say hi section offers two contact paths:
- **Email** (`.cbtn.pri`): `href="mailto:norvyn@norvyn.com"` — opens the system mail client. Button label is「写封邮件」with an arrow-out icon.
- **GitHub** (`.cbtn`): `href="https://github.com/n0rvyn"` with `target="_blank" rel="noopener noreferrer"` — opens in new tab.

The same Email and GitHub links appear in the footer Elsewhere column on every page.

### Scenario 4: Footer wiring

All pages share `BaseLayout.astro`. The footer Navigate column contains「关于」pointing to `/about` (not the former `/archives`). The Elsewhere column contains only Email and GitHub; RSS and Mastodon have been removed.

---

## Key Files

| File | Responsibility |
|------|----------------|
| `packages/web/src/pages/about.astro` | About page markup, scoped CSS, accent picker `<script>` |
| `packages/web/src/lib/theme.ts` | `ACCENTS`, `persistAccent`, `isValidAccent`, `AccentOption` — single source of truth for accent persistence logic |
| `packages/web/src/lib/theme.test.ts` | Unit tests for `ACCENTS` (5 entries, Indigo first), `isValidAccent`, `persistAccent` (theme-preservation, null-raw, round-trip) |
| `packages/web/src/layouts/BaseLayout.astro` | FOUC-prevention bootstrap (line 56) applies stored accent on every page; footer Elsewhere (Email + GitHub); footer Navigate (关于 → /about) |

---

## Boundary Conditions / Constraints

- `persistAccent` is pure — it does not write to `localStorage`. The `<script>` in `about.astro` calls `localStorage.setItem` explicitly. This keeps the helper testable without mocking browser APIs.
- `isValidAccent` is not called in the picker's click handler; the handler trusts `data-value` to be one of the 5 known swatches as rendered from the `ACCENTS` array. `isValidAccent` is exported for external validation if needed.
- The FOUC-prevention bootstrap in `BaseLayout.astro` is `is:inline` (cannot import a module) and hand-mirrors `readPrefs` + `resolveAccent`. Changes to `theme.ts` semantics must be kept in sync there manually.
- Font is fixed to Geist — no font switcher is present or planned. `localStorage['norvyn-v2']` stores only `theme` and `accent` keys.
- Portrait is a CSS gradient placeholder (letter "N"); no real photograph is present in v1. No image asset is required to build.
- Editorial copy is honest-static v1. GitHub/ASC data-driven content sync is deferred to issue #3. Email subscription deferred to issue #4.
- `/about` is reachable via direct URL and the footer 关于 link. Nav-bar About entry and footer Navigate 作品/写作/播客 hrefs remain unlinked pending Phase 7.

---

## Deviation Record

| # | Type | Design Intent | Current Implementation | Source |
|---|------|---------------|----------------------|--------|
| 1 | 变更 | Hero spine note reads「一个人，三件事。」; Story claims 6 apps, 80+ articles, 20+ podcast episodes; Now has 5 items including "在地" and "在读" | Spine note reads「一个人，几件事。」; Story states 1 app (Delphi), 128+ articles, podcast in preparation; Now has 4 items (在做/在建/在准备/在写) | design ref line 214 vs about.astro:12,35; design decision D-002 |
| 2 | 简化 | Say hi contact row: Email + Mastodon + GitHub + RSS (4 buttons) | Email + GitHub only (2 buttons); Mastodon removed (no account); RSS removed (no feed, deferred issue #4) | design ref line 214 vs about.astro:123–129; plan Task 3 §04 |
| 3 | 简化 | Footer Elsewhere: Email + RSS + Mastodon + GitHub (4 links) | Email + GitHub only (2 links); RSS + Mastodon removed | design ref line 215 vs BaseLayout.astro:101–102; plan Task 4 |
| 4 | 变更 | Accent picker is in the floating `#tweaks` panel (Tweaks overlay, separate from page content); Colophon has 4 rows (设计/字体/主题/构建) with no picker | Floating Tweaks panel stripped entirely; accent picker relocated into Colophon 03 as a new `.cl` row labeled「强调色」, giving Colophon 5 rows | design ref lines 214,216 vs about.astro:91–112; design decision D-001 |

---

## Decisions

### [DP-001] Accept honest-copy deviations from reference content (recommended)

**Context:** The design reference (About.html) uses fictional counts (6 apps, 80+ articles, 20+ episodes) and fictional "Now" items (Tidemark 2.4, 《边角》season 2). The shipped copy uses real facts per design decision D-002. This is a permanent editorial deviation from the reference HTML, not a temporary draft.

**Options:**
- A: Accept as-is — editorial copy stays honest-real; reference HTML is a layout guide, not a copy source. — Trade-off: intentional divergence from reference, but avoids false claims to users.
- B: Flag as pending — treat fictional reference copy as placeholder, schedule a copy-review pass. — Trade-off: adds a review task, but may catch copy that needs updating as facts change (e.g. when more apps ship).

**Recommendation:** Option A — `docs/06-plans/2026-05-31-phase6-about-plan.md` §D-002 documents this as a confirmed design decision ("honest-real v1"). Fictional counts in the reference are scaffolding, not targets.

### [DP-002] Accept contact reduction (Email + GitHub only) (recommended)

**Context:** The reference specifies 4 contact buttons (Email / Mastodon / GitHub / RSS). Mastodon and RSS are absent from the shipped page. This affects both the Say hi section and the footer Elsewhere column.

**Options:**
- A: Accept as-is — Mastodon (no account) and RSS (no feed) are genuinely absent; adding placeholder buttons would be dishonest. Issue #4 tracks email subscription. — Trade-off: fewer contact paths, but all links are real.
- B: Add RSS link once a feed exists (Phase 5+ podcast feed or blog feed). — Trade-off: requires a Phase 7/8 task when feed is available.

**Recommendation:** Option A for now; Option B is a natural follow-up once issue #4 (email subscription) or a podcast RSS feed is live. `packages/web/src/pages/about.astro:128` confirms GitHub is already wired with a real URL; adding more links requires real destination URLs first.

---

## Change History

| Date | Change |
|------|--------|
| 2026-05-31 | Initial spec (generated by /write-feature-spec) |
