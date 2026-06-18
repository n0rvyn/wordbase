import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { posts, postCategories, postTags } from '../db/schema.js';
import { createPost, publishPost, getPost } from '../services/post.service.js';

beforeEach(async () => {
  await db.delete(postCategories);
  await db.delete(postTags);
  await db.delete(posts);
});

describe('post service — publishPost preserves already-set publishedAt', () => {
  it('draft first publish: status becomes published and publishedAt is stamped to a number', async () => {
    const draft = await createPost({ title: 'Draft', content: 'body', status: 'draft' });
    expect(draft.status).toBe('draft');
    expect(draft.publishedAt).toBeNull();

    const published = await publishPost(draft.id);
    expect(published?.status).toBe('published');
    expect(typeof published?.publishedAt).toBe('number');
    expect(published?.publishedAt).toBeGreaterThan(0);
  });

  it('re-publishing a post with an already-set publishedAt keeps the original date (COALESCE)', async () => {
    const original = 1_600_000_000; // fixed historical epoch (pre-2021)
    const draft = await createPost({ title: 'Imported', content: 'body', status: 'draft' });
    // Stamp a fixed historical publishedAt directly (cannot use updatePost because
    // it stamps `now` on status=published in the same second, making a clobber
    // gate indistinguishable from a preserved value).
    await db.update(posts).set({ publishedAt: original }).where(eq(posts.id, draft.id));

    const before = await getPost(draft.id);
    expect(before?.publishedAt).toBe(original);

    const published = await publishPost(draft.id);
    expect(published?.status).toBe('published');
    // Critical assertion: publishedAt is NOT overwritten with `now`.
    expect(published?.publishedAt).toBe(original);
  });
});