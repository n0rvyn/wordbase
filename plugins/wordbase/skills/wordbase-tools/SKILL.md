---
name: wordbase-tools
model: haiku
description: Reference catalog of the WordBase MCP tools (blog, podcast, apps, pages). Use when the user asks what WordBase tools exist, what the MCP server can do, or which tool to use for a task.
---

# WordBase MCP tool catalog

The `wordbase` MCP server exposes **52 tools** across five groups. Each tool is scope-gated by the API key's permissions (`domain:read` / `domain:write`, or `*` for full access). A call made with an out-of-scope key returns a permission-denied error result.

## Blog (23) — scopes: `posts:*`, `media:*`, `comments:*`, `analytics:read`, `build:*`, `redirects:write`
`post_list` · `post_get` (returns tags and categories) · `post_search` · `post_create` · `post_update` · `post_publish` · `post_archive` · `post_delete` · `post_update_meta` · `blog_list_media` · `blog_upload_media` · `blog_delete_media` · `blog_list_comments` · `blog_moderate_comment` · `blog_reply_comment` · `blog_delete_comment` · `blog_analytics_overview` · `blog_analytics_top_posts` · `blog_analytics_trends` · `blog_content_stats` · `blog_trigger_build` · `blog_build_status` · `blog_manage_redirects`

## Podcast (13) — scopes: `podcasts:read` / `podcasts:write` (plus `observability:read` for `podcast_analytics`)
`podcast_list_shows` · `podcast_create_show` · `podcast_update_show` · `podcast_publish_show` · `podcast_list_episodes` · `podcast_create_episode` · `podcast_update_episode` · `podcast_upload_audio` · `podcast_upload_audio_from_url` · `podcast_publish_episode` · `podcast_import_feed` · `podcast_analytics` · `podcast_get_feedback`

## Apps (7) — scopes: `apps:read` / `apps:write`
`app_list` · `app_create` · `app_publish` · `app_update` · `app_discover` · `app_sync` · `app_sync_all`

## Pages (6) — scopes: `pages:read` / `pages:write`
`page_list` · `page_get` · `page_create` · `page_update` · `page_delete` · `page_publish`

## i18n (3) — scopes: `i18n:read` / `i18n:write`
`i18n_render` · `i18n_pending` · `i18n_put_cache`

## Notes
- Content changes (publish, create, update) do not appear on the live site until a rebuild runs. Use `blog_trigger_build` / the `wb-rebuild` skill.
- App `description`, `screenshots`, and `icon` are sync-owned (from App Store Connect) and not editable via `app_update`.
- For common workflows, prefer the dedicated skills: `wb-status`, `wb-rebuild`, `wb-publish`, `wb-apps-sync`.
