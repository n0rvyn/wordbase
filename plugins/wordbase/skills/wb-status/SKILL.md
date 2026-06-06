---
name: wb-status
model: haiku
description: Show the WordBase site's current build status and content statistics. Use when the user asks how the blog is doing, whether the last build succeeded, or for a content overview (post/page/comment counts).
---

# WordBase status

Report the current state of the WordBase site using the `wordbase` MCP server.

1. Call `blog_build_status` to get the most recent static-site build (state, timestamp, any error).
2. Call `blog_content_stats` to get content counts (posts by status, pages, comments awaiting moderation, etc.).
3. Summarize in a short, scannable block:
   - **Build:** state + when + error (if any).
   - **Content:** published / draft posts, pages, pending comments.

Do not trigger a rebuild here — that is `wb-rebuild`. If `blog_build_status` shows a failed build, say so plainly and quote the error.
