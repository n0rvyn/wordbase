---
name: norvyn-design
description: Use this skill to generate well-branded interfaces and assets for norvyn.com — the personal site of independent iOS developer norvyn (Apps · Writing · Podcast), either for production or throwaway prototypes/mocks. Contains the full design language: tokens (light/dark), typography, the spine grid, the hairline row system, components, and a six-page reference implementation.
user-invocable: true
---

# norvyn.com design skill

Read `README.md` first — it covers product context, content fundamentals (zh-CN voice, restraint, no emoji), visual foundations (the spine grid, hairlines-not-boxes, one-accent rule, color-from-app-art), and iconography (Lucide-idiom line SVGs).

Then explore:
- `colors_and_type.css` — the token contract. Copy these CSS custom properties; theme via `[data-theme="light"|"dark"]`; re-point `--accent` to reskin. App surfaces additionally set `--app` / `--app-2` from the app's own brand color — the ONLY place a second hue appears.
- `norvyn.com - *.html` (project root) — the **reference implementation**: Home, App Detail (a data-driven template), Writing, Article, Podcast, About. These are the source of truth for every component in context. Lift markup/CSS directly from them.
- `preview/*.html` — small specimen cards (also shown in the Design System tab).

## Working rules
- **Hairlines, not boxes.** Separate rows with `1px solid var(--line)`. Reserve cards for true media (phone frames, code blocks, feature media, buttons).
- **The spine.** Lay sections on the 2-column grid: a sticky left index (big number + mono label + one-line note) beside a `--maxw`-capped content column. This is what makes unlike content feel like one site.
- **One accent.** Default Indigo `#3457B6`. Color otherwise comes only from real app icons/screenshots.
- **Type roles.** Geist (display/UI), Noto Sans SC (reading; serif option for long-form), Geist Mono (eyebrows/meta/dates/code, UPPERCASE + tracked).
- **Motion.** Easing `cubic-bezier(.32,.72,0,1)`; hover `translateY(-1px)` / row `padding-left` nudge; press `scale(.95)`; respect `prefers-reduced-motion`.
- **Voice.** First-person zh-CN, quiet and honest, values restraint. No emoji. Mono English labels over Chinese human copy.

## Output
- For mocks / prototypes / decks: build self-contained static HTML (inline the tokens, load fonts from Google Fonts CDN — Geist, Geist Mono, Noto Sans SC, Newsreader). Copy any real assets out.
- For production: read the rules here and lift the tokens + component CSS into the real codebase (the site is intended to be served by *Wordbase*).
- If the user invokes this skill with no brief, ask what surface they want (a new app's detail page, a new section, a landing page), ask a few questions, then design as an expert in this system.

## Fonts
Loaded from Google Fonts CDN. For offline/self-hosted builds, drop `.woff2` files into a `fonts/` folder and add `@font-face` rules. (Geist & Geist Mono are the brand faces; Schibsted Grotesk is a display alternate; Newsreader/Noto Serif SC is the reading-serif option.)
