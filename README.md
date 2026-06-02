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

### Configuration (`.env`)

All config lives in **one git-ignored `.env` at the project root** (copy `.env.example`). It's loaded automatically at startup (API / CLI / MCP / migrate) regardless of cwd; on the server, systemd reads the same file via `EnvironmentFile`. Do **not** create a separate `packages/api/.env`.

```bash
cp .env.example .env
pnpm --filter api cli key:create admin   # prints a key → paste into .env as WORDBASE_API_KEY
```

| Variable | Required | What it is / how to get it |
|---|---|---|
| `WORDBASE_API_KEY` | **yes** | Auth for the REST API + MCP server. Mint with `pnpm --filter api cli key:create <name>`. |
| `WORDBASE_DB_PATH` | no | SQLite path (default `./data/blog.db`). |
| `SITE_URL` | no | Public site origin, e.g. `https://norvyn.com`. |
| `ASC_KEY_ID` | for app sync | App Store Connect API **Key ID** — ASC → *Users and Access → Integrations → App Store Connect API*. |
| `ASC_ISSUER_ID` | for app sync | The **Issuer ID** on that same ASC API-keys page. |
| `ASC_PRIVATE_KEY_PATH` | for app sync | Path to the downloaded `.p8`. **Relative paths anchor to the repo root** — just drop the file in `asc_keys/` and set `asc_keys/AuthKey_XXXX.p8` (works on every machine + the server, no per-env edits). Absolute paths also work. |
| `ASC_WEBHOOK_SECRET` | optional | Only if wiring the ASC webhook (leave unset otherwise). |

The `ASC_*` vars are only needed for `app_sync` / `app_discover` (pulling App Store metadata); blog/podcast/pages work without them. The `asc_keys/*.p8` file is git-ignored — copy it to the server separately: `scp -r asc_keys <server>:/var/www/wordbase/`.

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

38 tools for AI-powered content management (blog · podcast · apps · companion pages) via the MCP stdio protocol. An MCP client discovers the full, authoritative tool list at runtime via `tools/list`; the tables below mirror it for quick reference.

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

Mint a key with `pnpm --filter api cli key:create <name>` (printed once). The server validates `WORDBASE_API_KEY` at startup; all tools run under that key's identity.

### Available Tools

**Blog / media / comments / analytics (18)**

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

**Podcast (7)**

| Tool | Description |
|------|------------|
| `podcast_list_shows` | List podcast shows |
| `podcast_create_show` | Create a podcast show |
| `podcast_publish_show` | Publish a show |
| `podcast_list_episodes` | List episodes for a show |
| `podcast_create_episode` | Create an episode |
| `podcast_upload_audio` | Upload episode audio (base64) |
| `podcast_publish_episode` | Publish an episode (triggers a rebuild) |

**Apps (7)**

| Tool | Description |
|------|------------|
| `app_list` | List app landing pages (filter by status) |
| `app_create` | Create an app landing page |
| `app_update` | Update an app's editorial fields (tagline / features / accentColor / links / sortOrder / status / meta). NOTE: description, screenshots, and icon are App-Store-synced and NOT editable here |
| `app_publish` | Publish an app landing page |
| `app_discover` | Discover apps from App Store Connect — creates draft rows for new ones (no sync, no publish, no ASC write-back) |
| `app_sync` | Sync one app's metadata from the App Store (iTunes Lookup + ASC) |
| `app_sync_all` | Sync metadata for all apps with an App Store ID |

**Companion pages (6)** — privacy / terms / help / support / changelog, served at public `/{slug}` URLs

| Tool | Description |
|------|------------|
| `page_list` | List companion pages |
| `page_get` | Get a page by id or slug |
| `page_create` | Create a companion page (Markdown). Use a `<app>-<type>` slug; optional `app` arg stamps `meta.appId` for app↔page association |
| `page_update` | Update a page |
| `page_delete` | Delete a page |
| `page_publish` | Publish a page (run a build afterward to render it at its public URL) |

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

### Scopes (enforced)

Each key carries a `permissions` array of `domain:action` scopes (e.g. `posts:write`, `media:read`, `build:trigger`). Every authenticated REST route and every MCP tool checks the calling key's scopes — a key missing the required scope gets **403** (REST) or an error result (MCP). Matching rules:

- `*` or `admin` → full access (every scope).
- `<domain>:*` (e.g. `apps:*`) → every action in that domain.
- otherwise an exact `domain:action` match is required.

Available scopes (a `:read` scope only gates the authenticated read routes/tools; public GETs need no key):

| Domain | Scopes | Gates |
|--------|--------|-------|
| `posts` | `posts:read`, `posts:write` | read = MCP list/get (incl. drafts); write = create/update/delete/publish/archive |
| `pages` | `pages:read`, `pages:write` | read = MCP list/get; write = create/update/delete/publish |
| `categories` | `categories:write` | create/update/delete |
| `tags` | `tags:write` | create/update/delete |
| `comments` | `comments:read`, `comments:write` | read = view pending/spam; write = approve/spam/edit/delete/reply |
| `media` | `media:read`, `media:write` | read = list/get; write = upload/delete |
| `apps` | `apps:read`, `apps:write` | read = MCP list; write = create/update/delete/publish/discover/sync |
| `podcasts` | `podcasts:read`, `podcasts:write` | read = MCP list; write = show/episode create/update/delete/publish/upload |
| `redirects` | `redirects:read`, `redirects:write` | read = list; write = create/delete |
| `settings` | `settings:read`, `settings:write` | read = get; write = update |
| `analytics` | `analytics:read` | overview / per-post stats |
| `observability` | `observability:read` | admin observability panel |
| `build` | `build:read`, `build:trigger` | read = status; trigger = start a rebuild |

`key:create <name>` with no scopes mints a **full-admin** (`*`) key; pass explicit scopes for a least-privilege key:

```bash
# full-admin key (default) — for the primary WORDBASE_API_KEY
cd packages/api && pnpm cli key:create admin
# least-privilege key — can only publish posts and trigger builds
cd packages/api && pnpm cli key:create ci posts:write build:trigger
```

Treat a leaked key as a compromise of whatever it is scoped to, and rotate with `key:regenerate`. **Migration note:** existing keys minted before enforcement may carry partial scopes; re-mint or update the deployed `WORDBASE_API_KEY` to `["*"]` (or the scopes its integrations need) so it is not 403d after deploy.

## Design

The frontend uses an "Ink & Paper" editorial aesthetic:

- **Typography** — Cormorant Garamond + Noto Serif SC (headings), system sans-serif (navigation)
- **Color** — Warm paper `#f6f3ee`, deep ink `#1a1a1a`, vermillion accent `#c23a22`
- **Texture** — Subtle SVG noise overlay for paper feel
- **Layout** — Content-focused 680px max width, generous spacing

## License

Private.
