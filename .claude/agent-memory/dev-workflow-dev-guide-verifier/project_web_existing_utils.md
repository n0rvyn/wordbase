---
name: web-existing-utils-check-before-flagging-new
description: packages/web/src/lib/api.ts already ships read-time + markdown utils; check it before treating helpers as new work in V4/V5
metadata:
  type: project
---

`packages/web/src/lib/api.ts` already contains helpers a frontend dev-guide might wrongly treat as new work:
- `estimateReadTime(content)` (CJK-aware: `Math.ceil((words + cjkChars) / 300)`) — already imported by index.astro
- `stripMarkdown`, `formatDate`, `formatRelativeDate`, `getPosts`/`getPost`/`getCategories`/`getTags`/`getPages`, `getComments`/`createComment`, `fetchApi` (the shared fetch pattern, API_URL on line 1)
- App/Podcast/Episode functions (getApps/getApp/getPodcasts/getEpisodes) do NOT exist — those are genuinely new.

**Why:** A frontend redesign dev-guide listed "read-time computation" as an undecided new util and proposed a formula decision; the util already existed. V4 partial-overlap.

**How to apply:** Before flagging any list/date/read-time/markdown helper as new V4 work or an undefined V5 term, grep api.ts. Existing BaseLayout.astro uses Cormorant Garamond serif (the "old" layout); posts/[slug].astro, ShareButtons.astro, CommentSection.astro all exist (DP premises about comments/share are real). See [[web-reviewer-agents-not-apple]].
