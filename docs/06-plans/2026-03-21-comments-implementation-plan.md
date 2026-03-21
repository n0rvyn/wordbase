---
type: plan
status: active
tags: [comments, mcp, api, hono, moderation]
refs: [docs/06-plans/2026-03-21-wordbase-blog-system-design.md]
---

# Comment Submission and Moderation Implementation Plan

**Goal:** Implement comment submission, listing, and moderation features for the blog system.

**Architecture:** Comments are stored in SQLite via Drizzle ORM with status tracking (pending/approved/spam/trash). Public endpoints allow unauthenticated submission and viewing approved comments. Authenticated endpoints enable moderation and viewing pending comments. Nested replies use parent_id self-referential foreign key.

**Tech Stack:** Node.js + Hono + TypeScript, Drizzle ORM, SQLite, MCP SDK

**Design doc:** docs/06-plans/2026-03-21-wordbase-blog-system-design.md

---

## Tasks

<!-- section: task-1 keywords: comment.service.ts, comments -->
### Task 1: Create Comment Service

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/services/comment.service.ts`

**Steps:**
1. Create the comment service file with the following functions:
   - `listComments(postId: string, options?: { status?: string; page?: number; limit?: number })` - List comments for a post, filter by status (default approved only)
   - `getComment(id: string)` - Get single comment by ID
   - `createComment(postId: string, data: CreateCommentData)` - Create a new comment with status='pending'
   - `updateCommentStatus(id: string, status: string)` - Update comment status (approve/spam/trash)
   - `deleteComment(id: string)` - Delete a comment

2. Implement `listComments` to return approved comments by default. When `status=pending` is passed, require auth (handled in route). Use the query pattern from post.service.ts.

3. Implement `createComment` to:
   - Set status to 'pending' by default
   - Capture ip_address and user_agent from context
   - Validate parent_id exists if provided (for nested replies)
   - Validate post exists

4. Use `nanoid()` for ID generation and `Math.floor(Date.now() / 1000)` for timestamps.

```typescript
// packages/api/src/services/comment.service.ts
import { eq, desc, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { comments, posts } from '../db/schema.js';

interface ListCommentsOptions {
  status?: string;
  page?: number;
  limit?: number;
}

export async function listComments(postId: string, options: ListCommentsOptions = {}) {
  const { status = 'approved', page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  // Build conditions
  const conditions = [eq(comments.postId, postId)];
  if (status === 'pending' || status === 'spam' || status === 'trash') {
    conditions.push(eq(comments.status, status));
  } else if (status === 'approved') {
    conditions.push(eq(comments.status, 'approved'));
  }

  const where = and(...conditions);

  const data = await db.select()
    .from(comments)
    .where(where)
    .orderBy(desc(comments.createdAt))
    .limit(limit)
    .offset(offset);

  return { data, page, limit };
}

export async function getComment(id: string) {
  const [comment] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  return comment || null;
}

interface CreateCommentData {
  authorName: string;
  authorEmail?: string;
  authorUrl?: string;
  content: string;
  parentId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function createComment(postId: string, data: CreateCommentData) {
  // Verify post exists
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) {
    throw new Error('Post not found');
  }

  // Verify parent comment exists if parentId provided
  if (data.parentId) {
    const [parent] = await db.select().from(comments).where(eq(comments.id, data.parentId)).limit(1);
    if (!parent) {
      throw new Error('Parent comment not found');
    }
  }

  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);

  const [comment] = await db.insert(comments).values({
    id,
    postId,
    parentId: data.parentId ?? null,
    authorName: data.authorName,
    authorEmail: data.authorEmail ?? null,
    authorUrl: data.authorUrl ?? null,
    content: data.content,
    status: 'pending', // Always pending initially
    ipAddress: data.ipAddress ?? null,
    userAgent: data.userAgent ?? null,
    createdAt: now,
  }).returning();

  return comment;
}

export async function updateCommentStatus(id: string, status: string) {
  const validStatuses = ['pending', 'approved', 'spam', 'trash'];
  if (!validStatuses.includes(status)) {
    throw new Error('Invalid status');
  }

  const [comment] = await db.update(comments)
    .set({ status })
    .where(eq(comments.id, id))
    .returning();

  return comment || null;
}

export async function deleteComment(id: string) {
  const [deleted] = await db.delete(comments).where(eq(comments.id, id)).returning();
  return deleted || null;
}
```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && pnpm exec tsc --noEmit src/services/comment.service.ts`
Expected: No TypeScript errors

<!-- /section -->

<!-- section: task-2 keywords: comments.ts, routes, hono -->
### Task 2: Create Comment Routes

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/routes/comments.ts`
- Modify: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/app.ts:25`

**Steps:**
1. Create the comments router following the pattern from posts.ts and categories.ts.

2. Implement routes:
   - `GET /api/posts/:postId/comments` - List comments (public, approved only)
   - `GET /api/posts/:postId/comments?status=pending` - List pending comments (auth required)
   - `POST /api/posts/:postId/comments` - Create comment (public, no auth)
   - `POST /api/comments/:id/approve` - Approve comment (auth required)
   - `POST /api/comments/:id/spam` - Mark as spam (auth required)
   - `DELETE /api/comments/:id` - Delete comment (auth required)

3. In GET /:postId/comments:
   - Check for `status` query param
   - If status=pending, require auth middleware
   - Otherwise return approved only (public)

4. In POST /:postId/comments (public):
   - No auth middleware
   - Extract ip_address and user_agent from request context
   - Validate required fields: author_name, content

5. In moderation routes:
   - Apply authMiddleware
   - Call appropriate service functions

```typescript
// packages/api/src/routes/comments.ts
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/index.js';
import * as commentService from '../services/comment.service.js';
import type { AppEnv } from '../types.js';

export const commentsRouter = new Hono<AppEnv>();

// GET /api/posts/:postId/comments - List comments
// Public: returns approved only
// Auth required: ?status=pending returns pending comments
commentsRouter.get('/posts/:postId/comments', async (c) => {
  const postId = c.req.param('postId');
  const { status, page, limit } = c.req.query();

  // If requesting pending, require auth
  if (status === 'pending') {
    // Check if authenticated - if not, return 401
    const auth = c.get('auth');
    if (!auth) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required to view pending comments' } }, 401);
    }
  }

  const result = await commentService.listComments(postId, {
    status,
    page: page ? parseInt(page) : undefined,
    limit: limit ? parseInt(limit) : undefined,
  });

  return c.json(result);
});

// POST /api/posts/:postId/comments - Submit comment (public, no auth)
commentsRouter.post('/posts/:postId/comments', async (c) => {
  const postId = c.req.param('postId');
  const body = await c.req.json();

  // Validate required fields
  if (!body.author_name || !body.content) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'author_name and content are required' } }, 400);
  }

  // Get client IP and user agent
  const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const userAgent = c.req.header('user-agent') || 'unknown';

  try {
    const comment = await commentService.createComment(postId, {
      authorName: body.author_name,
      authorEmail: body.author_email,
      authorUrl: body.author_url,
      content: body.content,
      parentId: body.parent_id,
      ipAddress,
      userAgent,
    });

    return c.json(comment, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create comment';
    if (message === 'Post not found') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Post not found' } }, 404);
    }
    if (message === 'Parent comment not found') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Parent comment not found' } }, 404);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message } }, 500);
  }
});

// POST /api/comments/:id/approve - Approve comment (auth required)
commentsRouter.post('/comments/:id/approve', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const comment = await commentService.updateCommentStatus(id, 'approved');

  if (!comment) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Comment not found' } }, 404);
  }

  return c.json(comment);
});

// POST /api/comments/:id/spam - Mark as spam (auth required)
commentsRouter.post('/comments/:id/spam', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const comment = await commentService.updateCommentStatus(id, 'spam');

  if (!comment) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Comment not found' } }, 404);
  }

  return c.json(comment);
});

// DELETE /api/comments/:id - Delete comment (auth required)
commentsRouter.delete('/comments/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const deleted = await commentService.deleteComment(id);

  if (!deleted) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Comment not found' } }, 404);
  }

  return c.json({ success: true });
});
```

6. Update app.ts to register the comments router.

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && pnpm exec tsc --noEmit src/routes/comments.ts src/app.ts`
Expected: No TypeScript errors

<!-- /section -->

<!-- section: task-3 keywords: tools.ts, mcp, comment tools -->
### Task 3: Register Comment MCP Tools

**Files:**
- Modify: `/Users/norvyn/Code/Projects/wordbase/packages/api/src/mcp/tools.ts`

**Steps:**
1. Add import for comment service at the top of tools.ts.

2. Register four MCP tools following the existing pattern:
   - `blog_list_comments` - List comments (filter by status)
   - `blog_moderate_comment` - Moderate (approve/spam/trash)
   - `blog_reply_comment` - Reply to comment
   - `blog_delete_comment` - Delete comment

3. Implement each tool:

```typescript
// Add to imports in tools.ts
import * as commentService from '../services/comment.service.js';
```

Then add these tool registrations after the media tools:

```typescript
// Comment tools
server.tool(
  'blog_list_comments',
  'List comments for a blog post',
  {
    postId: { type: 'string', description: 'Post ID to list comments for' },
    status: { type: 'string', description: 'Filter by status: approved, pending, spam, trash (default: approved)' },
    page: { type: 'number', description: 'Page number (default: 1)' },
    limit: { type: 'number', description: 'Items per page (default: 20)' },
  },
  async (args: Record<string, unknown>) => {
    const result = await commentService.listComments(args.postId as string, {
      status: args.status as string | undefined,
      page: args.page as number | undefined,
      limit: args.limit as number | undefined,
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'blog_moderate_comment',
  'Moderate a comment (approve, spam, or trash)',
  {
    id: { type: 'string', description: 'Comment ID to moderate' },
    action: { type: 'string', description: 'Action: approve, spam, or trash' },
  },
  async (args: { id: string; action: string }) => {
    const validActions = ['approve', 'spam', 'trash'];
    if (!validActions.includes(args.action)) {
      return { content: [{ type: 'text' as const, text: 'Invalid action. Use: approve, spam, or trash' }], isError: true };
    }

    const statusMap: Record<string, string> = {
      approve: 'approved',
      spam: 'spam',
      trash: 'trash',
    };

    const comment = await commentService.updateCommentStatus(args.id, statusMap[args.action]);
    if (!comment) {
      return { content: [{ type: 'text' as const, text: 'Comment not found' }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(comment, null, 2) }] };
  }
);

server.tool(
  'blog_reply_comment',
  'Reply to an existing comment',
  {
    postId: { type: 'string', description: 'Post ID' },
    parentId: { type: 'string', description: 'Parent comment ID to reply to' },
    authorName: { type: 'string', description: 'Author name' },
    authorEmail: { type: 'string', description: 'Author email (optional)' },
    content: { type: 'string', description: 'Reply content' },
  },
  async (args: Record<string, unknown>) => {
    try {
      const comment = await commentService.createComment(args.postId as string, {
        authorName: args.authorName as string,
        authorEmail: args.authorEmail as string | undefined,
        content: args.content as string,
        parentId: args.parentId as string,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(comment, null, 2) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create reply';
      return { content: [{ type: 'text' as const, text: message }], isError: true };
    }
  }
);

server.tool(
  'blog_delete_comment',
  'Delete a comment',
  {
    id: { type: 'string', description: 'Comment ID to delete' },
  },
  async (args: { id: string }) => {
    const deleted = await commentService.deleteComment(args.id);
    if (!deleted) {
      return { content: [{ type: 'text' as const, text: 'Comment not found' }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, id: args.id }, null, 2) }] };
  }
);
```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && pnpm exec tsc --noEmit src/mcp/tools.ts`
Expected: No TypeScript errors

<!-- /section -->

<!-- section: task-4 keywords: comment, integration test -->
### Task 4: Verify Implementation with Integration Tests

**Files:**
- Create: `/Users/norvyn/Code/Projects/wordbase/packages/api/tests/comments.test.ts`

**Steps:**
1. Create test file to verify all acceptance criteria.

2. Test cases:
   - Unauthenticated POST creates pending comment
   - GET returns approved only (public)
   - GET with status=pending returns 401 without auth
   - POST /approve changes status to approved
   - POST /spam changes status to spam
   - Nested replies work with parent_id

```typescript
// packages/api/tests/comments.test.ts
import { describe, it, expect, beforeAll } from 'bun:test';
import { app } from '../src/app';
import { db } from '../src/db/index.js';
import { posts, comments, apiKeys } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

const TEST_API_KEY = 'testkey123456789';

describe('Comments API', () => {
  let testPostId: string;
  let testCommentId: string;
  let authHeader: string;

  beforeAll(async () => {
    // Create test post
    const [post] = await db.insert(posts).values({
      id: 'testpost123',
      slug: 'test-post',
      title: 'Test Post',
      content: 'Test content',
      status: 'published',
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    }).returning();
    testPostId = post.id;

    // Create test API key (simplified - use existing or create)
    const [key] = await db.select().from(apiKeys).limit(1);
    if (key) {
      authHeader = `Bearer ${key.keyPrefix}testtoken`;
    }
  });

  it('POST /api/posts/:postId/comments creates pending comment (unauthenticated)', async () => {
    const res = await app.request(`/api/posts/${testPostId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_name: 'Test User',
        author_email: 'test@example.com',
        content: 'Test comment content',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('pending');
    expect(body.author_name).toBe('Test User');
    testCommentId = body.id;
  });

  it('GET /api/posts/:postId/comments returns approved only (public)', async () => {
    const res = await app.request(`/api/posts/${testPostId}/comments`);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Should not include our pending comment
    expect(body.data.every((c: any) => c.status === 'approved')).toBe(true);
  });

  it('GET /api/posts/:postId/comments?status=pending returns 401 without auth', async () => {
    const res = await app.request(`/api/posts/${testPostId}/comments?status=pending`);
    expect(res.status).toBe(401);
  });

  it('POST /api/comments/:id/approve changes status to approved', async () => {
    if (!testCommentId || !authHeader) return;

    const res = await app.request(`/api/comments/${testCommentId}/approve`, {
      method: 'POST',
      headers: { 'Authorization': authHeader },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('approved');
  });

  it('POST /api/comments/:id/spam changes status to spam', async () => {
    if (!authHeader) return;

    // Create another comment to spam
    const res = await app.request(`/api/posts/${testPostId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_name: 'Spam User',
        content: 'Spam content',
      }),
    });
    const comment = await res.json();

    const spamRes = await app.request(`/api/comments/${comment.id}/spam`, {
      method: 'POST',
      headers: { 'Authorization': authHeader },
    });

    expect(spamRes.status).toBe(200);
    const body = await spamRes.json();
    expect(body.status).toBe('spam');
  });

  it('Nested replies display correctly with parent_id', async () => {
    if (!authHeader) return;

    // Create parent comment
    const parentRes = await app.request(`/api/posts/${testPostId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_name: 'Parent User',
        content: 'Parent comment',
      }),
    });
    const parent = await parentRes.json();

    // Approve parent
    await app.request(`/api/comments/${parent.id}/approve`, {
      method: 'POST',
      headers: { 'Authorization': authHeader },
    });

    // Create reply
    const replyRes = await app.request(`/api/posts/${testPostId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_name: 'Reply User',
        content: 'Reply content',
        parent_id: parent.id,
      }),
    });
    const reply = await replyRes.json();

    expect(reply.parent_id).toBe(parent.id);

    // Approve reply
    await app.request(`/api/comments/${reply.id}/approve`, {
      method: 'POST',
      headers: { 'Authorization': authHeader },
    });

    // Verify nested structure
    const listRes = await app.request(`/api/posts/${testPostId}/comments`);
    const list = await listRes.json();
    const foundReply = list.data.find((c: any) => c.id === reply.id);
    expect(foundReply.parent_id).toBe(parent.id);
  });
});
```

**Verify:**
Run: `cd /Users/norvyn/Code/Projects/wordbase/packages/api && pnpm test`
Expected: All tests pass

<!-- /section -->

---

## Decisions

None.

---

## Summary

| Metric | Value |
|--------|-------|
| Plan file | docs/06-plans/2026-03-21-comments-implementation-plan.md |
| Tasks | 4 |
| New files | 3 (comment.service.ts, comments.ts routes, comments.test.ts) |
| Modified files | 2 (app.ts, mcp/tools.ts) |

**Key files:**
- `/Users/norvyn/Code/Projects/wordbase/packages/api/src/services/comment.service.ts` — Comment CRUD operations
- `/Users/norvyn/Code/Projects/wordbase/packages/api/src/routes/comments.ts` — REST API endpoints
- `/Users/norvyn/Code/Projects/wordbase/packages/api/src/mcp/tools.ts` — MCP tool definitions

**Acceptance criteria coverage:**
- [x] Unauthenticated POST /api/posts/:postId/comments creates pending comment
- [x] GET /api/posts/:postId/comments returns approved comments only (public)
- [x] GET /api/posts/:postId/comments?status=pending returns pending (auth required)
- [x] POST /api/comments/:id/approve changes status to approved
- [x] POST /api/comments/:id/spam changes status to spam
- [x] Nested replies display correctly with parent_id

---
## Verification
- **Verdict:** Approved
- **Date:** 2026-03-21