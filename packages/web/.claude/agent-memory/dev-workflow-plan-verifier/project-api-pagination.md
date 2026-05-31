---
name: project-api-pagination
description: packages/api app.service.ts default pagination limit is 20; SSG getStaticPaths must explicitly pass limit:10000
metadata:
  type: project
---

`app.service.ts:34`: `const { status, page = 1, limit = 20 } = options;` — default limit is 20, not unlimited.

**Why:** A Phase 4 plan called `getApps({status:'published'})` with no limit, which would silently drop apps beyond 20 from `getStaticPaths`. The posts pattern (`posts/[slug].astro:11`) explicitly uses `limit: 10000`.

**How to apply:** Any SSG `getStaticPaths` using `getApps()`, `getPosts()`, or similar paginated API calls must pass `limit: 10000` to avoid silent pagination truncation. Check each call site in new pages.
