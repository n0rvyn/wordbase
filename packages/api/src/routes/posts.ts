import { Hono } from 'hono';
import { authMiddleware, requireScope } from '../middleware/index.js';
import * as postService from '../services/post.service.js';
import { triggerBuild } from '../services/build.service.js';
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
postsRouter.post('/', authMiddleware, requireScope('posts:write'), async (c) => {
  const body = await c.req.json();
  const post = await postService.createPost(body);
  // A post created directly in the published state must regenerate the static site.
  if (post.status === 'published') triggerBuild();
  return c.json(post, 201);
});

postsRouter.put('/:id', authMiddleware, requireScope('posts:write'), async (c) => {
  const body = await c.req.json();
  const before = await postService.getPost(c.req.param('id'));
  const post = await postService.updatePost(c.req.param('id'), body);
  if (!post) return c.json({ error: { code: 'NOT_FOUND', message: 'Post not found' } }, 404);
  // Rebuild whenever the change touches the public site: the post is (still)
  // published, OR it was published and is now being unpublished/archived (so the
  // static site drops it). Plain draft edits skip the 30s+ rebuild.
  if (post.status === 'published' || before?.status === 'published') triggerBuild();
  return c.json(post);
});

postsRouter.delete('/:id', authMiddleware, requireScope('posts:write'), async (c) => {
  const before = await postService.getPost(c.req.param('id'));
  const post = await postService.deletePost(c.req.param('id'));
  if (!post) return c.json({ error: { code: 'NOT_FOUND', message: 'Post not found' } }, 404);
  // Deleting a published post must remove it from the static site.
  if (before?.status === 'published') triggerBuild();
  return c.json({ success: true });
});

postsRouter.post('/:id/publish', authMiddleware, requireScope('posts:write'), async (c) => {
  const post = await postService.publishPost(c.req.param('id'));
  if (!post) return c.json({ error: { code: 'NOT_FOUND', message: 'Post not found' } }, 404);
  triggerBuild();
  return c.json(post);
});

postsRouter.post('/:id/archive', authMiddleware, requireScope('posts:write'), async (c) => {
  const before = await postService.getPost(c.req.param('id'));
  const post = await postService.archivePost(c.req.param('id'));
  if (!post) return c.json({ error: { code: 'NOT_FOUND', message: 'Post not found' } }, 404);
  // Archiving a published post removes it from the public site.
  if (before?.status === 'published') triggerBuild();
  return c.json(post);
});
