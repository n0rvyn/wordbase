# WordBase Project Brief

## Product

WordBase is a self-hosted, AI-native content management system that replaces WordPress for one independently operated site. It manages writing, podcasts, app landing pages, and companion pages through shared business services exposed to the admin interface, REST API, and MCP. Astro turns published content into a static public site served by Caddy.

## Background

WordBase began as a blog migration and replacement for WordPress. It has since grown into a multi-content CMS without abandoning the original priorities: content ownership, long-form reading, static delivery, and complete AI-operable workflows.

## Users

### Site owner and editor

- Write and publish Markdown posts.
- Manage categories, tags, comments, media, redirects, SEO metadata, and site settings.
- Publish podcasts, app pages, and companion pages.
- Review traffic and content analytics.

### AI tools and agents

- Perform complete content-management workflows through MCP.
- Use the same business rules and permissions as REST and the admin interface.
- Create, update, publish, archive, classify, and inspect content without manual transfer between systems.

### Public visitors

- Browse and read long-form writing.
- Discover apps and inspect their features, screenshots, and App Store information.
- browse podcast episodes, play audio, and subscribe through RSS.
- Learn about the author, choose a visual theme and accent, and switch the public interface language.

### Independent app developer

- Maintain editorial app-page information without overwriting App Store-synced fields.
- Publish privacy, terms, help, support, and release-note companion pages associated with an app.

## Product pillars

### AI-native operations

MCP is a first-class product interface. MCP, REST, and the admin interface call the same service layer so that human and AI operations share business semantics, validation, permissions, and side effects.

### Multi-content publishing

Writing, podcasts, app landing pages, and companion pages share one authentication model, database, build pipeline, deployment path, and public site.

### Static-first public experience

Published content is baked into Astro pages and served as static HTML. Runtime behavior is reserved for interactions that need it, including comments, theme preferences, language switching, search, and podcast controls.

### Real content and honest states

The public site uses real source data. Empty collections render a quiet empty state or omit the section; they never inject fictitious posts, apps, podcasts, metrics, or personal claims.

### Controlled publishing

API-key scopes are enforced across REST and MCP. Operations that change published output trigger a rebuild; draft-only operations do not create stale or unnecessary public artifacts.

### One coherent interface system

The public site uses one token system, one global accent at a time, Geist-family typography, hairline separation, a left index spine, restrained first-person language, and persistent theme, accent, and language preferences.

## Core capabilities

- Post creation, editing, publishing, archiving, deletion, taxonomy, comments, media, redirects, SEO, and analytics.
- Writing archive with category filtering and year grouping.
- Long-form article pages with progress, table of contents, sharing, author context, adjacent navigation, and comments.
- Podcast show and episode management, audio, RSS, archive playback, feedback, and transcripts where available.
- App discovery and App Store metadata sync, app indexes, and app detail pages.
- Companion-page lifecycle and public rendering.
- Public-site theme, accent, language, search, 404, About, feeds, sitemap, and structured metadata.
- Admin UI, REST API, MCP over stdio, and MCP over Streamable HTTP.

## Experience principles

1. **Content before decoration.** Hierarchy comes from typography, spacing, hairlines, and restrained color rather than ornamental cards.
2. **Honest over impressive.** Real status and real source data take precedence over reference-copy claims or placeholders.
3. **Preserve useful behavior.** A visual reference that omits an existing capability does not authorize removing it.
4. **Readable for sustained use.** Long-form pages prioritize line length, type hierarchy, navigation context, and accessible contrast.
5. **Immediate, stable preferences.** Theme, accent, and language apply before first paint and persist across pages and reloads.
6. **Responsive by completion, not adaptation.** Public UI changes are complete only after desktop and small-screen validation at 480px or narrower.
7. **One system, not parallel generations.** New design work extends or replaces the active token and component system; it does not add a second visual language.

## Success criteria

### Content operations

- Admin, REST, and MCP operations produce the same business result because they share service functions.
- Protected operations enforce the same API-key scopes across adapters.
- Publishing changes the public static output through the established rebuild path.

### Public experience

- Published writing is discoverable and readable through the writing index and article pages.
- Published apps, podcasts, and companion pages render from real data.
- Empty and partially populated states remain coherent and do not break the page.
- Theme, accent, and public interface language persist without visible first-paint switching.
- Public pages do not overflow horizontally or crop controls at 480px or narrower.
- Text and interactive elements meet WCAG AA contrast targets in light and dark themes.

### Data ownership

- App Store-managed description, screenshots, and icon remain sync-owned.
- WordBase editorial fields remain editable without being reverted by the next App Store sync.
- Raw Markdown remains the content source; rendered HTML is a publication artifact.

## Boundaries

- WordBase reads App Store Connect data but does not write content or URLs back to App Store Connect.
- App description, screenshots, and icon are not editorial update fields.
- The public podcast archive presents one selected show and uses native browser audio controls.
- Font selection is not a user preference; Geist-family typography is fixed.
- Per-app colors apply to app presentation regions and do not replace the site-wide accent.
- Empty states do not use fabricated examples.
- Product source logic belongs in services; routes and MCP tools remain adapters.

## Technical and operational constraints

- pnpm workspace with `api` and `web` packages.
- Hono and TypeScript backend; SQLite and Drizzle persistence; Astro SSG frontend; Caddy serving and proxying.
- TypeScript ESM imports use `.js` specifiers.
- IDs use nanoid and timestamps use Unix seconds.
- Content is stored as raw Markdown and rendered for publication or display.
- The web build requires the API to be available at build time.
- The repository root `.env` is the only environment file.
- Podcast audio keeps `preload="none"` wherever required to preserve download-count integrity.
- Production deployment uses `ssh norvyn 'bash -s' < deploy/setup.sh`.

## Authoritative references

- `CLAUDE.md` — current architecture, execution, deployment, and repository constraints.
- `README.md` — REST API, MCP tools, data model, and operational reference; current code and `CLAUDE.md` win where older README sections have drifted.
- `docs/06-plans/2026-03-21-wordbase-blog-system-design.md` — project origin, original migration goal, and foundational architecture.
- `docs/06-plans/2026-05-30-frontend-redesign-dev-guide.md` — active public-site visual contract and redesign decisions.
- `docs/05-features/` — shipped user journeys and feature boundaries.

## Scope hygiene

This brief defines the durable product. Individual bug fixes, current UI audit findings, temporary release work, and issue-specific implementation tasks belong in their own design documents, development guides, plans, or issue records rather than this file.
