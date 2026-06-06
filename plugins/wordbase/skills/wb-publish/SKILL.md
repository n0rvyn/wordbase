---
name: wb-publish
model: haiku
description: Publish a WordBase draft blog post. Use when the user wants to publish, go live with, or push out a specific draft. Lists drafts, confirms which one, publishes it, and rebuilds.
---

# WordBase publish

Publish a draft post via the `wordbase` MCP server. Publishing is user-visible, so confirm the target before changing anything.

1. Call `blog_list_posts` with `status: "draft"` to list current drafts.
2. If the user named a post, match it; otherwise show the drafts and ask which one to publish. Do not guess when more than one could match.
3. Publish the chosen post by calling `blog_update_post_meta` with `status: "published"` (the API stamps `publishedAt` and triggers a rebuild on this transition).
4. Confirm the post is published and report the rebuild status (call `blog_build_status` once to show it kicked off). If you need to force a fresh build, hand off to `wb-rebuild`.

Never publish without an explicit target. If the post is already published, say so and do nothing.
