import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/index.js';
import { posts, postCategories, postTags } from '../db/schema.js';
import { createPost, updatePost } from '../services/post.service.js';

beforeEach(async () => {
  await db.delete(postCategories);
  await db.delete(postTags);
  await db.delete(posts);
});

describe('post slug generation — create', () => {
  it('dedupes pinyin collisions and preserves a unique manual slug', async () => {
    const a = await createPost({ title: '内容', content: 'x' });
    const b = await createPost({ title: '内容', content: 'x' });
    expect(a.slug).toBe('nei-rong');
    expect(b.slug).toBe('nei-rong-2');

    // A manually-typed slug that collides is also bumped.
    const c = await createPost({ title: '其他', content: 'x', slug: 'nei-rong' });
    expect(c.slug).toBe('nei-rong-3');

    // A unique manual (English) slug is preserved verbatim.
    const d = await createPost({ title: '随便', content: 'x', slug: 'unique-en' });
    expect(d.slug).toBe('unique-en');
  });

  it('normalizes a manually-typed CJK slug to pinyin (never reaches URL as CJK)', async () => {
    const p = await createPost({ title: 'whatever', content: 'x', slug: '中文别名' });
    expect(p.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(p.slug).not.toMatch(/[一-鿿]/);
  });
});

describe('post slug generation — update', () => {
  it('re-saving the same slug is not bumped (self-excluded)', async () => {
    const a = await createPost({ title: '内容', content: 'x' }); // nei-rong
    const updated = await updatePost(a.id, { slug: '内容' });
    expect(updated.slug).toBe('nei-rong');
  });

  it('an explicit slug colliding with ANOTHER post is deduped', async () => {
    const a = await createPost({ title: '内容', content: 'x' }); // nei-rong
    await createPost({ title: '内容', content: 'x' });           // nei-rong-2
    const updated = await updatePost(a.id, { slug: 'nei-rong-2' });
    expect(updated.slug).toBe('nei-rong-2-2');
  });

  it('a title-only edit leaves the slug untouched', async () => {
    const a = await createPost({ title: '内容', content: 'x' }); // nei-rong
    const updated = await updatePost(a.id, { title: '新的标题' });
    expect(updated.slug).toBe('nei-rong');
  });

  it('an explicit CJK slug on update is normalized to pinyin', async () => {
    const a = await createPost({ title: 'hello', content: 'x' });
    const updated = await updatePost(a.id, { slug: '内容工业' });
    expect(updated.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(updated.slug).not.toMatch(/[一-鿿]/);
  });
});
