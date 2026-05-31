## Plan Verification Summary
**Status:** complete
**Plan:** docs/06-plans/2026-05-31-phase6-about-plan.md
**Started:** 2026-05-31-140744

---

## S1. Concrete Error Candidates

### [Assertion 1] Task 3 Step 3 — `.ab-hero .eyebrow` / `.ab-hero .lede` descendant rules absent; global classes lack per-hero overrides causing layout defects
**Verification:** Read `packages/web/src/styles/tokens.css:154-159`; read `docs/design/reference/norvyn.com - About.html:210`.

Global `.lede` (tokens.css:154):
```
font-family: var(--font-read); font-size: var(--type-lede); line-height: 1.65; color: var(--ink-2);
```
No `max-width`. No `line-height: 1.7`.

Global `.eyebrow` (tokens.css:156-159):
```
font-family: var(--font-mono); font-size: var(--type-meta); letter-spacing: .14em; text-transform: uppercase; color: var(--ink-3);
```
No `margin-bottom`. Font-size is `var(--type-meta)` = 11.5px, not 12.5px. Letter-spacing `.14em`, not `.16em`.

Reference `.ab-hero .eyebrow` (About.html:210):
```
margin-bottom:20px; font-size:12.5px; letter-spacing:.16em;
```
Reference `.ab-hero .lede` (About.html:210):
```
max-width:46ch; line-height:1.7; font-size:clamp(17px,1.8vw,20px);
```

[D-003] says "reuse global `.lede`/`.eyebrow`, do NOT redeclare." It names the *base classes*. The reference implements its hero-specific sizing/spacing as *descendant selector overrides* (`.ab-hero .eyebrow`, `.ab-hero .lede`), which are scoped additions, not redeclarations of the base class. Plan Task 3 Step 3 lists `.ab-hero` in the scoped style block but does not explicitly call out these two descendant rules. If the executor reads [D-003] as "skip all eyebrow/lede CSS inside About," the hero eyebrow will have no bottom margin and run into the H1, and the lede will stretch the full column width.

**Result:** ❌ Assertion stands [C:88] — the plan's scoped style step enumerates class names but omits explicit guidance to include `.ab-hero .eyebrow` and `.ab-hero .lede` descendant overrides. This is a design-faithfulness gap against the reference.

**Required revision:** In Task 3 Step 3, add: "Include `.ab-hero .eyebrow { margin-bottom:20px; font-size:12.5px; letter-spacing:.16em; }` and `.ab-hero .lede { max-width:46ch; line-height:1.7; font-size:clamp(17px,1.8vw,20px); }` as descendant overrides — these are scoped additions, consistent with [D-003] which forbids redeclaring the base class."

---

### [Assertion 2] Task 3 Step 2/4 — Swatch `<button>` elements rendered from `ACCENTS` lack `data-*` attribute and inline `style="background:..."`, making swatches invisible and click handler unable to read the hex value
**Verification:** Read `About.html:230`:
```js
ACCENTS.map(function(a){
  return '<button class="sw" data-v="'+a.v+'" title="'+a.n+'" style="background:'+a.v+'"></button>'
})
```
Plan Task 3 Step 2 says "`.sw-row` rendered from `ACCENTS`" — no attribute spec.
Plan Task 3 Step 4 says "On swatch click: `localStorage.setItem(THEME_LS_KEY, persistAccent(localStorage.getItem(THEME_LS_KEY), value))`" where `value` is referenced but never defined; in Step 4's handler, `value` must come from a data attribute on the button.

The `AccentOption` interface (Task 1) uses `value` and `name` keys. The SSR markup in about.astro must therefore emit `data-value={accent.value}` (or similar) and `style={`background:${accent.value}`}` for each swatch. Without inline background the swatches are invisible circles. Without the data attribute the click handler has nothing to read.

**Result:** ❌ Assertion stands [C:90] — plan never specifies how the SSR markup for each `.sw` is structured. The omission is falsifiable: an executor who writes `{ACCENTS.map(a => <button class="sw" />)}` produces invisible, non-functional swatches.

**Required revision:** In Task 3 Step 2, add explicit markup shape: `<button class="sw" data-value={a.value} title={a.name} style={`background:${a.value}`}></button>`. In Step 4, clarify: `const value = (e.currentTarget as HTMLButtonElement).dataset.value!`.

---

### [Assertion 3] Task 3 Step 4 — FOUC bootstrap writes `--accent` from LS on every page but the picker's click handler also calls `document.documentElement.style.setProperty('--accent', value)` — cross-page persistence is sound but dark-mode `--accent` override in `tokens.css` gets silently bypassed
**Verification:** Read `tokens.css:126`: `:root[data-theme="dark"] { --accent: #7088FF; }`.

FOUC bootstrap (BaseLayout.astro:51-60) reads `stored.accent` and sets `style.setProperty('--accent', accent)` as an inline style on `:root`. CSS specificity: inline `style` attribute overrides any stylesheet rule, including the dark-mode `:root[data-theme="dark"]` override. So a user in dark mode who picks Indigo (#3457B6) gets a dark-background-with-low-contrast accent rather than the intended #7088FF dark twin. This was pre-existing behavior before Phase 6 (the theme toggle already wrote accent to LS and the bootstrap already re-applied it). The picker makes it user-reachable in a more visible way, but does not introduce a new mechanism.

**Result:** ✅ Assertion partially stands but is pre-existing, not a Phase 6 regression [C:82]. The reference HTML (About.html:226-228) uses the same single-hex approach: `r.style.setProperty("--accent",S.accent)` with no dark-mode twin logic. Phase 6 matches the reference design intent. No plan change required; log as advisory.

---

### [Assertion 4] Task 4 — footer precondition mismatches actual BaseLayout.astro content, specifically the 关于 link
**Verification:** Read `BaseLayout.astro:97`: `<a href="/archives">关于</a>`. Plan Task 4 precondition states "Navigate 关于 → `/archives`" — matches. The plan's step 2 correctly changes this to `/about`. ✅ Assertion not sustained [C:95].

---

### [Assertion 5] Task 2 — vitest is unconfigured in packages/web (memory flag: "no web vitest")
**Verification:** Read `packages/web/package.json`. Scripts include `"test": "vitest run"`. DevDependencies include `"vitest": "^2.1.9"`. Memory note (wordbase-web-frontend-verification.md:25) confirms: "vitest is already installed in packages/web (as of Phase 1); no need to add it."

**Result:** ✅ Assertion not sustained [C:99] — vitest is wired. Task 2 verify step is executable.

---

## S2. Failure Reverse Reasoning

### [Compile failure reasoning]
**Assumed failure:** Task 3 imports `{ ACCENTS }` from `'../lib/theme'` in the Astro frontmatter, but ACCENTS is only added in Task 1. If executed out of order (Task 3 before Task 1), `astro check` fails with "Module '...theme' has no exported member 'ACCENTS'". Additionally the `<script>` block imports `{ ACCENTS, persistAccent, resolveAccent, readPrefs, THEME_LS_KEY }` — `persistAccent` and `isValidAccent` don't exist until Task 1 completes.

**Plan coverage:** ✅ Task ordering (1→2→3→4) makes this dependency explicit. The Task 3 precondition states "Task 1 exports exist." Covered.

**Assumed failure 2:** Task 3's scoped `<style>` contains `.sw.sel::after` (pseudo-element). Scoped Astro styles attach a `data-astro-cid-*` attribute to every element via `is:scoped` — the pseudo-element selector becomes `.sw.sel[data-astro-cid-xxx]::after`. This is standard Astro behavior and works correctly.

**Plan coverage:** ✅ No issue here — Astro scopes pseudo-elements correctly.

### [Runtime regression reasoning]
**Assumed regression A:** User clicks an accent swatch → accent updates live (`setProperty`) and LS is written. User clicks the theme toggle → BaseLayout's toggle handler (BaseLayout.astro:147) calls `JSON.stringify(mergePrefs(prefs, { theme, accent }))` which re-reads LS first (`readPrefs(localStorage.getItem(THEME_LS_KEY))`), then merges with current accent. Since the picker already wrote the new accent to LS, the toggle handler reads it back correctly — accent is preserved through theme toggles.

**Plan coverage:** ✅ The existing toggle handler already round-trips accent via `readPrefs` + `mergePrefs`. The persistence test in Task 2 Step 3 (theme-preservation falsifier) covers exactly this.

**Assumed regression B:** User picks a new accent on /about, navigates to /podcast. The FOUC bootstrap runs on /podcast's page load, reads `localStorage['norvyn-v2'].accent`, and sets `--accent`. Sound.

**Plan coverage:** ✅ Design confirmed by BaseLayout.astro:46-60 inline bootstrap.

**Assumed regression C:** Footer HTML currently shows 4 Elsewhere links (Email/RSS/Mastodon/GitHub) on ALL pages. Task 4 deletes RSS and Mastodon `<a>` lines. If the executor searches for `<a href="#">RSS</a>` and finds multiple occurrences (e.g., if another file duplicates the footer), the deletion might be incomplete.

**Verification:** `grep -rn "RSS\|Mastodon" packages/web/src/layouts/BaseLayout.astro` — only lines 101-104 in BaseLayout. No other template files likely duplicate the footer. Low risk; covered by Task 4's build+grep verify.

**Plan coverage:** ✅ Adequately covered by the build verification step.

---

## T1. Test Coverage Verification

| Code type | Logic tasks | Has test coverage | Type match |
|-----------|-------------|-------------------|------------|
| Business logic | Task 1 (ACCENTS, persistAccent, isValidAccent) | Task 2 (5 unit tests) | ✅ vitest UT |
| Static page | Task 3 (about.astro) | Build+dist grep assertions | ✅ Build check |
| Config/markup | Task 4 (footer links) | Build+grep verify | ✅ |

Task 2 provides 5 falsifiable tests including a theme-preservation test (step 3) that catches naive implementations dropping theme. The round-trip test (step 5) validates end-to-end persistence semantics.

Coverage: 1/1 logic tasks have UT coverage (100%). Type match: ✅.

No T1 gaps.

---

## U1. Design Token Consistency

| Step | UI value | Token | Status |
|------|----------|-------|--------|
| Task 1 — accent hex defaults | #3457B6 (Indigo) | `DEFAULT_ACCENT` in theme.ts + tokens.css:79 | ✅ |
| Task 1 — all 5 accent hexes | per ACCENTS list | Documented in tokens.css:71-78 comment block | ✅ |
| Task 3 — .sec padding | clamp(44px,6vw,84px) | Matches `--sec-pad` in tokens.css:57 and podcast.astro:139 precedent | ✅ |
| Task 3 — .portrait border-radius | 24px | `--r-xl:24px` in tokens.css:47 | ✅ |
| Task 3 — .cbtn border-radius | 99px | `--r-pill:999px` in tokens.css:49 (visual equiv) | ✅ |
| Task 3 — .sw border-radius | 50% (circle) | No token needed (shape, not brand radius) | ✅ |

No U1 gaps. All visual values have design-system grounding.

---

## DF. Design Faithfulness

**Reference:** `docs/design/reference/norvyn.com - About.html`

### Structure mapping

| Reference element | Plan coverage | Status |
|-------------------|--------------|--------|
| 00 hero: `.ab-hero` 2-col grid (text + portrait) | Task 3 Step 2 | ✅ |
| `.portrait` CSS gradient block with "N" fallback | Task 3 Step 2 + Step 3 | ✅ |
| `.eyebrow` "Independent developer" | Task 3 Step 2 | ✅ |
| `<h1>关于 norvyn</h1>` | Task 3 Step 2 | ✅ |
| `.lede` intro copy | Task 3 Step 2 | ✅ |
| 01 Story: `.prose-a` paragraphs | Task 3 Step 2 + 3 | ✅ |
| 02 Now: `.now-list` / `.now-item` k/v rows | Task 3 Step 2 + 3 | ✅ |
| 03 Colophon: `.colophon` / `.cl` rows | Task 3 Step 2 + 3 | ✅ |
| Accent picker `.sw-row` in Colophon 主题 row | Task 3 Step 2 + 4 | ⚠️ See Finding A |
| 04 Say hi: `.contact-row` / `.cbtn` buttons | Task 3 Step 2 + 3 | ✅ |
| `.ab-hero .eyebrow` descendant override (margin-bottom:20px, font-size:12.5px) | **Missing from plan** | ❌ |
| `.ab-hero .lede` descendant override (max-width:46ch, line-height:1.7) | **Missing from plan** | ❌ |
| Responsive: `@media(max-width:880px)` — ab-hero collapses to 1-col, portrait order:-1 | Task 3 Step 3 "port responsive rules" | ✅ (implicit) |
| Responsive: `@media(max-width:560px)` — now-item/colophon.cl collapse to 1-col | Task 3 Step 3 | ✅ |
| Contact: Email + GitHub only (NO Mastodon/RSS) | Task 3 Step 2 — user-confirmed scope change | ✅ authorized |
| ACCENTS order: Indigo first (reference has Indigo last) | Plan authorized deviation [D-002] | ✅ authorized |

### DF Gap

**❌ DF Gap [advisory]:** Reference `.ab-hero .eyebrow` (margin-bottom:20px; font-size:12.5px; letter-spacing:.16em) and `.ab-hero .lede` (max-width:46ch; line-height:1.7; font-size:clamp(17px,1.8vw,20px)) are descendant rules that add hero-specific sizing not present in the global tokens. Plan [D-003] correctly forbids redeclaring the base `.eyebrow`/`.lede` classes but doesn't explicitly call out these required descendant overrides. Risk: executor skips them, producing a hero with eyebrow flush against H1 and lede spanning full column width.

---

## AR. Architecture Review

### Accent persistence single-source-of-truth

`persistAccent` is defined in `theme.ts` (pure, testable). The About page `<script>` imports it directly. BaseLayout's theme toggle also imports from `theme.ts`. The FOUC bootstrap is `is:inline` (cannot import modules) and hand-mirrors the logic, with a comment linking them (BaseLayout.astro:1-8). This is the intended architecture; no duplication introduced.

**Verdict: ✅ SSOT preserved.**

### FOUC bootstrap consistency

The FOUC bootstrap (BaseLayout.astro:46-60) reads `stored.accent` directly with `stored.accent || DEFAULT_ACCENT` where `DEFAULT_ACCENT = '#3457B6'`. After Phase 6, `persistAccent` writes `{accent: <new hex>}` via `mergePrefs → JSON.stringify`. The bootstrap reads it as `stored.accent`. The key and shape are identical — no FOUC gap introduced.

**Verdict: ✅ Bootstrap consistent with picker write path.**

### BaseLayout footer blast radius

Task 4 is purely additive/corrective on static `<a>` href values in `src/layouts/BaseLayout.astro:94-105`. No JS references the deleted RSS/Mastodon links. No CSS is changed. All existing pages using BaseLayout will see correct footer links on next build. The nav array at lines 17-26 is untouched.

Note: The nav items array (BaseLayout.astro:17-26) still maps `/archives` → "归档" as the 4th nav item. The plan does NOT change this nav entry — "归档" stays as the nav link pointing to `/archives`; only the footer's 关于 link changes to `/about`. This is correct per scope (About nav-bar entry is Phase 7).

**Verdict: ✅ Blast radius = href text on 2 links + deletion of 2 links on all pages. Safe.**

### Dev-guide scope delta

Dev-guide Phase 6 (line 235) lists "contact buttons: Email/Mastodon/GitHub/RSS" in its original scope. Plan has user-confirmed (2026-05-31) change: Email + GitHub only, no Mastodon, no RSS. This is an authorized scope refinement — not a missing item.

**Verdict: ✅ Delta is user-authorized, captured in plan scope section.**

---

## S3. Runtime Semantics

Plan classification: not security/resource-sensitive. No `**Threat model:** included`. S3 skipped per activation criteria.

---

## Plan Verification Summary

### Strategy execution
- S1 concrete error candidates: 5 generated, 2 stand (reported both C>=80); 0 filtered C<80
- S2 failure reverse reasoning: 0 compile failures found; 0 runtime regressions found
- T1 test coverage: 1 logic task, 1 tested, 1 type-matched
- U1 token consistency: 6 values checked, 0 missing
- DF design faithfulness: 14/16 reference elements mapped, 2 descendant-override rules missing from plan spec
- CF crystal fidelity: skipped (no crystal file)
- BD bug diagnosis fidelity: skipped (field = not applicable)
- AR architecture: 0 issues — SSOT clean, FOUC consistent, footer blast radius safe
- S3 runtime semantics: skipped

### Must-revise items
1. **[Task 3 Step 3 — S1/DF]** Plan enumerates `.ab-hero` in scoped styles but does not explicitly include `.ab-hero .eyebrow` and `.ab-hero .lede` descendant overrides.
   - **Add to Task 3 Step 3:** `.ab-hero .eyebrow { margin-bottom:20px; font-size:12.5px; letter-spacing:.16em; }` and `.ab-hero .lede { max-width:46ch; line-height:1.7; font-size:clamp(17px,1.8vw,20px); }` — these are scoped descendant additions, not base-class redeclarations, so [D-003] is not violated.
   - Evidence: tokens.css:154,156-159 (global classes lack these props); About.html:210 (reference adds them as `.ab-hero` descendants).

2. **[Task 3 Steps 2+4 — S1]** Swatch SSR markup spec is absent — plan says "rendered from ACCENTS" without specifying that each `.sw` button must carry `data-value={a.value}` and `style={`background:${a.value}`}`. The click handler references `value` but never specifies where it is read from.
   - **Add to Task 3 Step 2:** Swatch button shape: `<button class="sw" data-value={a.value} title={a.name} style={`background:${a.value}`}></button>`.
   - **Add to Task 3 Step 4:** Click handler reads value via `(e.currentTarget as HTMLButtonElement).dataset.value`.
   - Evidence: About.html:230 shows required `data-v` + inline `style` attributes; absence causes invisible swatches and broken click handler.

### Advisories (do not block)
1. **[Dark-mode accent dual-tone]** When a user selects an accent in dark mode, the light-mode hex is applied (e.g., clicking Indigo sets `--accent:#3457B6` rather than the dark twin `#7088FF`). This is pre-existing behavior (BaseLayout toggle has the same characteristic) and matches the reference design (About.html:227 applies a single hex with no dark twin). No plan change required. Optionally defer to a future issue (add dark-variant mapping to `ACCENTS`) — already implied by tokens.css:76 comment ("dark twin").
2. **[Dev-guide contact scope delta]** Dev-guide Phase 6 line 235 originally listed "Email/Mastodon/GitHub/RSS" as contact buttons. Plan correctly narrows this per user confirmation. No action needed; note for the design reviewer that this is an authorized deviation.

### Verified clean
- persistAccent preserves `theme`: `mergePrefs` spreads current prefs then patches with `{accent}` only — theme key survives. (theme.ts:34-36 + plan Task 1 Step 4)
- FOUC bootstrap is consistent with picker write path: both use `localStorage['norvyn-v2']` with key `accent`, same `||` fallback logic. (BaseLayout.astro:46-60 + Task 3 Step 4)
- Footer edit blast radius: href-only edits to 2 links + removal of 2 static `<a>` tags; no JS, no CSS change. (BaseLayout.astro:94-105)
- vitest is wired in packages/web: `package.json` has `"test":"vitest run"` + `"vitest":"^2.1.9"` devDep. Task 2 verify step is executable.
- Global `.lede` and `.eyebrow` exist at tokens.css:154,156 — [D-003]'s reuse instruction is valid.
- Accent SSOT in theme.ts: additive exports only; existing BaseLayout imports (THEME_LS_KEY, readPrefs, mergePrefs, nextTheme, resolveAccent) are untouched.
- `.sec` correctly treated as local (not in tokens.css) — matches podcast.astro:139 precedent.

## Decisions
None.

---

**Verdict: MUST-REVISE**

Two must-revise items — both are Task 3 plan-text gaps (not architecture failures): missing `.ab-hero` descendant CSS overrides, and missing swatch markup spec. Both are 1-line additions to the plan. No redesign required.
