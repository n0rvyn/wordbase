# Claude Design prompt — WordBase multi-theme display layer

> Paste the block below into Claude Design / Stitch. It is written in two phases:
> Phase 1 returns 3 style directions (pick one); Phase 2 expands the chosen one
> into full screens. Run Phase 1 first, choose, then ask it to continue to Phase 2.

---

## PROMPT

I'm designing **WordBase**, a self-hosted content platform for one creator (norvyn.com,
Simplified Chinese / zh-CN content). It currently runs as a literary blog but is being
turned into a **multi-section, multi-theme platform** hosting three kinds of content under
one site:

1. **Blog** — long-form articles (128 existing posts, Chinese). Reading-focused.
2. **App pages** — 5+ iOS app landing/marketing pages (intro, features, screenshots,
   App Store CTA). Conversion-focused, NOT reading.
3. **Podcast** — a daily audio show with episodes (audio player, show notes, cover art),
   plus an RSS feed. Media / immersive.

### Core requirement: a themeable design SYSTEM, not a single skin
- All visuals must be driven by **design tokens** (color, type, spacing, radius, shadow,
  motion) exposed as CSS custom properties, so themes are swappable at runtime via a
  `data-theme` attribute.
- **Every theme ships in both light and dark.** There is a global light/dark toggle plus
  a theme picker.
- Each section has a sensible **default theme** but the user can switch.
- The CURRENT look (warm cream `#f6f3ee`, ink `#1a1a1a`, vermillion `#c23a22`, Cormorant
  Garamond + Noto Serif SC serif) is considered dated — do NOT reproduce it. Treat it at
  most as one optional legacy theme. I want a fresh, modern, confident identity.

### Typography & language
- Content is **Simplified Chinese (zh-CN)** with some English/code. Use type that renders
  CJK beautifully (e.g. pair a modern Latin face with Noto Sans SC / Source Han Sans, or a
  high-quality CJK serif for reading themes). Mind line-height and measure for Chinese.

---

## PHASE 1 — deliver 3 style directions (style tiles only)

Give me **3 distinct, modern theme directions**, each as a style tile showing: color
palette (light + dark), type scale + font pairing, button/link/card treatment, one sample
hero, and a one-line personality statement. Make them genuinely different so I can choose.
Suggested starting points (adjust freely, but keep them modern and not "rigid/old"):

- **Direction A — "Aurora" (modern editorial / soft-tech):** near-white & true-dark
  surfaces, one vivid accent (gradient-capable), refined sans for UI + an elegant display
  face for headlines, soft depth (subtle blur/elevation), smooth motion. Premium, current,
  magazine-meets-product.
- **Direction B — "Mono" (Swiss minimal):** strict grid, black/white/grey with a single
  sharp accent, large type scale, hairline rules, lots of whitespace, zero decoration.
  Designerly, timeless, calm.
- **Direction C — "Vivid" (bold expressive):** saturated color blocks, big variable
  display type, rounded geometry, motion-forward, image-led. Energetic and memorable —
  strong for app marketing and podcast covers.

Output the shared **token spec** (the named tokens all themes implement) alongside the
3 tiles, so the themes are interchangeable.

**Stop after Phase 1 and let me pick a direction before continuing.**

---

## PHASE 2 — expand the chosen direction into full screens

Using the chosen theme (in both light and dark), design these screens. They share a global
**header** (logo + section nav: 文章 / Apps / 播客, theme picker, light/dark toggle, search)
and **footer**.

**A. Blog (reading theme default)**
1. Home — featured article + article list (date / title / excerpt / read-time), pagination.
2. Article detail — title, meta, optional cover, rich prose (h2/h3, quotes, code blocks,
   images, tables), share row, comments section.
3. Archive / category / tag listing pages.

**B. App landing template (product theme default)** — one reusable template that works for
any iOS app:
4. App landing — hero with device/screenshot mockup + tagline + App Store badge CTA,
   feature grid (icon + title + blurb), screenshot gallery/carousel, ratings/social proof,
   FAQ, footer CTA. Show it filled with a realistic sample app.
5. Apps index — a grid of all app cards linking to their landing pages.

**C. Podcast (media theme default)**
6. Podcast home — show header (cover, title, subscribe / RSS / Apple / Spotify buttons) +
   episode list.
7. Episode detail — large cover, audio player (play/scrub/speed), show notes (rich text),
   share, related episodes.
8. A persistent mini audio player (docked bottom bar) that survives navigation.

**Global**
9. Theme picker + light/dark toggle UI.
10. 404 page.

### Constraints
- Fully responsive (mobile-first; reading column ~680px on desktop, wider for app/podcast).
- Accessible: WCAG AA contrast in BOTH light and dark for every theme; visible focus states;
  respects reduced-motion.
- Keep it implementable in Astro + Tailwind with CSS-variable theming (no heavy frameworks).
- Deliverables: the screens above + the finalized token table (every token, light + dark
  values per theme) + component states (hover/active/focus/disabled).
