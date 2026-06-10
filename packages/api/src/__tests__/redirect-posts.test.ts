import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { db } from '../db/index.js';
import { posts, postCategories, postTags, redirects } from '../db/schema.js';
import { redirectMiddleware } from '../middleware/redirect.js';
import { createPost } from '../services/post.service.js';
import { createRedirect } from '../services/redirect.service.js';

beforeEach(async () => {
  await db.delete(postCategories);
  await db.delete(postTags);
  await db.delete(posts);
  await db.delete(redirects);
});

// Bare app: no /posts/* route (mirrors prod, where Caddy serves those statically).
// The middleware either 301s or falls through to a 404.
function buildApp() {
  const app = new Hono();
  app.use('*', redirectMiddleware);
  return app;
}

describe('redirectMiddleware — /posts/* L2 (id) + L3 (legacy slug)', () => {
  it('L2: /posts/<id> 301s to the post canonical slug', async () => {
    const p = await createPost({ title: 'hello world', content: 'x' }); // slug: hello-world
    const res = await buildApp().request(`/posts/${p.id}`);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`/posts/${p.slug}`);
  });

  it('L3: an old slug recorded in redirects 301s to the new slug', async () => {
    const p = await createPost({ title: 'hello world', content: 'x' });
    await createRedirect({ fromPath: '/posts/jiu-cjk', toPath: `/posts/${p.slug}` });
    const res = await buildApp().request('/posts/jiu-cjk');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`/posts/${p.slug}`);
  });

  it('L3: a percent-encoded CJK old path matches its decoded redirect row', async () => {
    const p = await createPost({ title: 'hello world', content: 'x' });
    await createRedirect({ fromPath: '/posts/内容旧', toPath: `/posts/${p.slug}` });
    const res = await buildApp().request(`/posts/${encodeURIComponent('内容旧')}`);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`/posts/${p.slug}`);
  });

  it('the canonical slug is left alone (no redirect loop)', async () => {
    const p = await createPost({ title: 'hello world', content: 'x' });
    const res = await buildApp().request(`/posts/${p.slug}`);
    expect(res.status).not.toBe(301);
  });

  it('an unknown post path falls through (not a redirect, never -> /)', async () => {
    const res = await buildApp().request('/posts/does-not-exist');
    expect(res.status).not.toBe(301);
    expect(res.headers.get('location')).not.toBe('/');
  });

  it('legacy ?p=ID still redirects to home (unchanged)', async () => {
    const res = await buildApp().request('/?p=5');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/');
  });
});
