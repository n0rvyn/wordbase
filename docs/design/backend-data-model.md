# WordBase backend data model — Podcast + Apps

Status: **locked 2026-05-30** — §6 decisions confirmed: multi-show `podcasts` table;
dedicated `apps` table + JSON blocks; self-host audio via `/uploads` (v1); episode comments
deferred. Designed to match existing conventions in
`packages/api/src/db/schema.ts`:
- `text` nanoid primary keys; unique non-null `slug`.
- Timestamps are **Unix seconds** (`Math.floor(Date.now()/1000)`), not ms.
- `status` text column, default `'draft'` (`draft` / `published` / `archived`).
- Flexible `meta` column = JSON string (SEO / og fields).
- Schema is declared in **two** places that must stay in sync: `schema.ts` (Drizzle) and
  `db/index.ts` (`CREATE TABLE IF NOT EXISTS`), plus `Type` exports.
- CJK-aware slugify already exists in `post.service.ts`.

New tables: **`podcasts`**, **`podcast_episodes`**, **`apps`**. No change to existing tables.
Theme selection per section is stored in the existing `settings` table — no new table (§5).

---

## 1. Podcast — shows (`podcasts`)

One row per show. Supports multiple shows (Adam already runs a morning + an evening
template). Fields cover what a valid Apple Podcasts RSS feed requires.

| column | type | notes |
|---|---|---|
| id | text PK | nanoid |
| slug | text unique notnull | e.g. `daily` → `/podcast/daily` |
| title | text notnull | show title |
| description | text | markdown; feed `<description>` / `itunes:summary` |
| cover_image | text | `itunes:image` (Apple wants ≥1400², ≤3000²) |
| author | text | `itunes:author` |
| owner_name | text | `itunes:owner > itunes:name` |
| owner_email | text | `itunes:owner > itunes:email` — **required for a valid feed** |
| language | text notnull default `zh-CN` | feed `<language>` |
| category | text | Apple category, e.g. `Technology` |
| explicit | integer notnull default 0 | 0/1 → `itunes:explicit` |
| link | text | show website URL |
| copyright | text | `<copyright>` |
| status | text notnull default `draft` | draft/published |
| sort_order | integer default 0 | |
| created_at / updated_at | integer notnull | seconds |
| meta | text | JSON (extra feed/SEO fields) |

```ts
export const podcasts = sqliteTable('podcasts', {
  id: text('id').primaryKey(),
  slug: text('slug').unique().notNull(),
  title: text('title').notNull(),
  description: text('description'),
  coverImage: text('cover_image'),
  author: text('author'),
  ownerName: text('owner_name'),
  ownerEmail: text('owner_email'),
  language: text('language').notNull().default('zh-CN'),
  category: text('category'),
  explicit: integer('explicit').notNull().default(0),
  link: text('link'),
  copyright: text('copyright'),
  status: text('status').notNull().default('draft'),
  sortOrder: integer('sort_order').default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  meta: text('meta'),
});
```

---

## 2. Podcast — episodes (`podcast_episodes`)

One row per episode. Audio is stored as a URL (served via the existing `/uploads/*` route or
a CDN — see §6.3). Includes `external_source` / `external_id` so Adam can publish
**idempotently** (re-delivery of the same execution updates, never duplicates).

| column | type | notes |
|---|---|---|
| id | text PK | nanoid |
| podcast_id | text notnull | FK → `podcasts(id)` ON DELETE CASCADE |
| slug | text unique notnull | `/podcast/<show>/<slug>` |
| guid | text unique notnull | stable RSS `<guid>`; defaults to `id` |
| title | text notnull | |
| summary | text | short, `itunes:summary` / list excerpt |
| show_notes | text | markdown body (`<description>`) — from Adam's script |
| transcript | text | optional full transcript |
| audio_url | text notnull | `/uploads/...` or CDN |
| audio_type | text notnull default `audio/mpeg` | enclosure `type` |
| audio_size | integer notnull default 0 | bytes — enclosure `length` |
| duration | integer | seconds — `itunes:duration` |
| cover_image | text | episode art; falls back to show cover |
| episode_number | integer | `itunes:episode` |
| season_number | integer | `itunes:season` |
| episode_type | text notnull default `full` | full / trailer / bonus |
| explicit | integer | nullable → inherit show |
| status | text notnull default `draft` | draft/published/archived |
| published_at | integer | seconds; feed `<pubDate>` |
| external_source | text | e.g. `adam` |
| external_id | text | e.g. Adam `executionId` |
| created_at / updated_at | integer notnull | seconds |
| meta | text | JSON |

```ts
export const podcastEpisodes = sqliteTable('podcast_episodes', {
  id: text('id').primaryKey(),
  podcastId: text('podcast_id').notNull(),
  slug: text('slug').unique().notNull(),
  guid: text('guid').unique().notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  showNotes: text('show_notes'),
  transcript: text('transcript'),
  audioUrl: text('audio_url').notNull(),
  audioType: text('audio_type').notNull().default('audio/mpeg'),
  audioSize: integer('audio_size').notNull().default(0),
  duration: integer('duration'),
  coverImage: text('cover_image'),
  episodeNumber: integer('episode_number'),
  seasonNumber: integer('season_number'),
  episodeType: text('episode_type').notNull().default('full'),
  explicit: integer('explicit'),
  status: text('status').notNull().default('draft'),
  publishedAt: integer('published_at'),
  externalSource: text('external_source'),
  externalId: text('external_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  meta: text('meta'),
}, (t) => ({
  extUnique: uniqueIndex('ux_episode_external').on(t.externalSource, t.externalId),
  podcastIdx: index('ix_episode_podcast').on(t.podcastId),
}));
```

> SQLite treats NULLs as distinct, so the unique index only dedups rows where BOTH
> `external_source` and `external_id` are set (manual episodes stay unconstrained).

---

## 3. Apps — iOS landing pages (`apps`)

One row per app. Repeating marketing blocks (features, screenshots, links) are JSON columns
— matches the existing `meta`-JSON pattern and keeps it to one table. First-class columns
are the queryable / feed-relevant fields.

| column | type | notes |
|---|---|---|
| id | text PK | nanoid |
| slug | text unique notnull | `/apps/<slug>` |
| name | text notnull | app name |
| tagline | text | hero one-liner |
| icon | text | app icon URL |
| description | text | markdown "about" body |
| app_store_url | text | full App Store link |
| app_store_id | text | numeric App Store id (smart banner / deep link) |
| bundle_id | text | optional |
| platform | text notnull default `iOS` | |
| price | text | `Free` / `¥12` |
| rating | real | 0–5 |
| rating_count | integer | |
| accent_color | text | per-app accent hex (feeds the theme) |
| features | text | JSON `[{icon,title,blurb}]` |
| screenshots | text | JSON `[{url,caption,device}]` |
| links | text | JSON `{privacy,support,website}` |
| status | text notnull default `draft` | |
| sort_order | integer default 0 | |
| published_at | integer | |
| created_at / updated_at | integer notnull | seconds |
| meta | text | JSON SEO (og) |

```ts
export const apps = sqliteTable('apps', {
  id: text('id').primaryKey(),
  slug: text('slug').unique().notNull(),
  name: text('name').notNull(),
  tagline: text('tagline'),
  icon: text('icon'),
  description: text('description'),
  appStoreUrl: text('app_store_url'),
  appStoreId: text('app_store_id'),
  bundleId: text('bundle_id'),
  platform: text('platform').notNull().default('iOS'),
  price: text('price'),
  rating: real('rating'),
  ratingCount: integer('rating_count'),
  accentColor: text('accent_color'),
  features: text('features'),       // JSON
  screenshots: text('screenshots'), // JSON
  links: text('links'),             // JSON
  status: text('status').notNull().default('draft'),
  sortOrder: integer('sort_order').default(0),
  publishedAt: integer('published_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  meta: text('meta'),
});
```
(`real` and `uniqueIndex`/`index` need adding to the `drizzle-orm/sqlite-core` import.)

---

## 4. Adam → WordBase publishing flow

Adam already produces per execution: mp3 (`audio/mpeg`), markdown script, cover image, at
`~/.adam/template-executions/{executionId}/artifacts/`. To auto-publish, Adam gets a
**WordBase channel adapter** (in Adam's repo) that, on `template_execution` completion:

1. `POST /api/media` (or `blog_upload_media`) — upload mp3 → get `audio_url` + size.
2. `POST /api/media` — upload cover → get `cover_image`.
3. `POST /api/podcasts/:show/episodes` with `external_source='adam'`,
   `external_id=executionId`, title, show_notes (=script), duration, audio fields.
   - Server upserts on `(external_source, external_id)` → idempotent; re-delivery updates.
4. `POST /api/podcasts/:show/episodes/:id/publish` → sets status+publishedAt, triggers
   Astro rebuild (reuse `build.service.ts`, same as posts).

`duration` + `audio_size`: the adapter reads them from the mp3 (Adam side) and passes them
in; the server does not probe audio.

---

## 5. Themes (display layer) — no new table

Multi-theme is driven by CSS variables + a `data-theme` attribute (frontend). The *selection*
lives in the existing `settings` key-value table:

- `theme.available` → JSON list of theme ids shipped in code.
- `theme.default`, `theme.blog`, `theme.apps`, `theme.podcast` → which theme each section uses.
- `theme.allow_user_toggle` → light/dark + picker on/off.

A `themes` table (user-editable token sets) is deliberately **out of scope** for v1 — the
themes live in code; settings only pick among them.

---

## 6. Decisions (confirmed 2026-05-30)

### 6.1 Podcast: multiple shows vs single show → **multi-show `podcasts` table**
| option | pros | cons |
|---|---|---|
| **`podcasts` table (multi-show)** ✅ rec | matches Adam's morning+evening; future shows free; clean per-show RSS | one extra table |
| single implicit show (episodes only) | one fewer table | second show needs a migration; show-level RSS fields homeless |

### 6.2 App marketing data shape → **dedicated `apps` table + JSON blocks**
| option | pros | cons |
|---|---|---|
| **dedicated `apps` table + JSON blocks** ✅ rec | app-specific fields are first-class; one table; flexible blocks | JSON not queryable (fine — single author) |
| reuse `pages` + `type` column | no new table | app fields pollute pages; messy rendering |
| normalized `app_features` + `app_screenshots` | fully relational | 2 extra tables for content that's never queried relationally |

### 6.3 Audio hosting → **self-host via `/uploads` (v1)**
| option | pros | cons |
|---|---|---|
| **self-host via `/uploads`** ✅ rec for v1 | zero new infra; already wired; `audio_url` abstracts it | VPS bandwidth/storage if traffic grows |
| external object storage / CDN now | scales, offloads bandwidth | new infra + credentials before launch |

`audio_url` is a plain URL either way, so 6.3 can flip later with no schema change.

### 6.4 Episode comments — **default: none in v1**
Reusing the `comments` table (keyed by `post_id`) would need a generalized `target_id`. Skip
for v1; revisit if wanted.

---

## 7. Wiring checklist (for the build phase, not this design)
1. `schema.ts` — add 3 tables + `uniqueIndex`/`index`/`real` imports + `Type` exports.
2. `db/index.ts` — add 3 `CREATE TABLE IF NOT EXISTS` + indexes (keep in sync with #1).
3. Drizzle migration in `src/db/migrations` (`pnpm db:generate`).
4. Services: `podcast.service.ts`, `episode.service.ts` (+ upsert-by-external), `app.service.ts`.
5. Routes: `routes/podcasts.ts`, `routes/apps.ts` + register in `app.ts`; RSS `feed.xml`.
6. MCP tools: `podcast_*`, `app_*` in `mcp/tools.ts` (so Adam + AI can CRUD).
7. Web (separate phase): Astro routes + `getStaticPaths` + components + audio player.
8. Publish actions trigger `build.service.ts` rebuild (same as posts).
9. Adam repo: WordBase channel adapter (§4).
