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

**API getter contracts to cross-check** (from `packages/api/src/routes/`): `GET /api/apps` + `/api/apps/:idOrSlug`; `GET /api/podcasts` + `/api/podcasts/:idOrSlug` + `/api/podcasts/:slug/episodes`. List endpoints return `{data,total,page,limit}`; single-item 404 returns `{error:{code,message}}`. Mounts in `src/index.ts` via `app.route(...)`. The web `api.ts` `fetchApi` (single arg, throws on !ok) is at L63; `getPost` null-catch pattern L91; `estimateReadTime` (existing, don't rebuild) L195.
