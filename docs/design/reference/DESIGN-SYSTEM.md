# norvyn.com — Design System

A near-monochrome **editorial** design system for **norvyn.com**, the personal home of an independent iOS developer. One site holds three kinds of content — **Apps**, **Writing**, and a **Podcast** — and the system's whole job is to let those three speak in different voices while sharing one hand.

> The core idea: **unify the grammar, not the tone.** Three children with different personalities who are unmistakably one family.

This system was authored as a set of self-contained HTML pages (the reference implementation, below) and distilled here into tokens, principles, and previewable cards.

---

## Sources

- **Reference implementation** (this project root) — six finished, verified pages:
  - `norvyn.com - Home v2.html` — the hub (hero · apps · writing · podcast)
  - `norvyn.com - App Detail.html` — per-app landing **template** (data-driven; filled with "Tidemark")
  - `norvyn.com - Writing.html` — blog list with topics filter + archive
  - `norvyn.com - Article.html` — long-form reading view (TOC, scroll-spy, progress bar)
  - `norvyn.com - Podcast.html` — episode archive + faux player
  - `norvyn.com - About.html` — bio · now · colophon · contact
- **Product context**: [github.com/n0rvyn/wordbase](https://github.com/n0rvyn/wordbase) — *Wordbase*, an AI-native, MCP-enabled blog/content system intended to serve this site. The HTML here is the **design spec** that a Wordbase frontend would be built against.
- **Tokens**: `colors_and_type.css` — copy/paste-able CSS custom properties (the contract).

> ⚠️ The pages are static mockups with realistic **placeholder** zh-CN content and **CSS-drawn placeholders** for app icons / screenshots / podcast covers. Real art is the single biggest upgrade — see *Iconography*.

---

## Content fundamentals

**Language.** Primary copy is **Simplified Chinese (zh-CN)**, freely mixed with English product names, code, and mono labels (`EP.24`, `App Store ↗`, `12 MIN`). Section labels are often English mono (`WRITING`, `LATEST`, `COLOPHON`); the human copy beneath is Chinese.

**Voice.** First person, quiet, and honest — a maker talking plainly about craft. Values surface explicitly: 克制 (restraint), 小而确定 (small and certain), 慢慢来 (taking it slow). It is warm but not cute; confident but not salesy.

- Headline example: 「做小而克制的 App，也*写字*，也*录播客*。」
- Dek example: 「把每天读到的、想到的，慢慢写下来。」
- Principle stated in-product: 「『克制』不是少做，而是把每一次『多做』的冲动，都先放一晚上。」

**Casing & punctuation.** Chinese uses full-width punctuation (，。「」). English mono labels are UPPERCASE with wide tracking. Dates render as mono `2026 · 05 · 21` (middle-dot separated). A `◆` marks the end of an essay.

**No emoji.** None, anywhere. Iconography is line-based SVG; "decoration" is a single accent dot in the wordmark and the accent color itself. Numbers/stats are used sparingly and only when real (no data slop).

---

## Visual foundations

**Overall feeling.** Swiss-adjacent editorial: lots of air, a strict left **index spine**, hairline rules, and a single confident accent. It should feel like a well-set magazine that happens to be a website — *not* an app dashboard, not iOS/macOS chrome.

**The spine grid.** Every section is a 2-column grid: a sticky left **spine** (`--spine` wide) carrying a large light-weight **index number** (`00`–`04`), a **mono label**, and a one-line **note**; and a content column (`--maxw` capped). This single device is what ties unlike content together. On ≤880px the spine collapses to a horizontal row and the note hides.

**Hairlines, not boxes.** The workhorse separator is `1px solid var(--line)`. Lists are rows divided by hairlines, *not* stacks of shadowed cards. Cards exist only for true media (phone frames, code blocks, feature media, contact buttons). This keeps density high without clutter and keeps the eye on content.

**Color.** The chrome is near-monochrome: warm off-white `--paper` → true-ink `--ink`, with a 4-step neutral fill ramp (`surface` → `surface-3`) and 4-step text ramp (`ink` → `ink-4`). Exactly **one accent** is live at a time (default **Indigo `#3457B6`**). The deliberate rule: **the only other color comes from real app art** — app surfaces set `--app`/`--app-2` from the app's own brand color to tint its icon, phone screen, and screenshots.

**Type.** Four roles: **Geist** for display/UI (tight tracking, 500–600 weight), **Noto Sans SC** for Chinese reading (swappable to a **Newsreader/Noto Serif** serif for long-form), **Geist Mono** for all eyebrows, meta, dates and code. Display sizes are fluid (`clamp`) and dramatic (up to 80px); body never below ~14px; reading body 17–18px at 1.9–1.95 line-height with `text-wrap: balance` on headings.

**Backgrounds.** Flat `--paper`. No gradients on chrome. The only gradients are *inside* media placeholders (a soft radial tinted by `--accent`/`--app`) standing in for real imagery. No textures, no patterns.

**Borders & radii.** Hairline `--line` / stronger `--line-2`. Radii are restrained: pills (`999px`) for actions & chips; `13px` squircles for app icons; `14–24px` for media/panels; `6px` for inline code; `38px` device frames.

**Elevation.** Almost none. When used, shadow is a tight 1px contact plus a long, very soft cast (`--shadow`) — felt, not seen. Dark mode deepens it.

**Motion.** One signature easing `cubic-bezier(.32,.72,0,1)`. Hover = `translateY(-1px)` (buttons) or a `padding-left` nudge (hairline rows reveal); press = `scale(.95)`. Theme change cross-fades over 400ms. The article adds a thin accent **progress bar** and TOC **scroll-spy**. Everything respects `prefers-reduced-motion` (all transitions zeroed).

**Hover/press states.** Rows shift right and their title takes the accent; an inline `↗`/`→` arrow translates a few px; nav links get a `--surface-2` pill; ghost buttons darken their border; swatches scale 1.1×.

**Layout rules.** Sticky translucent nav with a blur and a hairline that appears on scroll. `.wrap` centers content at `--maxw` with `--gut` gutters. Footer repeats the spine grid.

---

## Iconography

- **Style:** line icons, `viewBox="0 0 24 24"`, `stroke="currentColor"`, `stroke-width` ~1.7–2.3, round caps/joins. They inherit text color and go accent on hover. Filled shapes are reserved for the play triangle and the wordmark dot.
- **Source:** the reference pages use a small set of **hand-inlined SVGs** in the lucide / feather idiom (arrow-up-right, arrow-right, moon, sun, bell, waves, chart, cloud, lock, share, link, check, play/pause, chevrons). They are **not** from an installed icon font.
- **Recommendation:** adopt **[Lucide](https://lucide.dev)** as the canonical set (same stroke idiom) — load from CDN or bundle. Documented here as the intended substitution; the current inline icons already match its style.
- **No emoji. No unicode-glyph icons** (except the `◆` essay end-mark and the `·`/`↗`/`→` typographic marks used as connectors).
- **Wordmark:** the text `norvyn` in `--font-display` 600 followed by a small accent **dot** (`8px` circle). That dot is the closest thing to a logo; it always uses the live `--accent`.

---

## Index — what's in this system

| File | What it is |
|---|---|
| `README.md` | This document — context, content + visual foundations, iconography |
| `colors_and_type.css` | The token contract: families, scale, color (light/dark), shape, spacing, motion, semantic element styles |
| `preview/*.html` | Small cards that populate the **Design System** tab (Type · Colors · Spacing · Components · Brand) |
| `norvyn.com - *.html` (root) | The **reference implementation** / UI kit — six finished pages that demonstrate every component in context |
| `SKILL.md` | Makes this folder usable as a downloadable Claude **Skill** |

### Component vocabulary (see the reference pages for live code)
Nav (sticky, blur, scroll-hairline) · spine block · hairline list row (`.item` → app / post / episode variants) · app-icon squircle · phone frame + timer ring · feature media block · buttons (primary / ghost) · filter chips · subscribe buttons · mini audio player (play/pause + progress) · reading prose (H2/H3, list, blockquote, code, pull-quote, end-mark) · sticky TOC + scroll-spy · author card · prev/next · footer · the in-page **Tweaks** panel (theme / accent / font, persisted to `localStorage` key `norvyn-v2`, synced across all pages).

---

## Caveats

- **Placeholders, not assets.** App icons, screenshots, podcast cover, and the portrait are CSS stand-ins. Replace with real PNG/SVG.
- **Placeholder copy.** Post titles, episode list, and bio facts are realistic but invented.
- **Fonts via Google Fonts CDN** (Geist, Geist Mono, Noto Sans SC, Newsreader, Schibsted Grotesk). If you need offline/self-hosted builds, drop the `.woff2` files into `fonts/` and update `@font-face`.
- **Static mockup.** No real routing, search, audio, or CMS — this is the visual spec for the Wordbase build.
