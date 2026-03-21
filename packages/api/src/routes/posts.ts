import { Hono } from 'hono';
import { authMiddleware } from '../middleware/index.js';
import * as postService from '../services/post.service.js';
import type { AppEnv } from '../types.js';

export const postsRouter = new Hono<AppEnv>();

// Public routes
postsRouter.get('/', async (c) => {
  const { status, category, tag, page, limit, search } = c.req.query();
  const result = await postService.listPosts({
    status,
    category,
    tag,
    page: page ? parseInt(page) : undefined,
    limit: limit ? parseInt(limit) : undefined,
    search,
  });
  return c.json(result);
});

postsRouter.get('/:idOrSlug', async (c) => {
  const post = await postService.getPost(c.req.param('idOrSlug'));
  if (!post) return c.json({ error: { code: 'NOT_FOUND', message: 'Post not found' } }, 404);
  return c.json(post);
});

// Authenticated routes
postsRouter.post('/', authMiddleware, async (c) => {
  const body = await c.req.json();
  const post = await postService.createPost(body);
  return c.json(post, 201);
});

postsRouter.put('/:id', authMiddleware, async (c) => {
  const body = await c.req.json();
  const post = await postService.updatePost(c.req.param('id'), body);
  if (!post) return c.json({ error: { code: 'NOT_FOUND', message: 'Post not found' } }, 404);
  return c.json(post);
});

postsRouter.delete('/:id', authMiddleware, async (c) => {
  const post = await postService.deletePost(c.req.param('id'));
  if (!post) return c.json({ error: { code: 'NOT_FOUND', message: 'Post not found' } }, 404);
  return c.json({ success: true });
});

postsRouter.post('/:id/publish', authMiddleware, async (c) => {
  const post = await postService.publishPost(c.req.param('id'));
  if (!post) return c.json({ error: { code: 'NOT_FOUND', message: 'Post not found' } }, 404);
  return c.json(post);
});

postsRouter.post('/:id/archive', authMiddleware, async (c) => {
  const post = await postService.archivePost(c.req.param('id'));
  if (!post) return c.json({ error: { code: 'NOT_FOUND', message: 'Post not found' } }, 404);
  return c.json(post);
});
