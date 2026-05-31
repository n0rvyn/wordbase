---
name: review-patterns-wordbase-web
description: packages/web Astro review traps — build.format:'file' emits flat slug.html (not slug/index.html); plans wording it as /index.html is wrong but output is correct; reference HTML carries data fields it never renders
metadata:
  type: project
---

When reviewing `packages/web` dynamic routes (`pages/**/[slug].astro`):

- **build.format is `'file'`** (`packages/web/astro.config.mjs`) → `getStaticPaths` emits FLAT `dist/<route>/<slug>.html`, NOT `<slug>/index.html`. The live, deployed `/posts/:slug` route already uses this form and resolves in production. So a plan asserting `dist/.../index.html` is wrong-worded, but the flat output is correct and consistent. Do NOT flag flat-vs-index as a 404 gap without checking `build.format` + comparing against `dist/posts/`.

**Why:** Phase 4 app-detail review — the flat-file output looked like it might break Home's extensionless `/apps/${slug}` links, but it resolves identically to the live posts route.

**How to apply:** before flagging a build-path/link-resolution gap on a web route, read `astro.config.*` for `build.format` and `ls dist/posts/` to confirm the site-wide convention.

- **Design reference HTML (`docs/design/reference/*.html`) carries demo DATA fields it never renders.** Example: App Detail.html defines `links:[…]` in its data object but the template has no `links.map` consumer. A plan step that says "parse app.links" but the page omitting it is NOT a fidelity gap — confirm whether the REFERENCE TEMPLATE (not just its data) renders the field before calling it missing.

- **Reference demo content (curated HTML paragraphs, named-SVG icon sets) ≠ real DB data shape** (plain-text description blob, emoji feature icons). Plan DPs that adapt rendering to real data (pre-line text split, emoji-as-text) are authorized adaptations when annotated in the plan's Decisions block — not silent degradation.

Related: [[review-patterns-wordbase-api]] (backend untracked, no git baseline — web side same: new route files show as `??` untracked, purely additive).
