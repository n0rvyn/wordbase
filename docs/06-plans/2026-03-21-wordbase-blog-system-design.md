---
type: design
status: active
tags: [blog, mcp, api, astro, hono, sqlite]
refs: []
---

# Wordbase: AI-Native Blog Management System

## Overview

Replace WordPress on norvyn.com with a custom-built blog system that natively supports MCP & REST API, enabling AI tools to fully manage the blog. Deploy as `blog.norvyn.com` during development, switch to `norvyn.com` after validation.

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | Astro SSG | SEO native, zero runtime JS, static output served by Caddy |
| Backend | Node.js + Hono + TypeScript | MCP SDK native support, lightweight, type-safe |
| Database | SQLite (Drizzle ORM) | Zero ops, file-based backup, ideal for single-server blog |
| Proxy | Caddy | Already running on server, auto HTTPS |
| Content Format | Markdown | AI-friendly, lightweight, flexible rendering |

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Caddy                         │
│  blog.norvyn.com/* ──→ /var/www/wordbase/dist   │
│  blog.norvyn.com/api/* ──→ localhost:4100       │
│  blog.norvyn.com/share/* ──→ localhost:4100     │
│  norvyn.com ──→ WordPress (unchanged)           │
└─────────────────────────────────────────────────┘
        │                    │
        ▼                    ▼
┌──────────────┐    ┌──────────────────────┐
│  Astro SSG   │    │   Node.js API Server │
│  静态 HTML    │    │   (Hono + TypeScript) │
│  博客前端     │    │                      │
│  管理后台     │    │  ┌─ REST API ────────┤
└──────────────┘    │  ├─ MCP Server ──────┤
                    │  └─ CLI Tools ───────┤
                    │         │            │
                    │    ┌────▼────┐       │
                    │    │ SQLite  │       │
                    │    │ blog.db │       │
                    │    └─────────┘       │
                    └──────────────────────┘
```

### Project Structure (monorepo)

```
wordbase/
├── packages/
│   ├── api/          # Hono API server + MCP server
│   │   ├── src/
│   │   │   ├── routes/       # REST API routes
│   │   │   ├── mcp/          # MCP tool definitions
│   │   │   ├── services/     # Business logic
│   │   │   ├── db/           # Drizzle schema + migrations
│   │   │   └── cli/          # CLI commands (key regeneration etc.)
│   │   └── data/
│   │       ├── blog.db       # SQLite database
│   │       └── uploads/      # Media files
│   └── web/          # Astro frontend (blog + admin)
│       ├── src/
│       │   ├── pages/        # Blog pages (SSG)
│       │   ├── pages/admin/  # Admin SPA pages
│       │   ├── components/   # Shared components
│       │   └── layouts/      # Page layouts
│       └── dist/             # Build output → Caddy serves
├── scripts/          # Migration scripts (WP → SQLite)
└── package.json      # Workspace root
```

## Data Model

### posts
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | nanoid |
| slug | TEXT UNIQUE | URL path |
| title | TEXT NOT NULL | |
| content | TEXT NOT NULL | Markdown source |
| excerpt | TEXT | Manual or auto-truncated |
| cover_image | TEXT | Cover image path |
| status | TEXT NOT NULL | 'draft' / 'published' / 'archived' |
| share_token | TEXT UNIQUE | Non-null = accessible via /share/:token regardless of status |
| published_at | INTEGER | Unix timestamp, supports scheduled publishing |
| created_at | INTEGER NOT NULL | |
| updated_at | INTEGER NOT NULL | |
| meta | TEXT | JSON: { description, og_title, og_image, ... } |

### categories
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | nanoid |
| slug | TEXT UNIQUE | |
| name | TEXT NOT NULL | |
| description | TEXT | |
| sort_order | INTEGER | DEFAULT 0 |

### tags
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | nanoid |
| slug | TEXT UNIQUE | |
| name | TEXT NOT NULL | |

### post_categories
| Column | Type | Notes |
|--------|------|-------|
| post_id | TEXT FK → posts | |
| category_id | TEXT FK → categories | |
| PK | (post_id, category_id) | |

### post_tags
| Column | Type | Notes |
|--------|------|-------|
| post_id | TEXT FK → posts | |
| tag_id | TEXT FK → tags | |
| PK | (post_id, tag_id) | |

### comments
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | nanoid |
| post_id | TEXT FK → posts | ON DELETE CASCADE |
| parent_id | TEXT FK → comments | ON DELETE CASCADE, nested replies |
| author_name | TEXT NOT NULL | |
| author_email | TEXT | |
| author_url | TEXT | |
| content | TEXT NOT NULL | Plain text or limited Markdown |
| status | TEXT NOT NULL | 'pending' / 'approved' / 'spam' / 'trash' |
| ip_address | TEXT | |
| user_agent | TEXT | |
| created_at | INTEGER NOT NULL | |

### media
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | nanoid |
| filename | TEXT NOT NULL | Original filename |
| path | TEXT NOT NULL | Storage path |
| mime_type | TEXT NOT NULL | |
| size | INTEGER NOT NULL | Bytes |
| width | INTEGER | Image width |
| height | INTEGER | Image height |
| alt_text | TEXT | |
| created_at | INTEGER NOT NULL | |

### pages
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | nanoid |
| slug | TEXT UNIQUE | |
| title | TEXT NOT NULL | |
| content | TEXT NOT NULL | Markdown |
| sort_order | INTEGER | DEFAULT 0 |
| status | TEXT NOT NULL | 'draft' / 'published' |
| meta | TEXT | JSON: SEO meta |
| created_at | INTEGER NOT NULL | |
| updated_at | INTEGER NOT NULL | |

### settings
| Column | Type | Notes |
|--------|------|-------|
| key | TEXT PK | e.g. 'site.title', 'nav.menu' |
| value | TEXT NOT NULL | JSON value |
| updated_at | INTEGER NOT NULL | |

### page_views
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | AUTOINCREMENT |
| path | TEXT NOT NULL | Visited path |
| referrer | TEXT | |
| user_agent | TEXT | |
| ip_hash | TEXT | Hashed IP for privacy |
| created_at | INTEGER NOT NULL | |

### api_keys
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | nanoid |
| name | TEXT NOT NULL | e.g. 'admin', 'mcp-readonly' |
| key_hash | TEXT NOT NULL | bcrypt hash |
| permissions | TEXT NOT NULL | JSON array: ['posts:write', 'comments:manage', ...] |
| last_used_at | INTEGER | |
| created_at | INTEGER NOT NULL | |

### redirects
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | nanoid |
| from_path | TEXT UNIQUE NOT NULL | |
| to_path | TEXT NOT NULL | |
| status_code | INTEGER | DEFAULT 301 |
| created_at | INTEGER NOT NULL | |

## REST API

Authentication: `Authorization: Bearer <api-key>`

### Posts
```
GET    /api/posts                    # List (filter: ?status=&category=&tag=&page=&limit=&search=)
GET    /api/posts/:slug              # Detail
POST   /api/posts                    # Create
PUT    /api/posts/:id                # Update
DELETE /api/posts/:id                # Delete
POST   /api/posts/:id/publish        # Publish
POST   /api/posts/:id/archive        # Archive
POST   /api/posts/:id/share          # Generate share link
DELETE /api/posts/:id/share          # Revoke share link
```

### Categories
```
GET    /api/categories
POST   /api/categories
PUT    /api/categories/:id
DELETE /api/categories/:id
```

### Tags
```
GET    /api/tags
POST   /api/tags
PUT    /api/tags/:id
DELETE /api/tags/:id
```

### Comments
```
GET    /api/posts/:postId/comments   # Comments for a post
POST   /api/posts/:postId/comments   # Submit comment (no auth required)
PUT    /api/comments/:id             # Edit/moderate
DELETE /api/comments/:id
POST   /api/comments/:id/approve     # Approve
POST   /api/comments/:id/spam        # Mark spam
```

### Media
```
POST   /api/media                    # Upload
GET    /api/media                    # List
DELETE /api/media/:id
```

### Pages
```
GET    /api/pages
GET    /api/pages/:slug
POST   /api/pages
PUT    /api/pages/:id
DELETE /api/pages/:id
```

### Settings
```
GET    /api/settings
PUT    /api/settings                 # Batch update
```

### Analytics
```
POST   /api/analytics/pageview       # Record PV (no auth required)
GET    /api/analytics/overview       # Overview (PV, top posts, trends)
GET    /api/analytics/posts/:id      # Per-post stats
```

### Build
```
POST   /api/build/trigger            # Trigger Astro rebuild
GET    /api/build/status             # Build status
```

### Redirects
```
GET    /api/redirects
POST   /api/redirects
DELETE /api/redirects/:id
```

### SEO
```
POST   /api/seo/sitemap/regenerate   # Regenerate sitemap
```

### Share (public)
```
GET    /api/share/:token             # Get post via share link (no auth)
```

## MCP Tools

MCP Server exposed via stdio protocol, sharing the same service layer as REST API.

All tools prefixed with `blog_` to avoid namespace conflicts.

### Content Management
- `blog_list_posts` — List posts (filter/search support)
- `blog_get_post` — Get post detail
- `blog_create_post` — Create post (Markdown)
- `blog_update_post` — Update post
- `blog_delete_post` — Delete post
- `blog_publish_post` — Publish post
- `blog_archive_post` — Archive post

### Share
- `blog_create_share_link` — Generate share link
- `blog_revoke_share_link` — Revoke share link

### Categories/Tags
- `blog_manage_categories` — Category CRUD
- `blog_manage_tags` — Tag CRUD

### Comments
- `blog_list_comments` — List comments (filter by status)
- `blog_moderate_comment` — Moderate (approve/spam/trash)
- `blog_reply_comment` — Reply to comment
- `blog_delete_comment` — Delete comment

### Media
- `blog_upload_media` — Upload image/file
- `blog_list_media` — List media library
- `blog_delete_media` — Delete media

### Pages
- `blog_manage_pages` — Page CRUD

### Analytics
- `blog_analytics_overview` — Traffic overview
- `blog_analytics_top_posts` — Top posts ranking
- `blog_analytics_trends` — Traffic trends (daily/weekly/monthly)
- `blog_content_stats` — Content stats (publish frequency, tag distribution)

### Site Configuration
- `blog_get_settings` — Get site settings
- `blog_update_settings` — Update site settings

### Build & Deploy
- `blog_trigger_build` — Trigger Astro rebuild
- `blog_build_status` — Check build status
- `blog_clear_cache` — Clear cache

### SEO
- `blog_update_post_meta` — Update post SEO metadata
- `blog_regenerate_sitemap` — Regenerate sitemap
- `blog_manage_redirects` — Redirect CRUD

## Deployment

### Server Layout
```
/var/www/wordbase/          # New directory, WordPress untouched
├── dist/                   # Astro build output (Caddy serves)
├── api/
│   ├── dist/               # TypeScript compiled output
│   └── data/
│       ├── blog.db         # SQLite database
│       └── uploads/        # Media files
├── astro/                  # Astro source (for rebuilds)
└── .env                    # Environment variables
```

### Caddy Configuration (new site block)
```caddyfile
blog.norvyn.com {
    encode gzip

    handle /api/* {
        reverse_proxy localhost:4100
    }

    handle /share/* {
        reverse_proxy localhost:4100
    }

    handle {
        root * /var/www/wordbase/dist
        try_files {path} {path}/index.html /404.html
        file_server
    }
}
```

WordPress `norvyn.com` configuration remains unchanged.

### Process Management
- API Server managed by systemd (not pm2)
- Port 4100 (avoids used ports: 3000, 5000-5060)

### Authentication
- API Key stored as bcrypt hash in `api_keys` table
- Multiple keys with different permission levels
- Key recovery: CLI command on server (`wordbase key:regenerate`)
- Admin session: API Key stored in httpOnly cookie

## WordPress Migration

### Scope
- 126 posts (HTML → Markdown via turndown)
- 8 pages
- 12 categories + 173 tags
- 201 attachments (download + path rewrite)
- Comments (preserve nesting)
- URL redirects (old permalink → new slug)

### Migration Script
1. SSH connect to MySQL → read WordPress data
2. Convert post HTML → Markdown (turndown library)
3. Map categories/tags/comment relationships
4. Download attachments + rewrite paths in content
5. Write to SQLite
6. Generate old URL → new URL redirect entries

### Cutover Plan
1. New system fully developed and migration verified on blog.norvyn.com
2. Final migration: run incremental migration script
3. Update norvyn.com Caddy config → point to new system
4. blog.norvyn.com → redirect to norvyn.com
5. Keep WordPress backup for 30 days, then clean up

## User Journeys

### Journey: AI creates and publishes a post via MCP
1. AI tool connects to MCP server (stdio) → gets available tools list
2. AI calls `blog_create_post` (title, content markdown, categories, tags) → returns post id, status=draft
3. AI calls `blog_publish_post` (id) → status becomes published, published_at set
4. API server auto-triggers Astro rebuild → new post page generated
5. User visits blog.norvyn.com → sees new post on homepage

### Journey: Author writes a post in admin
1. Visit /admin → enter API Key → enter Dashboard
2. Click "New Post" → enter Markdown editor
3. Write content, drag image to editor → auto-upload, insert Markdown image link
4. Select categories/tags → set cover image and SEO info
5. Click "Publish" → post published, auto-rebuild
6. Visit post URL → see fully rendered post

### Journey: Visitor reads and comments
1. Visit post page → see Markdown-rendered content
2. Scroll to bottom → see comment section and form
3. Fill in name/email/content → submit → shows "Awaiting moderation"
4. Author approves comment in admin/via MCP → comment appears under post

### Journey: Share draft for preview
1. Author creates share link in admin or via MCP `blog_create_share_link` → gets `/share/:token` URL
2. Share link with others → they see post content regardless of post status
3. Author revokes share link → link returns 404

### Journey: AI analyzes blog data
1. AI calls `blog_analytics_overview` → gets total PV, today's PV, active post count
2. AI calls `blog_analytics_top_posts` → gets top posts ranking
3. AI calls `blog_content_stats` → gets publish frequency, tag distribution
4. AI generates analysis report or suggestions based on data

## UX Assertions

| ID | Assertion | Verification |
|----|-----------|-------------|
| UX-001 | Unauthenticated users cannot access /api/* (except pageview and comment submission) | Grep: route middleware validates API Key, whitelist check |
| UX-002 | Publishing a post auto-triggers Astro rebuild | Grep: publish service calls build trigger |
| UX-003 | Share link can access posts of any status | Grep: share route does not check post status |
| UX-004 | Submitted comments have status 'pending', not immediately visible | Grep: comment create service sets status='pending' |
| UX-005 | MCP tools and REST API call the same service layer | Grep: MCP handlers import from services/ |
| UX-006 | API Key recovery via CLI command regeneration | Grep: CLI command 'regenerate-key' exists |
| UX-007 | Media upload returns URL usable in Markdown | Grep: upload handler returns path/url field |
| UX-008 | WordPress old URLs 301 redirect via redirects table | Grep: redirect middleware queries redirects table |
| UX-009 | Social share buttons include WeChat, Twitter, and copy link | Grep: ShareButtons component includes three share methods |
| UX-010 | Admin Markdown editor supports live preview | Grep: editor component includes preview mode |

## Server Constraints

- Server: RHEL 9, 1.7GB RAM (~676MB available)
- Node v18, MySQL 8.0 (WordPress), Caddy
- Other services running: Nextcloud, various reverse proxies
- API server must stay lightweight (target <50MB RSS)
