---
type: dev-guide
status: active
tags: [blog, mcp, api, astro, hono, sqlite]
refs: [docs/06-plans/2026-03-21-wordbase-blog-system-design.md]
current: true
confirmed_at: 2026-03-21T18:00:00
---

# Wordbase Development Guide

**Project brief:** none (greenfield project)
**Design doc:** docs/06-plans/2026-03-21-wordbase-blog-system-design.md

## Global Constraints

- Tech stack: Astro SSG frontend, Hono + TypeScript backend, SQLite + Drizzle ORM
- Server: RHEL 9, 1.7GB RAM, Node v18, Caddy
- Content format: Markdown
- Auth: API Key with CLI recovery (systemd direct, not pm2)
- Target: blog.norvyn.com initially, later switch to norvyn.com

---

<!-- section: phase-1 keywords: drizzle, sqlite, database-schema, monorepo -->
## Phase 1: Project Setup & Database Schema

**Status:** ✅ Completed — 2026-03-21

**Goal:** Monorepo structure ready with SQLite database and all Drizzle schemas created.

**Depends on:** None

**Scope:**
- Initialize monorepo with pnpm workspaces
- Set up packages/api (Hono + TypeScript)
- Set up packages/web (Astro)
- Create Drizzle schema for all tables
- Run initial migration to create database

**Architecture decisions:**
- Package manager: pnpm (confirmed)
- Database file location: packages/api/data/blog.db (confirmed)

**Acceptance criteria:**
- [x] `pnpm install` succeeds in project root
- [x] `cd packages/api && pnpm dev` starts Hono server on port 4100
- [x] `cd packages/web && pnpm dev` starts Astro dev server
- [x] Database file `packages/api/data/blog.db` exists
- [x] All 12 tables from design schema exist (posts, categories, tags, post_categories, post_tags, comments, media, pages, settings, page_views, api_keys, redirects)

**Review checklist:**
- [x] /execution-review: Verify monorepo builds and runs
- [x] /implementation-review: 0 gaps, 0 mismatches

<!-- /section -->

---

<!-- section: phase-2 keywords: hono, rest-api, mcp, authentication -->
## Phase 2: Core API & Authentication

**Status:** ✅ Completed — 2026-03-21

**Goal:** REST API server running with authentication, basic CRUD for posts/categories/tags.

**Depends on:** Phase 1

**Scope:**
- Hono server setup with TypeScript
- API Key authentication middleware
- REST routes: posts (CRUD), categories (CRUD), tags (CRUD), pages (CRUD)
- MCP server basic scaffolding with stdio protocol
- Service layer (services/ for business logic)

**Architecture decisions:**
- MCP server implementation: @modelcontextprotocol/sdk v1.27.1 (confirmed)
- Error handling: `{ error: { code, message } }` structured format (confirmed)
- API Key storage: prefix (8 chars) + bcrypt hash (confirmed)
- MCP auth: WORDBASE_API_KEY environment variable with DB validation (confirmed)

**Acceptance criteria:**
- [x] GET /api/posts returns JSON array
- [x] POST /api/posts creates new post (requires auth)
- [x] GET /api/categories returns categories
- [x] GET /api/tags returns tags
- [x] Unauthenticated requests to /api/posts (POST/PUT/DELETE) return 401
- [x] `pnpm mcp` starts MCP server in stdio mode (with WORDBASE_API_KEY)
- [x] MCP tools `blog_list_posts`, `blog_get_post`, `blog_create_post` functional

**Review checklist:**
- [x] /implementation-review: 0 critical gaps, 2 standard (1 fixed, 1 known issue)

<!-- /section -->

---

<!-- section: phase-3 keywords: media, uploads, file-storage -->
## Phase 3: Media Management

**Status:** ✅ Completed — 2026-03-21

**Goal:** Media upload and library management operational.

**Depends on:** Phase 2

**Scope:**
- Media upload endpoint (POST /api/media)
- Media library list (GET /api/media)
- Media deletion (DELETE /api/media/:id)
- File storage in packages/api/data/uploads/
- MCP tools: blog_upload_media, blog_list_media, blog_delete_media

**Architecture decisions:**
- File size limits: 10MB (confirmed)
- Image processing: deferred to later phase (confirmed)
- Storage path structure: date-based YYYY/MM/ (confirmed)
- Static serving: Hono serveStatic for dev, Caddy for production (confirmed)

**Acceptance criteria:**
- [x] POST /api/media accepts multipart/form-data upload
- [x] Uploaded file saved to packages/api/data/uploads/
- [x] GET /api/media returns list with id, filename, path, mime_type, size + url
- [x] DELETE /api/media/:id removes file and database record
- [x] MCP tool blog_upload_media works

**Review checklist:**
- [x] /implementation-review: 0 critical gaps

<!-- /section -->

---

<!-- section: phase-4 keywords: comments, moderation -->
## Phase 4: Comments System

**Status:** ✅ Completed — 2026-03-21

**Goal:** Comment submission and moderation operational.

**Depends on:** Phase 2

**Scope:**
- Comment submission (POST /api/posts/:postId/comments) - public
- Comment list (GET /api/posts/:postId/comments) - auth required
- Comment moderation: approve/spam/trash endpoints
- Comment reply (nested comments via parent_id)
- MCP tools: blog_list_comments, blog_moderate_comment, blog_reply_comment, blog_delete_comment

**Architecture decisions:**
- Comment content format: plain text only (confirmed)
- Auth refactored: extracted `validateBearerToken` helper for conditional auth use cases

**Acceptance criteria:**
- [x] Unauthenticated POST /api/posts/:postId/comments creates pending comment
- [x] GET /api/posts/:postId/comments returns approved comments only (public)
- [x] GET /api/posts/:postId/comments?status=pending returns pending (auth required)
- [x] POST /api/comments/:id/approve changes status to approved
- [x] POST /api/comments/:id/spam changes status to spam
- [x] Nested replies display correctly with parent_id

**Review checklist:**
- [x] /implementation-review: 1 fix applied (inline auth → validateBearerToken), 1 known issue (test file deferred — no test infra)

<!-- /section -->

---

<!-- section: phase-5 keywords: analytics, page-views -->
## Phase 5: Analytics

**Status:** ✅ Completed — 2026-03-21

**Goal:** Page view tracking and analytics API operational.

**Depends on:** Phase 2

**Scope:**
- Page view recording (POST /api/analytics/pageview) - public
- Analytics overview (GET /api/analytics/overview)
- Per-post stats (GET /api/analytics/posts/:id)
- MCP tools: blog_analytics_overview, blog_analytics_top_posts, blog_analytics_trends, blog_content_stats

**Architecture decisions:**
- IP hashing: SHA-256, truncated to 16 chars (confirmed)
- Data retention: no auto-cleanup (confirmed, defer to later)
- Overview response: counts only, top posts/trends via MCP tools (DP-001 confirmed)

**Acceptance criteria:**
- [x] POST /api/analytics/pageview records view (no auth required)
- [x] GET /api/analytics/overview returns total PV, today's PV, active post count
- [x] GET /api/analytics/posts/:id returns views for specific post
- [x] MCP tool blog_analytics_overview returns correct data

**Review checklist:**
- [x] /implementation-review: 0 critical gaps

<!-- /section -->

---

<!-- section: phase-6 keywords: astro, blog-frontend, static-site -->
## Phase 6: Blog Frontend (Astro)

**Status:** ✅ Completed — 2026-03-21

**Goal:** Blog frontend fully functional with static pages.

**Depends on:** Phase 2, Phase 3, Phase 4

**Scope:**
- Astro project setup with TypeScript
- Homepage: post list with pagination
- Post page: Markdown rendering, cover image
- Category page: posts by category
- Tag page: posts by tag
- Page rendering (static pages from pages table)
- Comment section component for posts
- Social share buttons (WeChat, Twitter, copy link)
- Basic styling (Tailwind CSS + Typography)

**Architecture decisions:**
- Styling: Tailwind CSS + @tailwindcss/typography (confirmed)
- Markdown renderer: marked library (confirmed)
- Comment section: vanilla JS client-side fetch, no Preact island needed (confirmed)
- Pagination: /page/[page].astro with paginate() + static homepage shows first 10 (confirmed)
- Archives: dedicated archives.astro (confirmed)

**Acceptance criteria:**
- [x] Astro builds successfully to packages/web/dist/
- [x] Homepage displays published posts list
- [x] Post page renders Markdown content correctly
- [x] Category/tag pages filter posts correctly
- [x] Comments load via client-side fetch from API
- [x] Share buttons functional (WeChat QR modal, Twitter, copy link)
- [x] 404 page exists

**Review checklist:**
- [x] /implementation-review: 8 gaps fixed (paginate, QR modal, API functions, status filter)

<!-- /section -->

---

<!-- section: phase-7 keywords: admin, markdown-editor, dashboard -->
## Phase 7: Admin Panel

**Status:** ✅ Completed — 2026-03-21

**Goal:** Admin dashboard operational for content management.

**Depends on:** Phase 2, Phase 3

**Scope:**
- Admin SPA at /admin (Astro pages with Preact islands)
- Login: API Key authentication (localStorage)
- Dashboard: overview stats (posts count, pending comments, views)
- Post editor: Markdown with live preview + cover image
- Media library browser in admin
- Category/tag management UI
- Comment moderation UI
- Settings UI + Settings API routes

**Architecture decisions:**
- Admin routing: Astro static pages + Preact client:load islands (confirmed)
- Editor: textarea + marked for preview (confirmed)
- State management: plain Preact hooks (confirmed)
- Auth storage: localStorage (A-01 known deviation from httpOnly cookie design)
- Settings API: added as part of Phase 7 (DP-001 resolved)

**Acceptance criteria:**
- [x] /admin login page accepts API Key
- [x] Dashboard shows post count, pending comments, recent activity
- [x] Post editor creates new post with title, content, categories, tags, cover image
- [x] Post editor has live Markdown preview
- [x] Media browser displays uploaded files
- [x] Comment moderation: approve/spam/delete buttons work
- [x] Settings page allows updating site title, description, posts per page, comment moderation

**Review checklist:**
- [x] /implementation-review: 11 gaps found, critical fix applied (redirect 404), remaining UI polish items noted

<!-- /section -->

---

<!-- section: phase-8 keywords: migration, wordpress, redirects -->
## Phase 8: WordPress Migration

**Status:** ✅ Completed — 2026-03-21

**Goal:** Content migrated from WordPress to new system.

**Depends on:** Phase 2 (API ready), Phase 6 (frontend renders migrated content)

**Scope:**
- Migration script: connect to WordPress MySQL via SSH tunnel
- Convert HTML posts to Markdown (turndown)
- Import categories and tags
- Import pages
- Download and store media attachments (SCP)
- Import comments with nesting
- Generate redirect entries from old URLs
- Verify migrated data integrity

**Architecture decisions:**
- HTML to Markdown: turndown library (confirmed)
- Media download: sequential SCP (confirmed)
- Migration: single-run script with verification (confirmed)

**Acceptance criteria:**
- [x] Script connects to WordPress MySQL successfully
- [x] 128 posts imported (2 more than estimated 126 — includes draft/private)
- [x] 8 pages imported
- [x] 12 categories imported
- [x] 173 tags imported
- [x] 201 media files downloaded to uploads/ (0 failed)
- [x] 18 comments imported
- [x] 260 redirect entries generated
- [x] Content format verified: Markdown (no HTML tags)

**Review checklist:**
- [x] Migration script ran successfully with verification output

<!-- /section -->

---

<!-- section: phase-9 keywords: build-trigger, deployment, systemd -->
## Phase 9: Build & Deploy Infrastructure

**Status:** ✅ Completed — 2026-03-22

**Goal:** Automated build triggering and server deployment ready.

**Depends on:** Phase 6

**Scope:**
- Build trigger endpoint (POST /api/build/trigger)
- Build status endpoint (GET /api/build/status)
- Systemd service file for API server
- Caddy configuration for blog.norvyn.com
- Sitemap generation
- MCP tools: blog_trigger_build, blog_build_status
- GitHub repo + deploy script

**Architecture decisions:**
- Build execution: shell spawn via child_process (confirmed)
- Build status tracking: in-memory (confirmed)
- Caddy config: /api/* → reverse proxy, /uploads/* → file_server, /* → static site (confirmed)
- Deployment: git clone on server + deploy/setup.sh (confirmed)

**Acceptance criteria:**
- [x] POST /api/build/trigger starts Astro build
- [x] GET /api/build/status returns current build state
- [x] Systemd service file created (deploy/wordbase-api.service)
- [x] Caddy config created (deploy/blog.norvyn.com.caddy)
- [x] Caddy reverse proxies /api/* to localhost:4100
- [x] Sitemap accessible at /sitemap.xml (345 URLs)

**Review checklist:**
- [x] Build trigger and sitemap verified locally
- [ ] ⚠️ 需设备验证：在服务器上运行 deploy/setup.sh

<!-- /section -->

---

<!-- section: phase-10 keywords: seo, redirects, polish -->
## Phase 10: SEO & Polish

**Status:** ✅ Completed — 2026-03-22

**Goal:** SEO features complete and final polish applied.

**Depends on:** Phase 9

**Scope:**
- Redirect management (GET/POST/DELETE /api/redirects)
- Redirect middleware in API server (catches old WP ?p=ID URLs + redirect table)
- Post meta editing via MCP (og_title, og_description, og_image)
- Social meta tags in Astro layouts (og:title, og:description, og:image)
- MCP tools: blog_manage_redirects, blog_update_post_meta

**Architecture decisions:**
- Redirect: Hono middleware checking redirect table + ?p=ID fallback (confirmed)

**Acceptance criteria:**
- [x] Redirect middleware handles old URLs via redirect table
- [x] Post pages have og:title, og:description, og:image in BaseLayout
- [x] Redirects manageable via API (GET/POST/DELETE /api/redirects) and MCP
- [x] Post meta editable via MCP (blog_update_post_meta)

**Review checklist:**
- [x] API compiles clean, redirect middleware + routes implemented

<!-- /section -->

---

<!-- section: phase-11 keywords: production, cutover -->
## Phase 11: Production Cutover

**Status:** ✅ Code Ready — 2026-03-22

**Goal:** System fully deployed to production domain.

**Depends on:** Phase 10

**Scope:**
- Deploy to blog.norvyn.com via deploy/setup.sh
- Upload migrated data (blog.db + uploads/) to server
- Verify blog.norvyn.com works
- When ready: switch to norvyn.com via deploy/wordbase-production config
- blog.norvyn.com redirects to norvyn.com

**Cutover steps (manual, on server):**
1. `ssh norvyn 'bash -s' < deploy/setup.sh` — initial deploy
2. `scp packages/api/data/blog.db norvyn:/var/www/wordbase/packages/api/data/` — upload DB
3. `rsync -av packages/api/data/uploads/ norvyn:/var/www/wordbase/packages/api/data/uploads/` — upload media
4. Rebuild frontend on server (needs data): `ssh norvyn 'cd /var/www/wordbase && source .env && cd packages/api && node dist/index.js & sleep 3 && cd ../web && pnpm build && kill %1'`
5. Verify https://blog.norvyn.com
6. When satisfied: `sudo cp deploy/wordbase-production /etc/caddy/sites.v2/wordbase && sudo rm /etc/caddy/sites.v2/blog.enable && sudo ln -sf wordbase /etc/caddy/sites.v2/wordbase.enable && sudo systemctl reload caddy`

**Acceptance criteria:**
- [ ] blog.norvyn.com serves new blog (⚠️ needs server deployment)
- [ ] Later: norvyn.com serves new blog
- [ ] Later: blog.norvyn.com redirects to norvyn.com
- [ ] WordPress backup created on server

**Review checklist:**
- [ ] ⚠️ 需设备验证：在服务器上执行部署和切换

<!-- /section -->

---

## Decisions

None.

The design doc is complete and contains sufficient detail to phase the development without requiring additional decisions at this stage.