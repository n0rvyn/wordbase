---
name: wordbase-web-frontend-verification
description: Recurring verification gaps for wordbase packages/web (Astro) frontend-redesign plans — BaseLayout importer count, nav-link reachability during layout swaps, vitest absence, token source of truth
metadata:
  type: project
---

When verifying plans that touch `packages/web` (Astro SSG frontend), check these. (Verify against live code each time — reflects repo state as of 2026-05-30.)

**BaseLayout importer count is often understated.** Plans describing a BaseLayout replacement tend to say "6 existing pages" but `grep -rln BaseLayout packages/web/src/` returns ~10 non-admin pages: `index.astro`, `[slug].astro`(top-level page), `archives.astro`, `404.astro`, `page/[page].astro`, `posts/[slug].astro`, `tags/index.astro`, `tags/[slug].astro`, `categories/index.astro`, `categories/[slug].astro`. Admin pages use a separate `AdminLayout.astro` (Tailwind) — out of scope. Always grep the real importer set; the count drives the blast radius of any layout change.

**Prop contract is the real break-test, not the count.** Old `BaseLayout.astro` Props = `{title; description?; ogImage?}`. Only `posts/[slug].astro` and `categories/[slug].astro` pass `description`/`ogImage`; the rest pass `title` only. A new BaseLayout that keeps those three prop names breaks no importer regardless of count → count error is advisory, prop-drop would be must-revise.

**Nav-link reachability during a layout swap is a hidden user-visible regression.** Old nav (`BaseLayout.astro` navItems array) points to real routes `/`, `/categories`, `/tags`, `/archives`. Redesign nav often points to future routes (`/writing`, `/podcast`, `/about`, `/#apps`) that don't exist yet in the swap phase. Result: all existing pages lose nav access to existing content AND gain 404 links. A "new shell + old content is a harmless intermediate" DP usually covers VISUAL mismatch but NOT dead nav — surface as a separate decision. navItems is a single array, so a placeholder-mapping fix is one-spot.

**web package has NO test runner by default.** `packages/web/package.json` has only dev/build/preview scripts, no vitest, no `vitest.config.*`. (Contrast: `packages/api` already has `vitest.config.ts`.) Any web test task must add vitest itself; point it at the api package's vitest config as the ts/path-resolution reference.

**Design token source of truth.** `docs/design/reference/colors_and_type.css` is the only token source (per `DESIGN-SYSTEM.md`): default accent `#3457B6`, dark twin `#7088FF`, themes via `:root[data-theme="light"|"dark"]`, persist theme+accent in `localStorage['norvyn-v2']` read before first paint (FOUC guard). Fonts: Geist/Geist Mono/Noto Sans SC, optional Newsreader serif. The OLD `BaseLayout.astro` carries a legacy inline token set (`--color-vermillion #c23a22`, `--font-display: Cormorant`) — a full BaseLayout swap removes it, so existing pages' inline `<style>` referencing legacy vars will silently lose values during transition (accepted intermediate, flag advisory).

**Phase 2 Home plan-specific patterns (2026-05-30):**
- `/writing` viewall link in always-rendered Writing section → dead 404 until Phase 3. Must decide: retarget to `/`, omit, or accept 404. The discriminator: dead-link risk only when a forward-ref link lives inside an *always-rendered* block (Writing section); hidden-section links (apps/podcast viewall) are harmless.
- Task 4 seeded-state verification: `POST /api/apps` and `POST /api/podcasts` are auth-gated (Bearer token, bcrypt-hashed DB key). Plan must specify how to obtain/use a token or explicitly label seeded verify as manual. The "if no create path exists → fallback" escape hatch won't fire — a path exists, it's just auth-gated.
- `App.publishedAt: number | null` → `Since {year}` rendered from null produces "1970" (new Date(null * 1000) = epoch). Always guard with fallback to `releaseDate` or omit.
- `Episode.episodeNumber: number | null` → "EP." label in null case is a cosmetic gap; Astro renders null as empty string.
- `vitest` is already installed in packages/web (as of Phase 1); no need to add it. `packages/web/vitest.config.ts` exists. `packages/web/package.json` scripts already includes `"test": "vitest run"`.

**`.prose` in tokens.css is container-only — body typography lives in scoped page styles.** `tokens.css:155` `.prose{}` sets only font-family/size/line-height/color on the container. It does NOT style descendants (h2/h3/p/ul/ol/blockquote/pre/code/img). The proven long-form page `posts/[slug].astro` uses `<div class="prose" set:html>` BUT carries ~13 descendant `.prose` rules in its own scoped `<style>` (`.prose > p`, `.prose h2/h3`, `.prose ul/ol`, `.prose blockquote`, `.prose pre`, `.prose img` at ~:458–540). Any plan that replaces Tailwind `prose prose-lg` (from `@tailwindcss/typography`, installed) with "the global `.prose`" WITHOUT porting those descendant rules ships an unstyled article body = silent downgrade = must-revise. Check: does the task reproduce element-level typography, or only reference the bare container class?

**Tailwind integration stays regardless of page-level utility removal.** `@astrojs/tailwind` is a global integration (`astro.config.mjs`) and ALL admin (`src/components/admin/*.tsx`, `src/pages/admin/*`) depend on Tailwind utilities. Removing utility classes from a few public pages is safe; the integration must NOT be removed. The only non-admin Tailwind utility pages (as of Phase 7) are `categories/[slug]`, `tags/[slug]`, `[slug]`.

**App-selection helpers are in `src/lib/home.ts`, not app.ts.** `selectFeaturedApp(apps)` (home.ts:35) + `restApps(apps, featured)` (home.ts:63); home uses both at `index.astro:40–41`. `getApps({status})` at `api.ts:232`. `app.ts` holds rendering helpers (shade, appColors, buildMetaCells, formatYear), NOT selection. Any /apps index plan should reuse home.ts selection, not reimplement.

**Grep-gate commands that run before a delete must exclude the definition file.** A `grep ... expect 0` gate that runs before deleting an alias/token block will match the block's own definition lines and return non-zero (false failure). The gate command itself must `| grep -v <definition-file>` or scope to `src/pages`. Don't accept a gate whose "expect 0" is only true in a parenthetical.

**build format is `format:'file'`.** `astro.config.mjs` build.format='file'. Index pages → `dist/foo.html` (e.g. `dist/categories.html`, `dist/archives.html`); dynamic routes → `dist/foo/<slug>.html` (e.g. `dist/categories/<slug>.html`, `dist/page/2.html`). Verify plan dist-path greps match this, and confirm empirically against the existing `dist/` from the prior phase build rather than reasoning.

**API getter contracts to cross-check** (from `packages/api/src/routes/`): `GET /api/apps` + `/api/apps/:idOrSlug`; `GET /api/podcasts` + `/api/podcasts/:idOrSlug` + `/api/podcasts/:slug/episodes`. List endpoints return `{data,total,page,limit}`; single-item 404 returns `{error:{code,message}}`. Mounts in `src/index.ts` via `app.route(...)`. The web `api.ts` `fetchApi` (single arg, throws on !ok) is at L63; `getPost` null-catch pattern L91; `estimateReadTime` (existing, don't rebuild) L195.
