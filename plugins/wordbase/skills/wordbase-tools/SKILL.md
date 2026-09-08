---
name: wordbase-tools
model: haiku
description: Reference catalog of the WordBase MCP tools (posts, media, comments, analytics, podcast, apps, pages). Use when the user asks what WordBase tools exist, what the MCP server can do, or which tool to use for a task.
---

# WordBase MCP tool catalog

The `wordbase` MCP server exposes **68 tools** across fourteen groups. Each tool is scope-gated by the API key's permissions (`domain:read` / `domain:write`, or `*` for full access). An out-of-scope tool is **not registered** for that key's session — it never appears in `tools/list`, so a narrow key sees a shorter tool list rather than getting a permission-denied error on call.

## Posts (9) — scopes: `posts:read` / `posts:write`
`post_list` · `post_get` (returns tags and categories) · `post_search` · `post_create` · `post_update` · `post_publish` · `post_archive` · `post_delete` · `post_update_meta`

## Tags (5) — scopes: `tags:read` / `tags:write`
`tag_list` · `tag_get` · `tag_create` · `tag_update` · `tag_delete`

## Categories (5) — scopes: `categories:read` / `categories:write`
`category_list` · `category_get` · `category_create` · `category_update` · `category_delete`

Tag and category tools return usage counts; rename/delete trigger a site rebuild only when the term is attached to a published post. `tag_create` is idempotent (create-or-attach); `category_create` is NOT — repeated calls with the same slug return an error result.

## Media (5) — scopes: `media:read` / `media:write`
`media_list` · `media_get` · `media_upload` · `media_upload_from_url` (server-side fetch, no base64 payload) · `media_delete`

## Comments (4) — scopes: `comments:read` / `comments:write`
`comment_list` · `comment_moderate` · `comment_reply` · `comment_delete`

## Analytics (1) — scope: `observability:read`
`analytics_query` — one consolidated tool; `sections` picks any of `overview` / `top_posts` / `trends` / `content_stats` (default: all).

## Build (2) — scopes: `build:trigger` / `build:read`
`build_trigger` · `build_status`

## Redirects (1) — scope: `redirects:write`
`redirect_manage`

## Podcast (16) — scopes: `podcasts:read` / `podcasts:write` (plus `observability:read` for `podcast_analytics`)
`podcast_list_shows` · `podcast_get_show` · `podcast_create_show` · `podcast_update_show` · `podcast_publish_show` · `podcast_delete_show` · `podcast_list_episodes` · `podcast_get_episode` · `podcast_create_episode` · `podcast_update_episode` · `podcast_upload_audio_from_url` · `podcast_publish_episode` · `podcast_delete_episode` · `podcast_import_feed` · `podcast_analytics` · `podcast_get_feedback`

## Apps (8) — scopes: `apps:read` / `apps:write`
`app_list` · `app_get` · `app_create` · `app_publish` · `app_update` · `app_delete` · `app_discover` · `app_sync`

## Pages (6) — scopes: `pages:read` / `pages:write`
`page_list` · `page_get` · `page_create` · `page_update` · `page_delete` · `page_publish`

A companion page has ONE authored source (Chinese) served at `https://norvyn.com/<slug>`. The `/en/<slug>` twin is the site's translation-memory rendition of that same source — where no rendition exists it renders the Chinese body under an English shell, and only blocks a human reviewed via `i18n_put_cache` are real English. It is not an English localization the calling project authored. (`/en/apps/*` is the opposite case, and the reason this gets confused: that English comes from the App Store listing itself.) **Submit the bare `/<slug>` URL to App Store Connect — never an `/en/` URL, in any locale.**

## Settings (2) — scopes: `settings:read` / `settings:write`
`settings_get_site` · `settings_update_site` (writes only the site-identity keys: title/description/author/email/github; triggers a rebuild since site identity feeds every page's meta)

## Observability (1) — scope: `observability:read`
`observability_query` — `section` covers the `/api/observability/*` GETs (visits, trends, top-pages, referrers, shares, regions, devices, content, requests, system, seo-health, podcast-summary/trends/top-episodes/episodes/clients). `top_posts` is deliberately NOT included here — use `analytics_query`'s `top_posts` section for that data (same underlying query; kept in one place).

## i18n (3) — scopes: `i18n:read` / `i18n:write`
`i18n_render` · `i18n_pending` · `i18n_put_cache`

## Notes
- Content changes (publish, create, update) do not appear on the live site until a rebuild runs. Use `build_trigger` / the `wb-rebuild` skill.
- App `description`, `screenshots`, and `icon` are sync-owned (from App Store Connect) and not editable via `app_update`.
- Merging tags (e.g. replacing one tag across all posts and deleting the source) is a session-orchestrated workflow: `tag_list` → `post_list` (filter by source tag) → `post_update` (reassign `tagIds`) → `tag_delete`. See the blog MCP parity dev-guide Phase 3 for the full SOP.
- For common workflows, prefer the dedicated skills: `wb-status`, `wb-rebuild`, `wb-publish`, `wb-apps-sync`.
