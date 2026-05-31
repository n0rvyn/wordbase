## Implementation Review Summary
**Status:** complete
**Plan:** docs/06-plans/2026-05-31-phase6-about-plan.md
**Design ref:** docs/design/reference/norvyn.com - About.html
**Reviewed:** 2026-05-31

---

## Verdict

**PASS.** Phase 6 (/about + accent picker) is faithfully implemented against the plan, and every divergence from the design reference is authorized by decision D-001/D-002 or by the confirmed phase scope. 0 plan-vs-code gaps. All 6 user-requested verification items confirmed by tool. One pre-existing, non-blocking observation surfaced (dark-mode accent override); two cosmetic advisories.

---

## 1. Test Fidelity (falsifiability) — CONFIRMED REAL [C:100]

9 new tests added to `theme.test.ts`, all real and falsifiable (not shells):

- **ACCENTS** (3): length 5 (`:63`), first === DEFAULT_ACCENT (`:64`), contains default (`:66`).
- **isValidAccent** (3): true for `#0E7C66` (`:71`), false for `#ffffff` (`:73`), false for `''` (`:75`).
- **persistAccent** (3): theme-preservation (`:80-83`), null-raw (`:85-88`), round-trip (`:90-92`).

**The theme-preservation test is genuinely falsifiable.** `theme.test.ts:81-83` feeds `persistAccent('{"theme":"dark","accent":"#3457B6"}', '#0E7C66')` and asserts BOTH `result.theme === 'dark'` (`:82`) AND `result.accent === '#0E7C66'` (`:83`). A naive impl returning `JSON.stringify({ accent })` (dropping theme) leaves `result.theme === undefined` → line 82 fails. The actual impl `theme.ts:76-78` uses `mergePrefs(readPrefs(raw), { accent })`, which spreads the existing prefs first, so theme survives. PASS.

Plan Task 2 asked for ≥4 tests with a falsifiable theme-preservation case; delivered 9, requirement exceeded.

---

## 2. Accent Persistence Correctness — CONFIRMED END-TO-END [C:100]

Traced the full loop; it is internally consistent:

- **Picker writes via persistAccent (theme preserved):** `about.astro:320` calls `localStorage.setItem(THEME_LS_KEY, persistAccent(localStorage.getItem(THEME_LS_KEY), value))` — the tested pure helper that preserves `theme`.
- **Live --accent set:** `about.astro:321` `document.documentElement.style.setProperty('--accent', value)`.
- **Active swatch marked on load:** `about.astro:309-312` reads `resolveAccent(readPrefs(...))` and toggles `.sel` on the swatch whose `dataset.value` matches. Click handler moves `.sel` to the clicked swatch (`:322-323`).
- **FOUC bootstrap reads accent on EVERY page:** `BaseLayout.astro:46-61` is `is:inline` in `<head>`, reads `localStorage['norvyn-v2']`, applies `stored.accent || DEFAULT_ACCENT` to `--accent` before paint. `DEFAULT_ACCENT = '#3457B6'` (`BaseLayout:50`) matches `theme.ts:14`.

**Verified in built dist (`dist/about.html`):** bootstrap present, reads `'norvyn-v2'`, `setProperty('--accent', accent)`. Confirmed across all 14 top-level dist pages.

**Conclusion:** a picked accent survives reload AND appears on other pages. The picker write-shape (`{theme, accent}` JSON under `norvyn-v2`) is exactly what the bootstrap reads. CONFIRMED.

---

## 3. Design Fidelity — CSS verbatim; copy diverges (all authorized)

**CSS port: faithful [C:100].** The `.ab-hero` descendant overrides at `about.astro:148-171` match the reference 2nd `<style>` block (About.html:210) exactly — `.ab-hero .eyebrow` (margin-bottom:20px, font-size:12.5px, letter-spacing:.16em), `.ab-hero h1` (font-weight:500, clamp(38px,5.6vw,72px), line-height:1.02, letter-spacing:-.035em, margin:0 0 22px), `.ab-hero .lede` (clamp(17px,1.8vw,20px), line-height:1.7, max-width:46ch). Satisfies D-003. `.portrait`, `.prose-a`, `.now-list/.now-item/.nk/.nv`, `.colophon/.cl/.ck/.cv`, `.contact-row`, `.cbtn`, swatch styles (`.sw-row/.sw/.sw:hover/.sw.sel/.sw.sel::after`), and `.sec` (local) all ported. Responsive `@media 880/560` rules ported. The bare global `.lede`/`.eyebrow` are NOT re-declared (D-003 respected — these come from tokens.css).

**Copy divergences from reference — all AUTHORIZED, none are gaps [C:95]:**

| Element | Reference | Implementation | Authority |
|---|---|---|---|
| spine 00 note | 「一个人，三件事。」 | 「一个人，几件事。」 | D-002 (honest, podcast not 3rd pillar yet) |
| hero lede | 「…也录一档慢节奏的播客…这三件事」 | 「…也在筹备一档慢节奏的播客…这几件事」 | D-002 (podcast pre-launch) |
| Story | fictional (六款App, 八十多篇, 二十多期播客) | honest (Delphi, 128+ posts, podcast 筹备中) | D-002 |
| now-list | 5 items (在做 Tidemark / 在写 / 在录《边角》/ 在读 / 在地) | 4 items (在做 Delphi / 在建 / 在准备 / 在写) | D-002 (dropped fictional + personal) |
| colophon | 4 rows | 5 rows (+「强调色」picker row) | D-001 |
| contact-row | 4 buttons (Email/Mastodon/GitHub/RSS, all href="#") | 2 buttons (Email mailto / GitHub real url) | plan scope §3 |

The accent picker is correctly placed inside the 03 Colophon section as a `.cl` row labeled 「强调色」(D-001).

---

## 4. Honest-Copy Constraint [D-002] — CONFIRMED CLEAN [C:100]

Grep of `dist/about.html` for fictional persona/counts (`Tidemark|六款|《边角》|八十多篇|二十多期|二十多集`) → **0 matches.** Honest markers present: `Delphi` (2), `128+` (2). The 128+ post count is flagged in D-002 as a real figure. No fictional apps, no fake article/episode counts. CONFIRMED.

---

## 5. Footer Blast Radius — CONFIRMED LINK-HREF-ONLY, NO REGRESSION [C:100]

`BaseLayout.astro:99-103` Elsewhere col: Email → `mailto:norvyn@norvyn.com`, GitHub → `https://github.com/n0rvyn` with `target="_blank" rel="noopener noreferrer"`. RSS and Mastodon `<a>` lines deleted. Navigate 关于 → `/about` (`:97`).

Verified across all dist pages:
- `>RSS<` in footer: **0** pages
- `>Mastodon<` in footer: **0** pages
- `mailto:norvyn@norvyn.com`: **14** pages
- `github.com/n0rvyn`: **14** pages
- `href="/about"`: **14** pages
- footer dead `href="#"` (Email/GitHub): **0** pages

The footer `.foot` grid CSS (`BaseLayout:248-278`) is unchanged — pure link-href edit, no structural/style change. Navigate 作品/写作/播客 still point to `/` (Phase 7 deferral, per plan scope). CONFIRMED.

---

## 6. Accessibility — CONFIRMED [C:100]

- **Swatches:** each carries `aria-label` AND `title` (`about.astro:98-99`). Verified in dist: `aria-label="Indigo|Cobalt|Emerald|Graphite|Ember"` all present, plus `data-value` + inline `style="background:#hex"` (so swatch is visible AND named). The buttons are real `<button>` elements (keyboard-focusable).
- **External links:** GitHub in contact-row (`about.astro:128`) and footer (`BaseLayout:102`) both have `rel="noopener noreferrer"` + `target="_blank"`. Verified 2 instances in dist about.html. CONFIRMED.

---

## Dist Build Verification (against plan Task 3/4 Verify)

`dist/about.html` (Astro `build.format: 'file'` → flat file, confirmed `astro.config.mjs:11`):
- 5 spine `class="no"` (00–04) ✅
- 5 `.sw` swatches ✅
- `mailto:norvyn@norvyn.com` ✅, `github.com/n0rvyn` ✅
- 0 `tweaks|EDITMODE|twFont|Schibsted Grotesk` markers ✅ (font stays Geist, no switcher)

---

## Pre-existing Issues

### [PE-001] Dark-mode accent twin (#7088FF) is shadowed by inline --accent — pre-existing, non-blocking [C:90]

**Finding:** `tokens.css:126` defines `:root[data-theme="dark"] { --accent: #7088FF }` (a lighter twin for dark mode, matching the design reference About.html:38). But the FOUC bootstrap (`BaseLayout:56`) and theme toggle (`BaseLayout:126`) both set `--accent` *inline on `document.documentElement`*. An inline style on the element beats any stylesheet `[data-theme="dark"]` selector. So once `localStorage['norvyn-v2'].accent` exists (written the first time the user toggles theme OR picks an accent), the dark twin `#7088FF` never renders — the single chosen accent value applies in BOTH light and dark themes.

**Root cause:** the theme toggle persists `accent: resolveAccent(prefs)` alongside theme (`BaseLayout:145`), seeding an explicit accent into storage that the bootstrap then re-applies inline on every load.

**Origin:** PRE-EXISTING — this behavior comes from the BaseLayout theme toggle + bootstrap, which existed before Phase 6. Phase 6's picker did not introduce it; it inherits it.

**Impact:** low / likely intended. The colophon copy authored this phase reads 「一个可切换的强调色，全站同步」("one switchable accent, site-wide-synced") — a single accent across themes is consistent with that stated model. The design reference's dark-twin is a per-theme nicety that the persistence model overrides by design.

**Recommendation (non-blocking):** No fix required for Phase 6. If per-theme accent twins are desired later, the fix is to NOT persist `accent` unless the user explicitly picks one (let the bootstrap fall through to the stylesheet `[data-theme]` value when no user choice exists). Surface to user for awareness; do not block this phase.

---

## Advisories (cosmetic, not gaps)

- **[A-001] `isValidAccent` has no production caller [C:85].** It is exported, tested (3 tests), but the picker click handler (`about.astro:319`) persists `btn.dataset.value` without calling `isValidAccent`. Since `data-value` is server-rendered from `ACCENTS`, the values are trusted, so validation is unnecessary in practice. Helper is sound; just currently test-only. No action needed.
- **[A-002] Dead import in about script [C:85].** `about.astro:299` imports `ACCENTS` into the client script, used only by `void ACCENTS` (`:329`) to suppress a lint hint. `ACCENTS` is consumed in the frontmatter (server render, `:94`), not the client script. The import + `void` are harmless dead weight; could be removed. No action needed.

---

## Plan Conformance (Tasks 1–4)

- **Task 1** (theme.ts: ACCENTS/persistAccent/isValidAccent): all exports present (`theme.ts:53-78`), hex values + order match plan (Indigo first/default). Existing exports unchanged (additive). ✅
- **Task 2** (theme.test.ts): 9 falsifiable tests, theme-preservation falsifiable. ✅ (≥4 required)
- **Task 3** (about.astro): 5 sections 00–04, picker in colophon, 2 contact links, CSS ported verbatim, swatches carry data-value+style+aria-label. ✅
- **Task 4** (BaseLayout footer): Email/GitHub wired, RSS/Mastodon dropped, 关于→/about, link-href-only. ✅

No unauthorized deferrals. No silent degradation. No scope creep. Deferred items (issue #3 content-sync, issue #4 newsletter, Phase 7 nav/footer 作品/写作/播客) are explicitly captured in the plan and respected.

---

## Decisions

None. Phase 6 passes without requiring a user decision. PE-001 is surfaced for awareness, not as a blocking decision.

---

### Plan-vs-Code gaps: 0 (C>=80), 0 filtered (C<80)
### Design Fidelity: A: 0 mismatches, B: connected, C: clean (stale Tweaks fully removed), D: all features built, E: faithful (copy divergences all D-001/D-002/scope-authorized)
### Tests: 9 required-region, 9 exist, 9 cover core path, shell: 0
### Pre-existing: 1 (PE-001, non-blocking)
