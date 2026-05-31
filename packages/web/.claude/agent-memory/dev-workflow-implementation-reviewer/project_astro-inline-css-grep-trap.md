---
name: astro-inline-css-grep-trap
description: WordBase web — Astro inlines small CSS as <style> in HTML, NOT always in /_astro/*.css; grepping only linked stylesheets gives false "rule missing" alarms
metadata:
  type: project
---

When auditing built CSS in `packages/web/dist`, Astro emits component/imported CSS in TWO places: linked `/_astro/<name>.<hash>.css` chunks AND inlined `<style>...</style>` blocks directly in the page HTML (small sheets get inlined). A standalone `src/styles/*.css` import (e.g. `prose.css`) frequently lands as an inline `<style>` in the page, NOT a linked chunk.

**Trap (Phase 7 review):** grepping only the `<link rel=stylesheet href="/_astro/...">` files for `.prose blockquote` returned empty → looked like prose.css failed to bundle. False alarm. The rules were inlined as `<style>.prose blockquote{...}</style>` in every article HTML.

**How to apply:** to confirm a CSS rule reached the build, grep the dist `.html` files directly (`grep -rn 'unique-signature' dist/`), not just the linked `/_astro/*.css`. Pick a minified-survivable signature (px value, unique selector like `scroll-margin-top:96px`) — Astro minifies selectors (`.prose blockquote{` no space). Also note Astro CSS minification compacts `.prose blockquote` → no whitespace, so match `border-left:2px solid` not `border-left: 2px`.

**Related:** Tailwind `@tailwindcss/typography` `.prose :where()` rules (specificity 0,1,0) coexist with custom `.prose <el>` (0,1,1) — custom wins on specificity, order-independent. Don't flag the Tailwind coexistence as a regression. See [[featured-archive-split-gap]] for the other dist-vs-source verification rule.
