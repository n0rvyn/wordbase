---
type: plan
status: active
tags: [hono, rest-api, mcp, authentication, typescript]
refs: [docs/06-plans/2026-03-21-wordbase-blog-system-design.md]
---

# Wordbase Blog System - Phase 2 Implementation Plan

**Goal:** Implement REST API server with authentication, CRUD operations for posts/categories/tags/pages, and MCP server scaffolding.

**Architecture:**
- Hono server with layered architecture: routes → services → database
- API Key authentication via Bearer token, bcrypt hashing for key storage
- MCP server using `@modelcontextprotocol/sdk` with stdio protocol
- Service layer isolated from HTTP layer for reuse between REST and MCP

**Tech Stack:** Hono ^4.12.0, Drizzle ORM ^0.45.0, SQLite, @modelcontextprotocol/sdk, bcryptjs, nanoid

**Design doc:** /Users/norvyn/Code/Projects/wordbase/docs/06-plans/2026-03-21-wordbase-blog-system-design.md

**Crystal file:** None

---
<!-- section: task-1 keywords: dependencies, pnpm, bcryptjs, nanoid, mcp-sdk, schema-update -->
### Task 1: Add Dependencies and Update Schema for key_prefix

**Files:**
- Modify: `/Users/norvyn/Code/Projects/wordbase/packages/api/package.json`
- Modify: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/db/schema.ts`
- Modify: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/db/index.ts`

**Steps:**
1. Add the following dependencies to package.json:
   - `bcryptjs` — for API key hashing
   - `@types/bcryptjs` — TypeScript types for bcryptjs (devDependencies)
   - `nanoid` — for ID generation (posts, categories, tags)
   - `@modelcontextprotocol/sdk` — MCP server SDK

2. Update `src/db/schema.ts`: add `keyPrefix: text('key_prefix').notNull()` to the `apiKeys` table definition.

3. Update `src/db/index.ts`: In the `CREATE TABLE IF NOT EXISTS api_keys` SQL, add `key_prefix TEXT NOT NULL` column. Also add `ALTER TABLE api_keys ADD COLUMN key_prefix TEXT NOT NULL DEFAULT ''` wrapped in try/catch (for existing databases where table already exists without the column).

4. Delete existing `packages/api/data/blog.db` and re-run migration to recreate with new schema (Phase 1 data is empty, no loss):
   ```bash
   rm -f packages/api/data/blog.db && pnpm db:migrate
   ```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase && pnpm install`
Expected: All packages installed without errors
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && sqlite3 data/blog.db ".schema api_keys" | grep key_prefix`
Expected: Shows `key_prefix TEXT NOT NULL`
<!-- /section -->

---

<!-- section: task-2 keywords: middleware, authentication, api-key -->
### Task 2: Create API Key Authentication Middleware

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/middleware/auth.ts`
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/middleware/index.ts`

**Steps:**
1. Create `src/middleware/auth.ts`:
   - Import `db` from `../db/index.js`
   - Import `apiKeys` schema from `../db/schema.js`
   - Import `bcryptjs` for hash comparison
   - Create `authMiddleware` that extracts `Authorization: Bearer <api-key>` header
   - Extract key prefix (first 8 chars) from the bearer token
   - Query `api_keys` table WHERE `key_prefix = prefix` (single row lookup)
   - If found, verify full key with `bcrypt.compare(token, row.keyHash)`
   - Return 401 if key invalid, missing, or bcrypt mismatch
   - On success, set `c.set('auth', { keyId, permissions })` and call next
   - Note: requires `key_prefix` column in api_keys table (added in schema update below)

2. Create `src/middleware/index.ts`:
   - Re-export auth middleware

3. Create `src/types.ts` for shared types:
   - Define `AuthContext` interface: `{ keyId: string, permissions: string[] }`
   - Define `AppEnv` type for Hono: `{ Variables: { auth: AuthContext } }`
   - All Hono instances (`new Hono<AppEnv>()`) must use this type parameter for `c.set('auth')`/`c.get('auth')` to compile

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && npx tsc --noEmit src/middleware/auth.ts`
Expected: No TypeScript errors
<!-- /section -->

---

<!-- section: task-3 keywords: service-layer, posts, business-logic -->
### Task 3: Create Post Service Layer

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/services/post.service.ts`
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/services/index.ts`

**Steps:**
1. Create `src/services/post.service.ts`:
   - Import `db` from `../db/index.js`
   - Import schema: `posts`, `postCategories`, `postTags`
   - Import `nanoid` for ID generation
   - Implement `listPosts(options)`: accepts { status, category, tag, page, limit, search }
     - Returns posts with pagination metadata
   - Implement `getPost(id)`: returns single post by id or slug
   - Implement `createPost(data)`: accepts { title, content, slug, excerpt, coverImage, status, categoryIds, tagIds }
     - Generates nanoid for id, slug (fallback to slugified title), timestamps
   - Implement `updatePost(id, data)`: partial update, updates updatedAt
   - Implement `deletePost(id)`: removes post and junction entries
   - Implement `publishPost(id)`: sets status='published', publishedAt=now
   - Implement `archivePost(id)`: sets status='archived'

2. Create `src/services/index.ts`:
   - Export all services

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && npx tsc --noEmit src/services/post.service.ts`
Expected: No TypeScript errors
<!-- /section -->

---

<!-- section: task-4 keywords: service-layer, categories, tags -->
### Task 4: Create Category and Tag Service Layers

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/services/category.service.ts`
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/services/tag.service.ts`

**Steps:**
1. Create `src/services/category.service.ts`:
   - Import `db`, `categories`, `nanoid`
   - Implement `listCategories()`: returns all categories ordered by sortOrder
   - Implement `getCategory(id)`: returns category by id or slug
   - Implement `createCategory(data)`: { name, slug, description, sortOrder }
   - Implement `updateCategory(id, data)`: partial update
   - Implement `deleteCategory(id)`: removes category

2. Create `src/services/tag.service.ts`:
   - Import `db`, `tags`, `nanoid`
   - Implement `listTags()`: returns all tags ordered by name
   - Implement `getTag(id)`: returns tag by id or slug
   - Implement `createTag(data)`: { name, slug }
   - Implement `updateTag(id, data)`: partial update
   - Implement `deleteTag(id)`: removes tag

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && npx tsc --noEmit src/services/category.service.ts src/services/tag.service.ts`
Expected: No TypeScript errors
<!-- /section -->

---

<!-- section: task-5 keywords: service-layer, pages -->
### Task 5: Create Page Service Layer

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/services/page.service.ts`

**Steps:**
1. Create `src/services/page.service.ts`:
   - Import `db`, `pages`, `nanoid`
   - Implement `listPages()`: returns all pages ordered by sortOrder
   - Implement `getPage(idOrSlug)`: returns page by id or slug
   - Implement `createPage(data)`: { title, slug, content, sortOrder, status, meta }
   - Implement `updatePage(id, data)`: partial update
   - Implement `deletePage(id)`: removes page

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && npx tsc --noEmit src/services/page.service.ts`
Expected: No TypeScript errors
<!-- /section -->

---

<!-- section: task-6 keywords: routes, posts, rest-api -->
### Task 6: Create Posts REST Routes

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/routes/posts.ts`

**Steps:**
1. Create `src/routes/posts.ts`:
   - Import `Hono` from `hono`
   - Import auth middleware from `../middleware/index.js`
   - Import post service from `../services/index.js`
   - GET `/` — list posts (public, no auth required)
     - Query params: status, category, tag, page (default 1), limit (default 10), search
   - GET `/:idOrSlug` — get single post (public)
   - POST `/` — create post (requires auth)
     - Body: title, content, slug?, excerpt?, coverImage?, status?, categoryIds?, tagIds?
   - PUT `/:id` — update post (requires auth)
   - DELETE `/:id` — delete post (requires auth)
   - POST `/:id/publish` — publish post (requires auth)
   - POST `/:id/archive` — archive post (requires auth)

2. Update `src/app.ts` to mount routes:
   ```typescript
   import { app as postsApp } from './routes/posts.js';
   // ... mount at /api/posts
   app.route('/api/posts', postsApp);
   ```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && npx tsc --noEmit`
Expected: No TypeScript errors
<!-- /section -->

---

<!-- section: task-7 keywords: routes, categories, rest-api -->
### Task 7: Create Categories and Tags REST Routes

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/routes/categories.ts`
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/routes/tags.ts`

**Steps:**
1. Create `src/routes/categories.ts`:
   - GET `/` — list all (public)
   - GET `/:idOrSlug` — get single (public)
   - POST `/` — create (requires auth)
   - PUT `/:id` — update (requires auth)
   - DELETE `/:id` — delete (requires auth)

2. Create `src/routes/tags.ts`:
   - GET `/` — list all (public)
   - GET `/:idOrSlug` — get single (public)
   - POST `/` — create (requires auth)
   - PUT `/:id` — update (requires auth)
   - DELETE `/:id` — delete (requires auth)

3. Mount in `src/app.ts`:
   ```typescript
   app.route('/api/categories', categoriesApp);
   app.route('/api/tags', tagsApp);
   ```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && npx tsc --noEmit`
Expected: No TypeScript errors
<!-- /section -->

---

<!-- section: task-8 keywords: routes, pages, rest-api -->
### Task 8: Create Pages REST Routes

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/routes/pages.ts`

**Steps:**
1. Create `src/routes/pages.ts`:
   - GET `/` — list all (public)
   - GET `/:idOrSlug` — get single (public)
   - POST `/` — create (requires auth)
   - PUT `/:id` — update (requires auth)
   - DELETE `/:id` — delete (requires auth)

2. Mount in `src/app.ts`:
   ```typescript
   app.route('/api/pages', pagesApp);
   ```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && npx tsc --noEmit`
Expected: No TypeScript errors
<!-- /section -->

---

<!-- section: task-9 keywords: routes, error-handling, response-format -->
### Task 9: Add Centralized Error Handling

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/middleware/error.ts`

**Steps:**
1. Create error handling middleware:
   - Create `errorMiddleware` for catching exceptions
   - Return consistent JSON error format: `{ error: { code, message } }`
   - Map common errors: 400 (Bad Request), 401 (Unauthorized), 404 (Not Found), 500 (Internal Error)

2. Add to `src/app.ts`:
   ```typescript
   import { errorMiddleware } from './middleware/error.js';
   app.onError(errorMiddleware);
   ```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && npx tsc --noEmit`
Expected: No TypeScript errors
<!-- /section -->

---

<!-- section: task-10 keywords: mcp, server, stdio, scaffold -->
### Task 11: Create MCP Server Scaffolding

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/mcp/server.ts`
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/mcp/tools.ts`
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/mcp/index.ts`
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/dist/mcp/server.js` (compilation target)

**Steps:**
1. Create `src/mcp/tools.ts`:
   - Import post service from `../services/index.js`
   - Define tool schemas for Phase 2:
     - `blog_list_posts`: { status?, category?, tag?, page?, limit?, search? } → returns post[]
     - `blog_get_post`: { idOrSlug } → returns post
     - `blog_create_post`: { title, content, slug?, status?, categoryIds?, tagIds? } → returns created post

2. Create `src/mcp/server.ts`:
   - Import `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`
   - Import `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`
   - Import tools from `./tools.js`
   - Read `WORDBASE_API_KEY` from `process.env`; if missing, print error and exit(1)
   - Validate the API key against db (same prefix+bcrypt logic as auth middleware)
   - Create server instance with tools
   - Connect stdio transport and initialize
   - Initialize database before starting (call `initializeDatabase()`)

3. Create `src/mcp/index.ts`:
   - Export server startup function

4. Update `package.json`:
   - Add `"mcp": "tsx src/mcp/server.ts"` to scripts (use tsx for dev, node dist/mcp/server.js for production)

5. Compile and verify:
   - Run `npx tsc --noEmit` to verify TypeScript compiles
   - Test `pnpm mcp` starts MCP server in stdio mode

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && pnpm build`
Expected: TypeScript compiles without errors, `dist/mcp/server.js` exists
<!-- /section -->

---

<!-- section: task-12 keywords: cli, api-key, command -->
### Task 12: Create API Key CLI Command

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/cli/keys.ts`
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/cli/index.ts`

**Steps:**
1. Create `src/cli/keys.ts`:
   - Import `db` from `../db/index.js`
   - Import `apiKeys` from `../db/schema.js`
   - Import `bcryptjs` for hashing
   - Import `nanoid` for ID generation
   - Implement `generateKey(name, permissions)`:
     - Generate random key string (32 chars)
     - Extract prefix (first 8 chars)
     - Hash full key with bcrypt
     - Insert into api_keys table with key_prefix, key_hash
     - Print the raw key (shown only once)
   - Note: Also update `packages/api/src/db/schema.ts` to add `keyPrefix: text('key_prefix').notNull()` to apiKeys table, and update `initializeDatabase()` SQL in `packages/api/src/db/index.ts` to include `key_prefix TEXT NOT NULL` column
   - Implement CLI entry:
     - Parse `process.argv` for command: `key:create <name> [permissions...]`
     - Default permissions: 'posts:read', 'posts:write'

2. Create `src/cli/index.ts`:
   - Export CLI functions

3. Update `package.json`:
   - Add `"key:create": "tsx src/cli/index.ts key:create"` to scripts

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && pnpm key:create -- admin`
Expected: Generates new API key and prints it to console
<!-- /section -->

---

<!-- section: task-13 keywords: integration-test, acceptance-criteria -->
### Task 13: Integration Testing and Verification

**Files:**
- Test: `curl` commands against running server

**Steps:**
1. Start the server:
   ```bash
   cd /Users/norvyn/Code/Projects/wordbase/packages/api && pnpm dev
   ```

2. Create an API key:
   ```bash
   pnpm key:create -- admin posts:read posts:write
   ```

3. Test acceptance criteria:
   - GET /api/posts → should return JSON array (empty or with data)
   - POST /api/posts (no auth) → should return 401
   - POST /api/posts (with auth) → should create post
   - GET /api/categories → should return categories
   - GET /api/tags → should return tags
   - Test MCP: `node dist/mcp/server.js` starts without error (stdio mode)

4. Verify MCP tools functional:
   - Use an MCP client to test blog_list_posts, blog_get_post, blog_create_post

**Verify:**
All acceptance criteria pass:
- [ ] GET /api/posts returns JSON array
- [ ] POST /api/posts creates new post (requires auth)
- [ ] GET /api/categories returns categories
- [ ] GET /api/tags returns tags
- [ ] Unauthenticated requests to /api/posts (POST/PUT/DELETE) return 401
- [ ] `cd packages/api && pnpm mcp` (or `node dist/mcp/server.js`) starts MCP server in stdio mode
- [ ] MCP tools `blog_list_posts`, `blog_get_post`, `blog_create_post` functional
<!-- /section -->

---

## Decisions

### [DP-001] Centralized Error Response Format (recommended)

**Context:** Need consistent error handling across REST API and MCP server.

**Options:**
- A: `{ error: { code: string, message: string } }` — structured, machine-parseable
- B: `{ message: string, status: number }` — simpler, Hono default style

**Chosen:** A — Structured error format `{ error: { code, message } }`

### [DP-002] API Key Storage Format (blocking)

**Context:** The api_keys table stores `key_hash` as bcrypt hash. Need to verify the authentication middleware can match incoming keys against stored hashes efficiently.

**Options:**
- A: Store prefix of raw key + bcrypt hash of full key — allows key lookup without iterating all keys
- B: Iterate through all keys, bcrypt.compare each — simpler but slower with many keys
- C: Store key hash directly (SHA-256), no bcrypt — faster but less secure

**Chosen:** A — Store key prefix (first 8 chars) + bcrypt hash, lookup by prefix then verify with bcrypt.

### [DP-003] MCP Server Authentication (blocking)

**Context:** MCP tools in Phase 2 require authentication. The MCP protocol doesn't have a standard auth mechanism — how does the MCP client pass credentials?

**Options:**
- A: Accept API key via stdin on startup, store in memory — simple for stdio
- B: Use environment variable `WORDBASE_API_KEY` — standard approach
- C: Read from config file `~/.wordbase/config` — persistent but more setup

**Chosen:** B — Use `WORDBASE_API_KEY` environment variable for MCP server authentication.

---
## Verification
- **Verdict:** Approved
- **Date:** 2026-03-21
- **Note:** MCP SDK import paths to be verified at execution time via actual package inspection