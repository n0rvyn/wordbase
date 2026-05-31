---
type: plan
phase: 6
project: norvyn.com Frontend Redesign
dev_guide: docs/06-plans/2026-05-30-frontend-redesign-dev-guide.md
design_ref: docs/design/reference/norvyn.com - About.html
created: 2026-05-31
contract_version: 1
---

# Phase 6 Plan — About (/about) + accent picker

**Project health:** yellow (doc-drift: no project-context file; module_size: generated `schema.d.ts`; active_churn: 12 dirty files from P3.5–P5 uncommitted). None block this phase — all pre-existing, web frontend untouched by them.

**Goal:** Ship `/about` (faithful port of the About reference layout) and relocate the stripped Tweaks accent control into the page as 5 swatches that persist `localStorage['norvyn-v2'].accent` site-wide. Editorial copy is **honest-real v1** (no fictional persona, no fake counts) — data-driven content sync is deferred (issue #3).

**Scope (confirmed with user 2026-05-31):**
1. New `/about` page: 00 hero + portrait, 01 Story, 02 Now, 03 Colophon (with accent picker), 04 Say hi (contact).
2. Accent picker: 5 swatches (Indigo `#3457B6` default + Cobalt `#2C4EE0` / Emerald `#0E7C66` / Graphite `#3F3F46` / Ember `#B4612A`), click re-points `--accent`, persists, reflected on all pages on next load. Data-sourced from a `theme.ts` `ACCENTS` constant (not hardcoded HTML).
3. Contact links: Email `mailto:norvyn@norvyn.com` + GitHub `https://github.com/n0rvyn`. **No Mastodon** (user has none), **no RSS** (site has no feed; user wants email-subscription instead → deferred issue #4).
4. Wire BaseLayout footer "Elsewhere" Email/GitHub to the real values; drop the two dead RSS/Mastodon links; point footer Navigate "关于" → `/about`.

**Out of scope (deferred, captured):**
- GitHub+ASC → About content auto-update skill (issue #3, overlaps Phase 8). Editorial copy stays honest-static v1.
- Email subscription / newsletter (issue #4).
- Nav-bar About entry + footer Navigate 作品/写作/播客 hrefs → **Phase 7** (site-wide nav/footer wiring), same transition state as /writing & /podcast. `/about` is reachable this phase via direct URL + footer 关于 link.

## Decisions

- **[D-001]** Accent picker placement: inside the **03 Colophon** section, as a `.cl` row labeled「强调色」whose value is the `.sw-row` swatches. Rationale: the colophon's 主题 line already reads "一个可切换的强调色，全站同步" — the control lives where its description is. (UX placement decision; surfaced for user review at phase summary.)
- **[D-002]** Editorial copy = honest-real. Story/Now reference only true facts (Delphi published; podcast pre-launch; this redesign in progress; 128+ real posts). Colophon is codebase-derived (Geist/Noto/Geist Mono fonts, hairline token system, light/dark + accent, Built with Wordbase) — all verified true. No fictional apps/counts. Draft presented at summary for correction.
- **[D-003]** Global `.lede` + `.eyebrow` (tokens.css:154,156) provide the BASE; do NOT re-declare the bare class. BUT the reference scopes hero-specific overrides as descendants (`.ab-hero .eyebrow` adds `margin-bottom`; `.ab-hero h1` sets `font-weight:500` + its own clamp; `.ab-hero .lede` adds `max-width:46ch` + `line-height:1.7`) — port these `.ab-hero …` descendant rules verbatim (they layer on the global base, descendant wins on conflicts; this is the reference's own model, About.html:210). Redeclare other About-specific classes + `.sec` (local, per podcast.astro precedent).
- **[D-004]** Accent persistence single-source-of-truth stays `theme.ts`. Add pure `persistAccent(raw, accent): string` + `isValidAccent(accent): boolean` + `ACCENTS` there (testable); the About `<script>` imports them. No logic duplication.

## Impact Map

| Change | Direct file | Consumers / blast radius |
|---|---|---|
| `ACCENTS` + `persistAccent` + `isValidAccent` | `src/lib/theme.ts` | about.astro script; theme.test.ts. Existing BaseLayout toggle imports unaffected (additive exports). |
| New page | `src/pages/about.astro` | Astro `getStaticPaths`-free single route → `dist/about/index.html`. +1 page. |
| Footer Elsewhere/Navigate links | `src/layouts/BaseLayout.astro` | **All pages** (shared layout). Change is link-href only (Email/GitHub real, drop RSS/Mastodon, 关于→/about). No structural/style change. |
| Accent persistence UT | `src/lib/theme.test.ts` | vitest suite (currently 113). |

---

## Task 1 — theme.ts: ACCENTS list + accent persistence helpers

**Files:** `packages/web/src/lib/theme.ts`

**Task Contract:**
- Precondition: `theme.ts` exports `THEME_LS_KEY`, `DEFAULT_ACCENT`, `readPrefs`, `mergePrefs`, `resolveAccent` (verified present).
- Postcondition: new exports `ACCENTS`, `persistAccent`, `isValidAccent`; existing exports unchanged; `astro check` clean.

**Steps:**
1. Add `export interface AccentOption { value: string; name: string }`.
2. Add `export const ACCENTS: AccentOption[]` in order: Indigo `#3457B6` (default, first), Cobalt `#2C4EE0`, Emerald `#0E7C66`, Graphite `#3F3F46`, Ember `#B4612A`. (Hexes verified against the reference's stripped Tweaks `ACCENTS` array + dev-guide.)
3. Add `export function isValidAccent(accent: string): boolean` → `ACCENTS.some(a => a.value === accent)`.
4. Add `export function persistAccent(raw: string | null, accent: string): string` → `JSON.stringify(mergePrefs(readPrefs(raw), { accent }))`. Returns the new localStorage blob; preserves `theme`. Does NOT write to localStorage itself (pure, testable).

**Verify:** `cd packages/web && npx tsc --noEmit` (or astro check) → 0 errors.

## Task 2 — theme.test.ts: accent persistence helper tests

**Files:** `packages/web/src/lib/theme.test.ts`

**Task Contract:**
- Precondition: Task 1 exports exist.
- Postcondition: ≥4 new falsifiable tests; full vitest suite green.

**Steps:**
1. `ACCENTS` contains `DEFAULT_ACCENT` and has length 5; first entry value === `DEFAULT_ACCENT` (`#3457B6`).
2. `isValidAccent('#0E7C66')` true; `isValidAccent('#ffffff')` false; `isValidAccent('')` false.
3. `persistAccent` preserves an existing theme: `persistAccent('{"theme":"dark","accent":"#3457B6"}', '#0E7C66')` → parsed has `theme:'dark'` AND `accent:'#0E7C66'` (falsifiable: a wrong impl that drops theme fails).
4. `persistAccent(null, '#2C4EE0')` → `{accent:'#2C4EE0'}` (no theme key, no throw).
5. Round-trip: `resolveAccent(readPrefs(persistAccent(raw, '#B4612A')))` === `#B4612A`.

**Verify:** `cd packages/web && npx vitest run src/lib/theme.test.ts` → all pass; then full `npx vitest run`.

## Task 3 — about.astro page

**Files:** `packages/web/src/pages/about.astro` (new)

**Task Contract:**
- Precondition: BaseLayout accepts `title`/`description`; tokens.css provides `.lede`/`.eyebrow`/`.row2`/`.spine`/`.sec`(no — local)/`.wrap`.
- Postcondition: page builds → `dist/about/index.html` with 5 spine-numbered sections (00–04), accent picker (5 swatches), 2 contact links; 0 `#tweaks`/`EDITMODE`/font-switcher markers; `astro check` clean.

**Steps:**
1. Frontmatter: `import BaseLayout`; `import { ACCENTS } from '../lib/theme'`. No API calls needed (static editorial v1).
2. Markup mirrors the reference About body structure (spine `row2` per section):
   - **00 hero** (`.sec.wrap` border-top:none): spine `00 / About / 一个人，几件事。`; `.ab-hero` = left (`.eyebrow` "Independent developer", `<h1>关于 norvyn</h1>`, `.lede` honest copy) + `.portrait` (letter "N" fallback, no real image yet → CSS gradient block per reference).
   - **01 Story** (`.prose-a`): honest-real paragraphs per [D-002]. `<strong>` for emphasis.
   - **02 Now** (`.now-list` / `.now-item` k/v rows): 在做 / 在写 / 在准备 — only true facts per [D-002].
   - **03 Colophon** (`.colophon` / `.cl` rows): 设计 / 字体 / 主题 / 构建 — codebase-true. After the 主题 row, add a `.cl` row 「强调色」whose `.cv` holds `<div class="sw-row" id="accentPicker">{ACCENTS.map(a => <button class="sw" data-value={a.value} title={a.name} aria-label={a.name} style={\`background:${a.value}\`}></button>)}</div>` ([D-001]). **Each swatch MUST carry both `data-value` (the click handler reads `dataset.value`) and inline `style="background:<hex>"` (else the swatch is invisible)** — mirrors the reference Tweaks markup (About.html:230).
   - **04 Say hi** (`.contact-row`): `.cbtn.pri` Email → `mailto:norvyn@norvyn.com`; `.cbtn` GitHub → `https://github.com/n0rvyn` (`target="_blank" rel="noopener noreferrer"`). No Mastodon/RSS.
3. Scoped `<style>`: port About-specific rules from the reference's 2nd `<style>` block (About.html:210) verbatim — `.ab-hero`, **the hero descendant overrides `.ab-hero .eyebrow {margin-bottom:20px; font-size:12.5px; letter-spacing:.16em; ...}`, `.ab-hero h1 {font-family:var(--font-display); font-weight:500; font-size:clamp(38px,5.6vw,72px); line-height:1.02; letter-spacing:-.035em; margin:0 0 22px;}`, `.ab-hero .lede {font-size:clamp(17px,1.8vw,20px); line-height:1.7; max-width:46ch; margin:0;}`** ([D-003]), `.portrait`, `.prose-a`, `.now-list/.now-item/.nk/.nv`, `.colophon/.cl/.ck/.cv`, `.contact-row`, `.cbtn`, plus `.sec` (local, per podcast precedent) and the swatch styles `.sw-row/.sw/.sw:hover/.sw.sel/.sw.sel::after`. Do NOT redeclare the bare global `.lede`/`.eyebrow` — only the `.ab-hero …` descendants above. Include the reference's About responsive rules (`@media 880/560`).
4. Accent picker `<script>` (bundled module): `import { ACCENTS, persistAccent, readPrefs, resolveAccent, THEME_LS_KEY } from '../lib/theme'`. On load: read prefs (`resolveAccent(readPrefs(localStorage.getItem(THEME_LS_KEY)))`), mark the matching `.sw` as `.sel`. On swatch click: read `value = btn.dataset.value` (matches the `data-value` set in Step 2), `localStorage.setItem(THEME_LS_KEY, persistAccent(localStorage.getItem(THEME_LS_KEY), value))`, `document.documentElement.style.setProperty('--accent', value)`, then move `.sel` to the clicked swatch. (Theme untouched; reuses tested persistence.)

**Verify:** `cd packages/web && pnpm build` → `dist/about/index.html` exists; grep it: 5 spine `class="no"` (00–04), 5 `.sw` swatches, `mailto:norvyn@norvyn.com`, `github.com/n0rvyn`, 0 `tweaks|EDITMODE|font-display:.*Grotesk|twFont`.

## Task 4 — BaseLayout footer: wire contact links, drop dead links

**Files:** `packages/web/src/layouts/BaseLayout.astro`

**Task Contract:**
- Precondition: footer Elsewhere col has 4 `href="#"` links (Email/RSS/Mastodon/GitHub); Navigate 关于 → `/archives`.
- Postcondition: Elsewhere = Email (`mailto:norvyn@norvyn.com`) + GitHub (`https://github.com/n0rvyn`, `target=_blank rel=noopener`); RSS + Mastodon removed; Navigate 关于 → `/about`. No other footer/nav change (作品/写作/播客 + nav-bar About entry stay Phase 7).

**Steps:**
1. In `.foot-col` Elsewhere: replace `<a href="#">Email</a>` → `<a href="mailto:norvyn@norvyn.com">Email</a>`; replace `<a href="#">GitHub</a>` → `<a href="https://github.com/n0rvyn" target="_blank" rel="noopener noreferrer">GitHub</a>`; delete the RSS and Mastodon `<a>` lines.
2. In `.foot-col` Navigate: `<a href="/archives">关于</a>` → `<a href="/about">关于</a>`.

**Verify:** `cd packages/web && pnpm build`; grep any `dist/*/index.html`: footer has `mailto:norvyn@norvyn.com` + `github.com/n0rvyn`, 0 footer `href="#"` for Email/GitHub, 0 `>RSS<`/`>Mastodon<` in `.foot-col`.

---

## Phase-level acceptance (maps to dev-guide Phase 6)

- [ ] /about builds with all 4 sections (00 hero counts as header; 01–04 Story/Now/Colophon/Say-hi). → Task 3 build + dist grep.
- [ ] Accent picker changes site accent and persists across reload + other pages. → Task 1+3; verify dist swatches + persistAccent UT + bootstrap reads LS on every page.
- [ ] No floating Tweaks panel anywhere; font stays Geist (no switcher). → Task 3 grep 0 `tweaks|EDITMODE|twFont|Grotesk` in about dist.
- [ ] UT for accent persistence helper; build verify. → Task 2 (≥4 tests), full vitest + build.

## Test strategy

- **Unit (vitest):** Task 2 — 5+ accent-helper tests, falsifiable (theme-preservation test fails a naive impl).
- **Build/dist assertions:** about.astro renders 5 sections + 5 swatches + 2 real contact links + 0 stripped-feature markers; footer wired across pages.
- **No seeding needed:** About is static editorial — no API/empty-safe branching this phase.
- **astro check:** 0 err/0 warn (regression gate from prior phases).
