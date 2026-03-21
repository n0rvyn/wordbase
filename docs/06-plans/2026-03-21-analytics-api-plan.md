---
type: plan
status: active
tags: [analytics, hono, mcp, rest-api, page-views]
refs: [docs/06-plans/2026-03-21-wordbase-blog-system-design.md]
---

# Analytics API Implementation Plan

**Goal:** Page view tracking and analytics API operational.

**Architecture:** REST API endpoints follow Hono<AppEnv> pattern, services layer with Drizzle ORM, MCP tools registered via server.tool() pattern. IP hashing uses SHA-256. Analytics routes mounted under /api/analytics. No auto-cleanup in Phase 5.

**Tech Stack:** Node.js, Hono, TypeScript, Drizzle ORM, SQLite, SHA-256 (Node crypto)

**Design doc:** docs/06-plans/2026-03-21-wordbase-blog-system-design.md

---
<!-- section: task-1 keywords: analytics-service, pageview, db -->
### Task 1: Create Analytics Service

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/services/analytics.service.ts`

**Steps:**
1. Import dependencies: `db` from db/index, `pageViews`, `posts`, `postTags`, `tags` from db/schema, `eq`, `desc`, `count`, `sql`, `and`, `gte`, `like` from drizzle-orm
2. Create `RecordPageViewInput` type:
   ```typescript
   export type RecordPageViewInput = {
     path: string;
     referrer?: string;
     userAgent?: string;
     ipHash?: string;
   };
   ```
3. Implement `recordPageView(input: RecordPageViewInput)`:
   - Insert into page_views with createdAt = Math.floor(Date.now() / 1000)
   - Return the inserted record
4. Implement `getTotalPageViews()`: SELECT COUNT(*) as total FROM page_views
5. Implement `getTodayPageViews()`: SELECT COUNT(*) as total FROM page_views WHERE created_at >= today's start timestamp
6. Implement `getActivePostCount()`: SELECT COUNT(*) FROM posts WHERE status = 'published'
7. Implement `getPostPageViews(postId: string)`: Extract slug or path pattern from post, query page_views WHERE path LIKE pattern, return count
8. Implement `getTopPosts(limit: number = 10)`:
   - Query page_views grouped by path, extract post slug from path pattern /blog/:slug, count per slug, join with posts table to get titles, order by count DESC
9. Implement `getTrends(period: 'daily' | 'weekly' | 'monthly')`:
   - Group page_views by date bucket based on period
   - Return array of { date: string, views: number }
10. Implement `getContentStats()`:
    - Get publish frequency: query posts grouped by month
    - Get tag distribution: count posts per tag via post_tags join
    - Return { postsPerMonth: [], tagDistribution: [] }

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && pnpm exec tsx -e "import * as svc from './src/services/analytics.service.js'; console.log('Service loaded:', typeof svc.recordPageView)"`
Expected: `Service loaded: function`
<!-- /section -->

<!-- section: task-2 keywords: analytics-router, pageview, rest -->
### Task 2: Create Analytics REST Routes

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/routes/analytics.ts`
- Modify: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/app.ts:line-range`

**Steps:**
1. Create analytics router with `new Hono<AppEnv>()`
2. POST /pageview — No auth required:
   - Get path from body, validate required
   - Get referrer and userAgent from body (optional)
   - Hash IP: get from x-forwarded-for or x-real-ip, use Node crypto createHash('sha256'), take first 16 chars as ipHash
   - Call `analyticsService.recordPageView({ path, referrer, userAgent, ipHash })`
   - Return 201 with { success: true, id }
3. GET /overview — Auth required:
   - Apply `authMiddleware` to this route
   - Call `analyticsService.getTotalPageViews()`, `getTodayPageViews()`, `getActivePostCount()`
   - Return { totalPageViews, todayPageViews, activePostCount }
4. GET /posts/:id — Auth required:
   - Apply `authMiddleware` to this route
   - Get postId from param, verify post exists (optional, return 404 if not)
   - Call `analyticsService.getPostPageViews(postId)`
   - Return { postId, pageViews }

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && pnpm exec tsx -e "import { analyticsRouter } from './src/routes/analytics.js'; console.log('Router routes:', analyticsRouter.routes.length)"`
Expected: `Router routes: 3`
<!-- /section -->

<!-- section: task-3 keywords: app-mount, analytics -->
### Task 3: Mount Analytics Routes in App

**Files:**
- Modify: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/app.ts:7-10,26-27`

**Steps:**
1. Add import for analyticsRouter: `import { analyticsRouter } from './routes/analytics.js';`
2. Mount at `/api/analytics`: Add `app.route('/api/analytics', analyticsRouter);` after mediaRouter line

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && pnpm build 2>&1 | head -20`
Expected: No build errors (or errors not related to analytics)
<!-- /section -->

<!-- section: task-4 keywords: mcp-tools, analytics-mcp, blog_analytics_overview -->
### Task 4: Register Analytics MCP Tools

**Files:**
- Modify: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/mcp/tools.ts:line-range`
- Modify: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/services/index.ts`

**Steps:**
1. Add analytics service export in services/index.ts: `export * as analyticsService from './analytics.service.js';`
2. Import analytics service in mcp/tools.ts: `import * as analyticsService from '../services/analytics.service.js';`
3. Add `blog_analytics_overview` tool:
   ```typescript
   server.tool(
     'blog_analytics_overview',
     'Get traffic overview: total page views, today page views, and active post count',
     {},
     async () => {
       const total = await analyticsService.getTotalPageViews();
       const today = await analyticsService.getTodayPageViews();
       const activePosts = await analyticsService.getActivePostCount();
       return { content: [{ type: 'text' as const, text: JSON.stringify({ totalPageViews: total, todayPageViews: today, activePostCount: activePosts }, null, 2) }] };
     }
   );
   ```
4. Add `blog_analytics_top_posts` tool:
   ```typescript
   server.tool(
     'blog_analytics_top_posts',
     'Get top posts by page views',
     { limit: { type: 'number', description: 'Number of posts to return (default: 10)' } },
     async (args: Record<string, unknown>) => {
       const posts = await analyticsService.getTopPosts(args.limit as number | undefined);
       return { content: [{ type: 'text' as const, text: JSON.stringify(posts, null, 2) }] };
     }
   );
   ```
5. Add `blog_analytics_trends` tool:
   ```typescript
   server.tool(
     'blog_analytics_trends',
     'Get traffic trends over time',
     { period: { type: 'string', description: 'Period: daily, weekly, or monthly (default: daily)' } },
     async (args: Record<string, unknown>) => {
       const trends = await analyticsService.getTrends((args.period as string) || 'daily');
       return { content: [{ type: 'text' as const, text: JSON.stringify(trends, null, 2) }] };
     }
   );
   ```
6. Add `blog_content_stats` tool:
   ```typescript
   server.tool(
     'blog_content_stats',
     'Get content statistics: publish frequency and tag distribution',
     {},
     async () => {
       const stats = await analyticsService.getContentStats();
       return { content: [{ type: 'text' as const, text: JSON.stringify(stats, null, 2) }] };
     }
   );
   ```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && pnpm exec tsx -e "import { registerTools } from './src/mcp/tools.js'; console.log('registerTools is function:', typeof registerTools === 'function')"`
Expected: `registerTools is function: true`
<!-- /section -->

<!-- section: task-5 keywords: test-analytics, verification -->
### Task 5: Verify All Endpoints

**Files:**
- Test: REST API manual verification

**Steps:**
1. Start server: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && pnpm dev &`
2. Test POST /api/analytics/pageview (no auth):
   ```bash
   curl -X POST http://localhost:4100/api/analytics/pageview \
     -H "Content-Type: application/json" \
     -d '{"path": "/blog/test-post", "referrer": "https://google.com"}'
   ```
   Expected: 201 with { success: true, id }
3. Get auth token (existing key or create via CLI)
4. Test GET /api/analytics/overview (with auth):
   ```bash
   curl -H "Authorization: Bearer YOUR_API_KEY" \
     http://localhost:4100/api/analytics/overview
   ```
   Expected: 200 with { totalPageViews, todayPageViews, activePostCount }
5. Test GET /api/analytics/posts/:id (with auth) — use an existing post ID from db
   Expected: 200 with { postId, pageViews }
6. Test MCP tools by connecting MCP client (or verify tool registration loads without error)

**Verify:**
Each curl returns expected HTTP status and JSON response structure matching design doc specs.

## Decisions

### [DP-001] Overview endpoint response scope (blocking)
**Chosen:** B — Overview returns counts only (totalPV, todayPV, activePostCount). Top posts and trends available via MCP tools and dedicated service functions.

---
## Verification
- **Verdict:** Approved
- **Date:** 2026-03-21
- **Note:** 2 revisions applied (imports, DP-001 decision)

## Design Analysis

No design analysis file provided. UX Assertions from design doc:

- UX-001: Unauthenticated users cannot access /api/* except pageview — Task 2 implements this by not applying authMiddleware to POST /pageview
- UX-005: MCP tools and REST API call the same service layer — Task 4 imports analyticsService, same as REST routes will use
