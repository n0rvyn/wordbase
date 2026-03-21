---
type: plan
status: active
tags: [media, upload, mcp, hono, file-storage]
refs: [docs/06-plans/2026-03-21-wordbase-blog-system-design.md]
---

# Media Upload and Library Management Implementation Plan

**Goal:** Media upload and library management operational.

**Architecture:** REST API endpoints for media CRUD operations + MCP tools that call the same service layer. Storage uses date-based folder structure (YYYY/MM/) in `data/uploads/`. File upload handled via Hono's multipart support with 10MB size limit. No image processing in Phase 3.

**Tech Stack:** Hono (hono ^4.12.0), Drizzle ORM, better-sqlite3, nanoid ^5, Node.js native file system APIs

**Design doc:** docs/06-plans/2026-03-21-wordbase-blog-system-design.md

---
<!-- section: task-1 keywords: media-service, service-layer, file-storage -->
### Task 1: Create Media Service Layer

**Files:**
- Create: `packages/api/src/services/media.service.ts`

**Steps:**
1. Create file with the following implementation:

```typescript
import { eq, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { media } from '../db/schema.js';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join, relative } from 'path';

const UPLOADS_DIR = join(process.cwd(), 'data', 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Ensure uploads directory exists
async function ensureUploadsDir() {
  await mkdir(UPLOADS_DIR, { recursive: true });
}

// Generate date-based path: YYYY/MM/
function getDatePath(): string {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  return `${year}/${month}`;
}

// Generate unique filename to avoid collisions
function generateUniqueFilename(originalName: string): string {
  const ext = originalName.split('.').pop() || '';
  const baseName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${baseName}_${nanoid(8)}.${ext}`;
}

interface UploadOptions {
  file: File | { name: string; size: number; type: string; arrayBuffer: () => Promise<ArrayBuffer> };
  altText?: string;
}

export async function uploadMedia(options: UploadOptions) {
  await ensureUploadsDir();

  const { file, altText } = options;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  const datePath = getDatePath();
  const filename = generateUniqueFilename(file.name);
  const relativePath = `${datePath}/${filename}`;
  const fullPath = join(UPLOADS_DIR, relativePath);

  // Create date directory
  await mkdir(dirname(fullPath), { recursive: true });

  // Write file
  await writeFile(fullPath, buffer);

  const now = Math.floor(Date.now() / 1000);
  const [record] = await db.insert(media).values({
    id: nanoid(),
    filename: file.name,
    path: relativePath,
    mimeType: file.type || 'application/octet-stream',
    size: buffer.length,
    altText: altText || null,
    createdAt: now,
  }).returning();

  return record;
}

export async function listMedia(options: { page?: number; limit?: number } = {}) {
  const { page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(media);
  const total = countResult.count;
  const data = await db.select().from(media).orderBy(desc(media.createdAt)).limit(limit).offset(offset);

  return { data, total, page, limit };
}

export async function getMedia(id: string) {
  const [record] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  return record || null;
}

export async function deleteMedia(id: string) {
  const [record] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!record) return null;

  // Delete file from disk
  try {
    const fullPath = join(UPLOADS_DIR, record.path);
    await unlink(fullPath);
  } catch (error) {
    // File may not exist, continue with DB deletion
    console.warn('Failed to delete file:', error);
  }

  // Delete database record
  const [deleted] = await db.delete(media).where(eq(media.id, id)).returning();
  return deleted || null;
}

export function getUploadsDir(): string {
  return UPLOADS_DIR;
}
```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && npx tsx -e "import * as m from './src/services/media.service.js'; console.log('Service loaded:', typeof m.uploadMedia, typeof m.listMedia, typeof m.deleteMedia)"`
Expected: `Service loaded: function function function`
<!-- /section -->

<!-- section: task-2 keywords: media-router, routes, hono, multipart -->
### Task 2: Create Media Router (REST API)

**Files:**
- Create: `packages/api/src/routes/media.ts`

**Steps:**
1. Create file with the following implementation:

```typescript
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/index.js';
import * as mediaService from '../services/media.service.js';
import type { AppEnv } from '../types.js';

export const mediaRouter = new Hono<AppEnv>();

// List media (public - authenticated users)
mediaRouter.get('/', authMiddleware, async (c) => {
  const { page, limit } = c.req.query();
  const result = await mediaService.listMedia({
    page: page ? parseInt(page) : undefined,
    limit: limit ? parseInt(limit) : undefined,
  });
  return c.json(result);
});

// Get single media
mediaRouter.get('/:id', authMiddleware, async (c) => {
  const media = await mediaService.getMedia(c.req.param('id'));
  if (!media) return c.json({ error: { code: 'NOT_FOUND', message: 'Media not found' } }, 404);
  return c.json(media);
});

// Upload media
mediaRouter.post('/', authMiddleware, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'No file provided' } }, 400);
  }

  const altText = formData.get('alt_text') as string | null;

  try {
    const record = await mediaService.uploadMedia({ file, altText: altText || undefined });
    return c.json(record, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return c.json({ error: { code: 'UPLOAD_ERROR', message } }, 500);
  }
});

// Delete media
mediaRouter.delete('/:id', authMiddleware, async (c) => {
  const deleted = await mediaService.deleteMedia(c.req.param('id'));
  if (!deleted) return c.json({ error: { code: 'NOT_FOUND', message: 'Media not found' } }, 404);
  return c.json({ success: true });
});
```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && npx tsx -e "import { mediaRouter } from './src/routes/media.js'; console.log('Router created:', mediaRouter.routes.length, 'routes')"`
Expected: `Router created: 4 routes` (or similar count)
<!-- /section -->

<!-- section: task-3 keywords: app-mount, routes-registration -->
### Task 3: Register Media Router in App

**Files:**
- Modify: `packages/api/src/app.ts:1-20`

**Steps:**
1. Import the media router at the top of app.ts:

```typescript
import { mediaRouter } from './routes/media.js';
```

2. Add route registration after the existing routes:

```typescript
app.route('/api/media', mediaRouter);
```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && npx tsx -e "import { app } from './src/app.js'; console.log('App routes:', app.routes.length)"`
Expected: App routes count increased by 4
<!-- /section -->

<!-- section: task-4 keywords: mcp-tools, media-mcp, mcp-registration -->
### Task 4: Add Media MCP Tools

**Files:**
- Modify: `packages/api/src/mcp/tools.ts`

**Steps:**
1. Add imports for media service at the top of tools.ts:

```typescript
import * as mediaService from '../services/media.service.js';
```

2. Add media tools to the registerTools function. Append before the closing brace:

```typescript
  // Media tools
  server.tool(
    'blog_list_media',
    'List media library items',
    {
      page: { type: 'number', description: 'Page number (default: 1)' },
      limit: { type: 'number', description: 'Items per page (default: 20)' },
    },
    async (args: Record<string, unknown>) => {
      const result = await mediaService.listMedia({
        page: args.page as number | undefined,
        limit: args.limit as number | undefined,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'blog_upload_media',
    'Upload a file to the media library',
    {
      filename: { type: 'string', description: 'Original filename' },
      content: { type: 'string', description: 'Base64 encoded file content' },
      mimeType: { type: 'string', description: 'MIME type (e.g., image/png, image/jpeg)' },
      altText: { type: 'string', description: 'Alt text for the image (optional)' },
    },
    async (args: Record<string, unknown>) => {
      try {
        const content = Buffer.from(args.content as string, 'base64');
        const file = {
          name: args.filename as string,
          type: args.mimeType as string,
          size: content.length,
          arrayBuffer: async () => content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength),
        };
        const record = await mediaService.uploadMedia({
          file,
          altText: args.altText as string | undefined,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(record, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        return { content: [{ type: 'text' as const, text: `Upload failed: ${message}` }], isError: true };
      }
    }
  );

  server.tool(
    'blog_delete_media',
    'Delete a media item',
    {
      id: { type: 'string', description: 'Media ID to delete' },
    },
    async (args: { id: string }) => {
      const deleted = await mediaService.deleteMedia(args.id);
      if (!deleted) {
        return { content: [{ type: 'text' as const, text: 'Media not found' }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, id: args.id }, null, 2) }] };
    }
  );
```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && npx tsx -e "import { registerTools } from './src/mcp/tools.js'; console.log('Function defined:', typeof registerTools)"`
Expected: `Function defined: function`
<!-- /section -->

<!-- section: task-5 keywords: data-uploads, directory-creation -->
### Task 6: Create Uploads Directory

**Files:**
- Create: `packages/api/data/uploads/.gitkeep`

**Steps:**
1. Create the directory structure and a placeholder file to ensure it exists in git:

```bash
mkdir -p /Users/norvyn/Code/Projects/wordbase/packages/api/data/uploads
touch /Users/norvyn/Code/Projects/wordbase/packages/api/data/uploads/.gitkeep
```

**Verify:**
Run: `ls -la /Users/norvyn/Code/Projects/wordbase/packages/api/data/uploads/`
Expected: Directory exists with .gitkeep file
<!-- /section -->

<!-- section: task-6 keywords: integration-test, upload-test -->
### Task 7: Verify Complete Integration

**Files:**
- No file changes — verification step

**Steps:**
1. Start the API server in background:

```bash
cd /Users/norvyn/Code/Projects/wordbase/packages/api && npx tsx src/index.ts &
sleep 3
```

2. Test media upload endpoint:

```bash
# Create a test image (1x1 PNG)
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > /tmp/test.png

# Test upload
curl -X POST http://localhost:4100/api/media \
  -H "Authorization: Bearer test-key" \
  -F "file=@/tmp/test.png" \
  -F "alt_text=Test image"

# Clean up
rm /tmp/test.png
```

Expected: JSON response with media record containing id, filename, path, mime_type, size

3. Test list endpoint:

```bash
curl -X GET http://localhost:4100/api/media -H "Authorization: Bearer test-key"
```

Expected: JSON array of media items

4. Test delete endpoint:

```bash
# Get an ID from the list response and delete
MEDIA_ID=$(curl -s http://localhost:4100/api/media -H "Authorization: Bearer test-key" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -X DELETE http://localhost:4100/api/media/$MEDIA_ID -H "Authorization: Bearer test-key"
```

Expected: `{"success":true}`

5. Stop the server

**Verify:**
All API endpoints return expected responses. MCP tools are registered and callable via stdio.

---
## Decisions

### [DP-001] Media file serving strategy (blocking)
**Chosen:** C — Hono static route for dev (`/uploads/*` → `data/uploads/`), Caddy config note for production.

Implementation notes:
- Add `serveStatic` middleware in app.ts: `app.use('/uploads/*', serveStatic({ root: './data/uploads', rewriteRequestPath: (p) => p.replace('/uploads', '') }))`
- Upload response should include `url` field: `/uploads/{path}`
- Caddy production config: add `handle /uploads/* { root * /var/www/wordbase/api/data/uploads; file_server }` to blog.norvyn.com block

### [S2-3] Add .gitignore for uploads
- Add `data/uploads/*` and `!data/uploads/.gitkeep` to `packages/api/.gitignore`

## Summary

**Files to be created:**
- `packages/api/src/services/media.service.ts` — Service layer for media CRUD
- `packages/api/src/routes/media.ts` — REST API routes
- `packages/api/data/uploads/.gitkeep` — Placeholder for uploads directory

**Files to be modified:**
- `packages/api/src/app.ts` — Add media router mount
- `packages/api/src/mcp/tools.ts` — Add media MCP tools

**Total tasks:** 7 (including 1 directory creation)

---
## Verification
- **Verdict:** Approved
- **Date:** 2026-03-21
- **Note:** 4 revisions applied (count query, Buffer safety, static serving, gitignore)