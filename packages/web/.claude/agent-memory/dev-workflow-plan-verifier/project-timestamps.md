---
name: project-timestamps
description: App releaseDate/currentVersionReleaseDate are Unix seconds (not ms); appstore-lookup.service converts ISO dates via Math.floor(ms/1000)
metadata:
  type: project
---

`appstore-lookup.service.ts:22–24`: ISO date strings from App Store are converted with `Math.floor(Date.parse(iso) / 1000)` → stored as Unix seconds.

**Why:** Verified during Phase 4 plan review. `formatMonoDate(ts)` in `home.ts` multiplies `ts * 1000` to get a JS Date — this is correct because the DB stores seconds. If someone stored milliseconds, formatMonoDate would render year ~52000.

**How to apply:** All App timestamp fields (`releaseDate`, `currentVersionReleaseDate`, `publishedAt`, `createdAt`, `updatedAt`) in the App interface are Unix seconds. Always multiply by 1000 when constructing `new Date(ts * 1000)`. Do not multiply `post.publishedAt` or other post timestamps if they already follow the same convention (they do — same API).
