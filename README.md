# Wordbase

An AI-native blog management system with full MCP (Model Context Protocol) support. Built to replace WordPress with a modern stack that AI tools can manage autonomously.

**Live:** [blog.norvyn.com](https://blog.norvyn.com)

## Architecture

```
                    ┌─────────────────────┐
                    │       Caddy         │
                    │  TLS + Reverse Proxy│
                    └────┬──────────┬─────┘
                         │          │
              /api/*     │          │  /*
                         ▼          ▼
              ┌──────────────┐  ┌──────────┐
              │  Hono API    │  │ Astro SSG│
              │  (Node.js)   │  │  (HTML)  │
              │  Port 4100   │  │  dist/   │
              ├──────────────┤  └──────────┘
              │  MCP Server  │
              │  (stdio)     │
              ├──────────────┤
              │   SQLite     │
              │   blog.db    │
              └──────────────┘
```

| Layer | Technology |
|-------|-----------|
| Frontend | Astro 4 SSG, Tailwind CSS, Preact |
| Backend | Hono, TypeScript, Node.js |
| Database | SQLite + Drizzle ORM |
| MCP | @modelcontextprotocol/sdk (stdio) |
| Proxy | Caddy (auto HTTPS) |
| Auth | API Key (prefix + bcrypt) |

## Project Structure

```
wordbase/
├── packages/
│   ├── api/                    # Backend API + MCP server
│   │   ├── src/
│   │   │   ├── routes/         # REST API endpoints
│   │   │   ├── services/       # Business logic
│   │   │   ├── middleware/     # Auth, redirects, error handling
│   │   │   ├── mcp/           # MCP server + 18 tools
│   │   │   ├── cli/           # API key management CLI
│   │   │   └── db/            # Drizzle schema + migrations
│   │   └── data/
│   │       ├── blog.db        # SQLite database
│   │       └── uploads/       # Media files (YYYY/MM/)
│   └── web/                   # Astro frontend
│       ├── src/
│       │   ├── pages/         # Blog pages (SSG)
│       │   │   ├── admin/     # Admin panel
│       │   │   ├── posts/     # Post detail pages
│       │   │   ├── categories/
│       │   │   ├── tags/
│       │   │   └── page/      # Pagination
│       │   ├── components/    # Astro + Preact components
│       │   ├── layouts/       # BaseLayout, AdminLayout
│       │   └── lib/           # API client, utilities
│       └── dist/              # Build output (served by Caddy)
├── scripts/                   # Migration + utility scripts
└── deploy/                    # systemd, Caddy configs, setup script
```

## Quick Start

### Prerequisites

- Node.js >= 18
- pnpm

### Development

```bash
# Install dependencies
pnpm install

# Start API server (port 4100)
cd packages/api && pnpm dev

# Start frontend dev server (port 4321)
cd packages/web && pnpm dev

# Create an API key
cd packages/api && pnpm cli key:create admin
```

### Build

```bash
# Build API (TypeScript → JavaScript)
cd packages/api && pnpm build

# Build frontend (requires API running for data fetch)
cd packages/web && pnpm build
```

## REST API

All endpoints at `/api/*`. Auth via `Authorization: Bearer <api-key>`.

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/posts` | GET | No | List posts (filter: status, category, tag, search) |
| `/api/posts/:slug` | GET | No | Get post by ID or slug |
| `/api/posts` | POST | Yes | Create post |
| `/api/posts/:id` | PUT | Yes | Update post |
| `/api/posts/:id` | DELETE | Yes | Delete post |
| `/api/posts/:id/publish` | POST | Yes | Publish post |
| `/api/posts/:id/archive` | POST | Yes | Archive post |
| `/api/categories` | GET/POST | GET:No, POST:Yes | Category CRUD |
| `/api/tags` | GET/POST | GET:No, POST:Yes | Tag CRUD |
| `/api/pages` | GET/POST | GET:No, POST:Yes | Static page CRUD |
| `/api/media` | GET/POST/DELETE | Yes | Media upload + library |
| `/api/posts/:id/comments` | GET | No | List approved comments |
| `/api/posts/:id/comments` | POST | No | Submit comment (pending) |
| `/api/comments/:id/approve` | POST | Yes | Approve comment |
| `/api/comments/:id/spam` | POST | Yes | Mark spam |
| `/api/analytics/pageview` | POST | No | Record page view |
| `/api/analytics/overview` | GET | Yes | Traffic overview |
| `/api/settings` | GET/PUT | Yes | Site settings |
| `/api/build/trigger` | POST | Yes | Trigger Astro rebuild |
| `/api/build/status` | GET | Yes | Build status |
| `/api/redirects` | GET/POST/DELETE | Yes | URL redirect management |

## MCP Server

18 tools for AI-powered blog management via stdio protocol.

### Setup (Claude Desktop)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wordbase": {
      "command": "node",
      "args": ["/path/to/wordbase/packages/api/dist/mcp/server.js"],
      "env": {
        "WORDBASE_API_KEY": "your-api-key"
      }
    }
  }
}
```

For development (without compiling):

```json
{
  "mcpServers": {
    "wordbase": {
      "command": "npx",
      "args": ["tsx", "/path/to/wordbase/packages/api/src/mcp/server.ts"],
      "env": {
        "WORDBASE_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|------------|
| `blog_list_posts` | List posts with filtering (status, category, tag, search) |
| `blog_get_post` | Get post by ID or slug |
| `blog_create_post` | Create a new post (Markdown) |
| `blog_list_media` | List media library |
| `blog_upload_media` | Upload file (base64 encoded) |
| `blog_delete_media` | Delete media item |
| `blog_list_comments` | List comments (filter by status) |
| `blog_moderate_comment` | Approve, spam, or trash a comment |
| `blog_reply_comment` | Reply to a comment |
| `blog_delete_comment` | Delete a comment |
| `blog_analytics_overview` | Traffic overview (PV, today, active posts) |
| `blog_analytics_top_posts` | Top posts by page views |
| `blog_analytics_trends` | Traffic trends (daily/weekly/monthly) |
| `blog_content_stats` | Publish frequency, tag distribution |
| `blog_trigger_build` | Trigger Astro site rebuild |
| `blog_build_status` | Check build status |
| `blog_manage_redirects` | List, create, or delete URL redirects |
| `blog_update_post_meta` | Update post SEO metadata |

## AI Integration Architecture

This system is designed from the ground up for AI management. Three interfaces provide the same capabilities at different levels:

```
AI Agent (Claude, GPT, etc.)
    │
    ├── MCP (stdio) ──→ packages/api/src/mcp/server.ts
    │                     └── tools.ts (18 tools)
    │                           └── imports from services/*
    │
    ├── REST API ─────→ packages/api/src/routes/*
    │                     └── also imports from services/*
    │
    └── Admin UI ─────→ packages/web/src/pages/admin/*
                          └── calls REST API via fetch
```

**The core principle:** MCP tools and REST API routes are thin wrappers around the same service layer (`packages/api/src/services/`). All business logic lives in services; routes and tools are just input/output adapters.

### Key Files for AI Development

| What | Where | When to touch |
|------|-------|---------------|
| MCP tool definitions | `packages/api/src/mcp/tools.ts` | Adding/modifying AI capabilities |
| MCP server entry | `packages/api/src/mcp/server.ts` | Auth, transport, startup |
| Service layer | `packages/api/src/services/*.service.ts` | Business logic changes |
| REST routes | `packages/api/src/routes/*.ts` | HTTP API changes |
| DB schema | `packages/api/src/db/schema.ts` | Data model changes |
| Auth middleware | `packages/api/src/middleware/auth.ts` | `authMiddleware` (Hono middleware) + `validateBearerToken` (reusable function) |
| Type definitions | `packages/api/src/types.ts` | `AppEnv`, `AuthContext` |

### Adding a New MCP Tool

1. Add the business logic in the appropriate service file (`packages/api/src/services/`)
2. Register the tool in `packages/api/src/mcp/tools.ts`:

```typescript
server.tool(
  'blog_your_tool_name',        // Prefix with blog_ for namespace
  'Description for AI agents',   // This is what the AI sees
  {                               // Input schema (JSON Schema-like)
    param1: { type: 'string', description: 'What this param does' },
  },
  async (args: Record<string, unknown>) => {
    const result = await yourService.doSomething(args.param1 as string);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);
```

3. If the tool needs a REST counterpart, add a route in `packages/api/src/routes/`
4. Both tool and route import from the same service function

### Adding a New REST Endpoint

1. Create or update service in `packages/api/src/services/`
2. Create route file in `packages/api/src/routes/`:

```typescript
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/index.js';
import type { AppEnv } from '../types.js';

export const myRouter = new Hono<AppEnv>();

myRouter.get('/', authMiddleware, async (c) => { /* ... */ });
```

3. Mount in `packages/api/src/app.ts`: `app.route('/api/my-route', myRouter)`
4. All Hono instances must use `new Hono<AppEnv>()` for auth typing

### Content Lifecycle (AI Workflow)

```
AI creates post via MCP          User writes in admin UI
  blog_create_post ──┐              POST /api/posts ──┐
                     ▼                                ▼
              postService.createPost()
                     │
                     ▼
              SQLite (blog.db)
                     │
              blog_publish_post / POST /api/posts/:id/publish
                     │
                     ▼
              blog_trigger_build / POST /api/build/trigger
                     │
                     ▼
              Astro rebuild (shell spawn)
                     │
                     ▼
              Static HTML in dist/ → served by Caddy
```

### Conventions

- **IDs**: nanoid (not auto-increment, not UUID)
- **Timestamps**: Unix seconds (not milliseconds)
- **Content format**: Markdown (stored raw, rendered at build/display time)
- **Error responses**: `{ error: { code: string, message: string } }`
- **Auth**: Bearer token in `Authorization` header; public endpoints (pageview, comment submit, published post reads) need no auth
- **MCP auth**: `WORDBASE_API_KEY` environment variable, validated against DB on startup
- **Static site**: Astro SSG; data fetched from API at build time; comments load client-side at runtime

## Admin Panel

Web-based admin at `/admin`. Login with API key.

- **Dashboard** — Post count, pending comments, page views
- **Post Editor** — Markdown with live preview, categories, tags, cover image
- **Media Library** — Upload, browse, delete files
- **Comments** — Moderate (approve/spam/delete)
- **Categories & Tags** — CRUD management
- **Settings** — Site title, description, social links

## Deployment

### Server Requirements

- Node.js >= 18
- Caddy (or any reverse proxy)
- systemd (for service management)

### Deploy

```bash
# From local machine
ssh your-server 'bash -s' < deploy/setup.sh
```

The setup script handles: git clone, pnpm install, TypeScript build, database init, API key creation, Astro build, systemd service, Caddy config, SELinux contexts.

### Upload Migrated Data

```bash
scp packages/api/data/blog.db server:/var/www/wordbase/packages/api/data/
rsync -av packages/api/data/uploads/ server:/var/www/wordbase/packages/api/data/uploads/
```

### WordPress Migration

```bash
# Prerequisites: SSH tunnel to WordPress MySQL
ssh -L 3307:localhost:3306 your-server

# Set environment variables
export WP_DB_PASSWORD=your_wp_password

# Run migration
cd packages/api && npx tsx ../../scripts/migrate.ts
```

Migrates: posts (HTML to Markdown via turndown), pages, categories, tags, media (SCP download), comments (with nesting), URL redirects.

## Data Model

12 tables in SQLite:

| Table | Description |
|-------|------------|
| `posts` | Blog posts (Markdown content, status, slug, meta) |
| `categories` | Post categories |
| `tags` | Post tags |
| `post_categories` | Post-category junction |
| `post_tags` | Post-tag junction |
| `comments` | Comments (nested via parent_id, moderation status) |
| `media` | Uploaded files (path, mime, size) |
| `pages` | Static pages (about, etc.) |
| `settings` | Key-value site configuration |
| `page_views` | Analytics (hashed IP, referrer, path) |
| `api_keys` | Auth keys (prefix + bcrypt hash) |
| `redirects` | URL redirects (301/302) |

## API Key Management

```bash
# Create a new key
cd packages/api && pnpm cli key:create admin

# Regenerate an existing key
cd packages/api && pnpm cli key:regenerate admin
```

Keys use prefix-based lookup (first 8 chars) + bcrypt verification. The raw key is shown once at creation; store it securely.

## Design

The frontend uses an "Ink & Paper" editorial aesthetic:

- **Typography** — Cormorant Garamond + Noto Serif SC (headings), system sans-serif (navigation)
- **Color** — Warm paper `#f6f3ee`, deep ink `#1a1a1a`, vermillion accent `#c23a22`
- **Texture** — Subtle SVG noise overlay for paper feel
- **Layout** — Content-focused 680px max width, generous spacing

## License

Private.
