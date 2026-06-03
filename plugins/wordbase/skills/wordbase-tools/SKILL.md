---
name: wordbase-tools
description: Reference catalog of the WordBase MCP tools (blog, podcast, apps, pages). Use when the user asks what WordBase tools exist, what the MCP server can do, or which tool to use for a task.
---

# WordBase MCP tool catalog

The `wordbase` MCP server exposes **38 tools** across four groups. Each tool is scope-gated by the API key's permissions (`domain:read` / `domain:write`, or `*` for full access). A call made with an out-of-scope key returns a permission-denied error result.

## Blog (18) — scopes: `posts:*`, `media:*`, `comments:*`, `analytics:read`, `build:*`, `redirects:write`
`blog_list_posts` · `blog_get_post` · `blog_create_post` · `blog_update_post_meta` · `blog_list_media` · `blog_upload_media` · `blog_delete_media` · `blog_list_comments` · `blog_moderate_comment` · `blog_reply_comment` · `blog_delete_comment` · `blog_analytics_overview` · `blog_analytics_top_posts` · `blog_analytics_trends` · `blog_content_stats` · `blog_trigger_build` · `blog_build_status` · `blog_manage_redirects`

## Podcast (7) — scopes: `podcasts:read` / `podcasts:write`
`podcast_list_shows` · `podcast_create_show` · `podcast_publish_show` · `podcast_list_episodes` · `podcast_create_episode` · `podcast_upload_audio` · `podcast_publish_episode`

## Apps (7) — scopes: `apps:read` / `apps:write`
`app_list` · `app_create` · `app_publish` · `app_update` · `app_discover` · `app_sync` · `app_sync_all`

## Pages (6) — scopes: `pages:read` / `pages:write`
`page_list` · `page_get` · `page_create` · `page_update` · `page_delete` · `page_publish`

## Notes
- Content changes (publish, create, update) do not appear on the live site until a rebuild runs. Use `blog_trigger_build` / the `wb-rebuild` skill.
- App `description`, `screenshots`, and `icon` are sync-owned (from App Store Connect) and not editable via `app_update`.
- For common workflows, prefer the dedicated skills: `wb-status`, `wb-rebuild`, `wb-publish`, `wb-apps-sync`.
