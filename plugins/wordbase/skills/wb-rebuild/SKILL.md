---
name: wb-rebuild
model: haiku
description: Trigger a WordBase static-site rebuild and report when it finishes. Use when the user wants to republish the site, push content live, or says "rebuild the blog".
---

# WordBase rebuild

Trigger a rebuild of the WordBase static site via the `wordbase` MCP server and confirm the outcome.

1. Call `blog_trigger_build` to start the rebuild.
2. Poll `blog_build_status` until the build leaves the running/pending state (succeeded or failed). Space out polls by a few seconds; do not hammer it.
3. Report the final result:
   - **Succeeded:** state + completion time.
   - **Failed:** quote the error and stop — do not retry automatically; ask the user how to proceed.

A rebuild is required for content changes to appear on the live site, so this is the step after publishing.
