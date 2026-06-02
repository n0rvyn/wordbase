import { Hono } from 'hono';
import { authMiddleware, validateBearerToken, requireScope, hasScope } from '../middleware/index.js';
import * as commentService from '../services/comment.service.js';
import type { AppEnv } from '../types.js';

export const commentsRouter = new Hono<AppEnv>();

// GET /posts/:postId/comments - List comments
// Public (no status or status=approved): approved only
// With ?status=pending/spam/trash: requires valid auth
commentsRouter.get('/posts/:postId/comments', async (c) => {
  const postId = c.req.param('postId');
  const { status, page, limit } = c.req.query();

  if (status && status !== 'approved') {
    const auth = await validateBearerToken(c.req.header('Authorization'));
    if (!auth) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required to view non-approved comments' } }, 401);
    }
    if (!hasScope(auth.permissions, 'comments:read')) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'API key lacks required scope: comments:read' } }, 403);
    }
  }

  const result = await commentService.listComments(postId, {
    status: status || 'approved',
    page: page ? parseInt(page) : undefined,
    limit: limit ? parseInt(limit) : undefined,
  });
  return c.json(result);
});

// POST /posts/:postId/comments - Submit comment (public, no auth)
commentsRouter.post('/posts/:postId/comments', async (c) => {
  const postId = c.req.param('postId');
  const body = await c.req.json();

  if (!body.author_name || !body.content) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'author_name and content are required' } }, 400);
  }

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
      return c.json({ error: { code: 'NOT_FOUND', message } }, 404);
    }
    if (message === 'Parent comment not found') {
      return c.json({ error: { code: 'NOT_FOUND', message } }, 404);
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message } }, 500);
  }
});

// POST /comments/:id/approve - Approve comment (auth required)
commentsRouter.post('/comments/:id/approve', authMiddleware, requireScope('comments:write'), async (c) => {
  const comment = await commentService.updateCommentStatus(c.req.param('id'), 'approved');
  if (!comment) return c.json({ error: { code: 'NOT_FOUND', message: 'Comment not found' } }, 404);
  return c.json(comment);
});

// POST /comments/:id/spam - Mark as spam (auth required)
commentsRouter.post('/comments/:id/spam', authMiddleware, requireScope('comments:write'), async (c) => {
  const comment = await commentService.updateCommentStatus(c.req.param('id'), 'spam');
  if (!comment) return c.json({ error: { code: 'NOT_FOUND', message: 'Comment not found' } }, 404);
  return c.json(comment);
});

// PUT /comments/:id - Edit comment (auth required)
commentsRouter.put('/comments/:id', authMiddleware, requireScope('comments:write'), async (c) => {
  const body = await c.req.json();
  if (body.status) {
    const comment = await commentService.updateCommentStatus(c.req.param('id'), body.status);
    if (!comment) return c.json({ error: { code: 'NOT_FOUND', message: 'Comment not found' } }, 404);
    return c.json(comment);
  }
  return c.json({ error: { code: 'BAD_REQUEST', message: 'No update fields provided' } }, 400);
});

// DELETE /comments/:id - Delete comment (auth required)
commentsRouter.delete('/comments/:id', authMiddleware, requireScope('comments:write'), async (c) => {
  const deleted = await commentService.deleteComment(c.req.param('id'));
  if (!deleted) return c.json({ error: { code: 'NOT_FOUND', message: 'Comment not found' } }, 404);
  return c.json({ success: true });
});
