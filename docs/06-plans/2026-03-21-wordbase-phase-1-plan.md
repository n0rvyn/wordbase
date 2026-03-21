---
type: plan
status: active
tags: [monorepo, pnpm, drizzle, sqlite, hono, astro]
refs: [docs/06-plans/2026-03-21-wordbase-blog-system-design.md]
---

# Phase 1: Project Setup & Database Schema Implementation Plan

**Goal:** Monorepo structure ready with SQLite database and all Drizzle schemas created.

**Architecture:**
- pnpm workspaces monorepo with two packages: api (Hono + TypeScript) and web (Astro)
- SQLite database with Drizzle ORM for schema definition and migrations
- Database file at packages/api/data/blog.db
- API server runs on port 4100

**Tech Stack:**
- Package manager: pnpm (workspaces)
- Backend: Hono + TypeScript
- Frontend: Astro
- Database: SQLite + Drizzle ORM

**Design doc:** docs/06-plans/2026-03-21-wordbase-blog-system-design.md

**Crystal file:** none

---

## Decisions

None.

---

<!-- section: task-1 keywords: pnpm, workspaces, monorepo -->
### Task 1: Initialize pnpm monorepo with workspaces

**Files:**
- Modify: `/Users/norvyn/Code/Projects/wordbase/package.json` (create)
- Create: `/Users/norvyn/Code/Projects/wordbase/pnpm-workspace.yaml`

**Steps:**

1. Create root `package.json` with pnpm workspaces configuration:
```json
{
  "name": "wordbase",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev:api": "pnpm --filter api dev",
    "dev:web": "pnpm --filter web dev",
    "build": "pnpm --filter \"api\" build && pnpm --filter \"web\" build",
    "db:migrate": "pnpm --filter api db:migrate"
  },
  "engines": {
    "node": ">=18"
  }
}
```

2. Create `pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
```

3. Verify pnpm is available:
```bash
which pnpm || npm install -g pnpm
```

4. Run `pnpm install` to initialize workspace:
```bash
cd /Users/norvyn/Code/Projects/wordbase && pnpm install
```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase && pnpm install`
Expected: Install completes without errors, node_modules created in root

<!-- /section -->

---

<!-- section: task-2 keywords: hono, typescript, api -->
### Task 2: Set up packages/api with Hono + TypeScript

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/package.json`
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/tsconfig.json`
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/index.ts`
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/app.ts`

**Steps:**

1. Create `packages/api/package.json`:
```json
{
  "name": "api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "@hono/node-server": "^1.0.0",
    "drizzle-orm": "^0.29.0",
    "better-sqlite3": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/better-sqlite3": "^7.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "drizzle-kit": "^0.20.0"
  }
}
```

2. Create `packages/api/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

3. Create `packages/api/src/index.ts` (entry point):
```typescript
import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = parseInt(process.env.PORT || '4100', 10);

console.log(`Starting API server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`API server running on http://localhost:${port}`);
```

4. Create `packages/api/src/app.ts` (minimal Hono app):
```typescript
import { Hono } from 'hono';

export const app = new Hono();

app.get('/', (c) => c.json({ status: 'ok', message: 'Wordbase API' }));
app.get('/health', (c) => c.json({ status: 'healthy' }));
```

5. Install API dependencies:
```bash
cd /Users/norvyn/Code/Projects/wordbase/packages/api && pnpm install
```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && pnpm dev &` (background), then `sleep 3 && curl http://localhost:4100/health`
Expected: `{"status":"healthy"}`

<!-- /section -->

---

<!-- section: task-3 keywords: astro, frontend, web -->
### Task 3: Set up packages/web with Astro

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/web/package.json`
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/web/astro.config.mjs`
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/web/tsconfig.json`
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/web/src/pages/index.astro`

**Steps:**

1. Create `packages/web/package.json`:
```json
{
  "name": "web",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "astro": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

2. Create `packages/web/astro.config.mjs`:
```javascript
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://blog.norvyn.com',
  output: 'static',
  server: {
    port: 4321,
  },
  build: {
    outDir: './dist',
  },
});
```

3. Create `packages/web/tsconfig.json`:
```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "strictNullChecks": true
  }
}
```

4. Create `packages/web/src/pages/index.astro`:
```astro
---
// Welcome to Wordbase
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Wordbase</title>
  </head>
  <body>
    <h1>Wordbase Blog</h1>
    <p>Welcome to your new blog system.</p>
  </body>
</html>
```

5. Install web dependencies:
```bash
cd /Users/norvyn/Code/Projects/wordbase/packages/web && pnpm install
```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/web && pnpm dev &` (background), then `sleep 5 && curl -s http://localhost:4321/ | head -20`
Expected: HTML with "Wordbase Blog" heading

<!-- /section -->

---

<!-- section: task-4 keywords: drizzle, sqlite, schema -->
### Task 4: Create Drizzle schema for all 12 tables

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/db/schema.ts`
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/db/index.ts`
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/drizzle.config.ts`

**Steps:**

1. Create directory structure:
```bash
mkdir -p /Users/norvyn/Code/Projects/wordbase/packages/api/src/db
mkdir -p /Users/norvyn/Code/Projects/wordbase/packages/api/data
```

2. Create `packages/api/src/db/schema.ts` with all 12 tables:
```typescript
import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

// posts table
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  slug: text('slug').unique().notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  excerpt: text('excerpt'),
  coverImage: text('cover_image'),
  status: text('status').notNull().default('draft'),
  shareToken: text('share_token').unique(),
  publishedAt: integer('published_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  meta: text('meta'), // JSON
});

// categories table
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  slug: text('slug').unique().notNull(),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0),
});

// tags table
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  slug: text('slug').unique().notNull(),
  name: text('name').notNull(),
});

// post_categories junction table
export const postCategories = sqliteTable('post_categories', {
  postId: text('post_id').notNull(),
  categoryId: text('category_id').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.postId, t.categoryId] }),
}));

// post_tags junction table
export const postTags = sqliteTable('post_tags', {
  postId: text('post_id').notNull(),
  tagId: text('tag_id').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.postId, t.tagId] }),
}));

// comments table
export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull(),
  parentId: text('parent_id'),
  authorName: text('author_name').notNull(),
  authorEmail: text('author_email'),
  authorUrl: text('author_url'),
  content: text('content').notNull(),
  status: text('status').notNull().default('pending'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at').notNull(),
});

// media table
export const media = sqliteTable('media', {
  id: text('id').primaryKey(),
  filename: text('filename').notNull(),
  path: text('path').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  width: integer('width'),
  height: integer('height'),
  altText: text('alt_text'),
  createdAt: integer('created_at').notNull(),
});

// pages table
export const pages = sqliteTable('pages', {
  id: text('id').primaryKey(),
  slug: text('slug').unique().notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  sortOrder: integer('sort_order').default(0),
  status: text('status').notNull().default('draft'),
  meta: text('meta'), // JSON
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// settings table
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// page_views table
export const pageViews = sqliteTable('page_views', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull(),
  referrer: text('referrer'),
  userAgent: text('user_agent'),
  ipHash: text('ip_hash'),
  createdAt: integer('created_at').notNull(),
});

// api_keys table
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(),
  permissions: text('permissions').notNull(), // JSON array
  lastUsedAt: integer('last_used_at'),
  createdAt: integer('created_at').notNull(),
});

// redirects table
export const redirects = sqliteTable('redirects', {
  id: text('id').primaryKey(),
  fromPath: text('from_path').unique().notNull(),
  toPath: text('to_path').notNull(),
  statusCode: integer('status_code').default(301),
  createdAt: integer('created_at').notNull(),
});

// Type exports for queries
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Media = typeof media.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type PageView = typeof pageViews.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Redirect = typeof redirects.$inferSelect;
```

3. Create `packages/api/src/db/index.ts` (database connection):
```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';

const sqlite = new Database('./data/blog.db');
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
export const db = drizzle(sqlite, { schema });

// Initialize tables
export function initializeDatabase() {
  sqlite.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      excerpt TEXT,
      cover_image TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      share_token TEXT UNIQUE,
      published_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      meta TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS post_categories (
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS post_tags (
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
      author_name TEXT NOT NULL,
      author_email TEXT,
      author_url TEXT,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      alt_text TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      meta TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS page_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      referrer TEXT,
      user_agent TEXT,
      ip_hash TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      permissions TEXT NOT NULL,
      last_used_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS redirects (
      id TEXT PRIMARY KEY,
      from_path TEXT UNIQUE NOT NULL,
      to_path TEXT NOT NULL,
      status_code INTEGER DEFAULT 301,
      created_at INTEGER NOT NULL
    );
  `);
}
```

4. Create `packages/api/drizzle.config.ts`:
```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/blog.db',
  },
} satisfies Config;
```

**Verify:**
Run: `ls -la /Users/norvyn/Code/Projects/wordbase/packages/api/data/`
Expected: Directory exists, no blog.db yet (created on first run)

<!-- /section -->

---

<!-- section: task-5 keywords: drizzle, migration, sqlite -->
### Task 5: Run initial migration to create database

**Files:**
- Modify: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/index.ts`
- Modify: `/Users/norvyn/Code/Projects/wordbase/packages/api/package.json`

**Steps:**

1. Update `packages/api/src/index.ts` to initialize database on startup:
```typescript
import { serve } from '@hono/node-server';
import { app } from './app.js';
import { initializeDatabase } from './db/index.js';

const port = parseInt(process.env.PORT || '4100', 10);

console.log('Initializing database...');
initializeDatabase();
console.log(`Starting API server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`API server running on http://localhost:${port}`);
```

2. Create `packages/api/src/db/migrate.ts` (CLI migration runner):
```typescript
import { initializeDatabase } from './index.js';

try {
  console.log('Running migrations...');
  initializeDatabase();
  console.log('Database initialized successfully!');
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
```

3. Run migration to create database:
```bash
cd /Users/norvyn/Code/Projects/wordbase/packages/api && pnpm db:migrate
```

4. Verify all 12 tables exist:
```bash
cd /Users/norvyn/Code/Projects/wordbase/packages/api && sqlite3 data/blog.db ".tables"
```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api/data && sqlite3 blog.db ".tables"`
Expected: Output showing all 12 tables: posts categories tags post_categories post_tags comments media pages settings page_views api_keys redirects

Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api/data && sqlite3 blog.db ".schema" | head -50`
Expected: Schema output with all table definitions

<!-- /section -->

---

## Summary

**Plan file:** `/Users/norvyn/Code/Projects/wordbase/docs/06-plans/2026-03-21-wordbase-phase-1-plan.md`

**Tasks:** 5

**Key files created:**
- `/Users/norvyn/Code/Projects/wordbase/package.json` (root)
- `/Users/norvyn/Code/Projects/wordbase/pnpm-workspace.yaml`
- `/Users/norvyn/Code/Projects/wordbase/packages/api/package.json`
- `/Users/norvyn/Code/Projects/wordbase/packages/api/tsconfig.json`
- `/Users/norvyn/Code/Projects/wordbase/packages/api/src/index.ts`
- `/Users/norvyn/Code/Projects/wordbase/packages/api/src/app.ts`
- `/Users/norvyn/Code/Projects/wordbase/packages/api/src/db/schema.ts`
- `/Users/norvyn/Code/Projects/wordbase/packages/api/src/db/index.ts`
- `/Users/norvyn/Code/Projects/wordbase/packages/api/src/db/migrate.ts`
- `/Users/norvyn/Code/Projects/wordbase/packages/api/drizzle.config.ts`
- `/Users/norvyn/Code/Projects/wordbase/packages/web/package.json`
- `/Users/norvyn/Code/Projects/wordbase/packages/web/astro.config.mjs`
- `/Users/norvyn/Code/Projects/wordbase/packages/web/tsconfig.json`
- `/Users/norvyn/Code/Projects/wordbase/packages/web/src/pages/index.astro`

**Acceptance criteria:**
- `pnpm install` succeeds in project root
- `cd packages/api && pnpm dev` starts Hono server on port 4100
- `cd packages/web && pnpm dev` starts Astro dev server
- Database file `packages/api/data/blog.db` exists
- All 12 tables from design schema exist (posts, categories, tags, post_categories, post_tags, comments, media, pages, settings, page_views, api_keys, redirects)

**Decisions:** 0 blocking, 0 recommended

---
## Verification
- **Verdict:** Approved
- **Date:** 2026-03-21