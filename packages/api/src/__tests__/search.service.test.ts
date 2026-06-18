import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/index.js';
import { posts, postCategories, categories } from '../db/schema.js';
import { searchPosts } from '../services/search.service.js';
import { createPost, updatePost, deletePost } from '../services/post.service.js';
import { createCategory } from '../services/category.service.js';

beforeEach(async () => {
  // Clean in FK-safe order; the `posts` table is the source of truth for search.
  await db.delete(postCategories);
  await db.delete(posts);
  await db.delete(categories);
});

describe('search.service — 2-字中文命中 (DP-001=B 核心验收)', () => {
  it('hits a published post whose title/content contains the 2-char term', async () => {
    const p1 = await createPost({ title: '向量数据库入门', content: '本文讲向量检索。', status: 'published' });
    const p2 = await createPost({ title: '播客制作心得', content: '录制与剪辑。', status: 'published' });

    const hits = await searchPosts('向量');
    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe(p1.id);
    expect(hits[0].title).toBe('向量数据库入门');

    // 另一篇不应被命中
    const hits2 = await searchPosts('播客');
    expect(hits2.length).toBe(1);
    expect(hits2[0].id).toBe(p2.id);
  });
});

describe('search.service — SearchHit 字段形状', () => {
  it('returns id, slug, title, snippet, publishedAt, category on each hit', async () => {
    const cat = await createCategory({ name: '技术', slug: 'tech' });
    const p = await createPost({
      title: '向量索引的取舍',
      content: '本文讨论向量索引在不同规模下的取舍。',
      status: 'published',
      categoryIds: [cat.id],
    });

    const hits = await searchPosts('向量');
    expect(hits.length).toBe(1);
    const h = hits[0];
    expect(h.id).toBe(p.id);
    expect(h.slug).toBe(p.slug);
    expect(h.title).toBe('向量索引的取舍');
    expect(typeof h.snippet).toBe('string');
    expect(h.snippet.length).toBeGreaterThan(0);
    expect(typeof h.publishedAt).toBe('number');
    expect(h.category).toBe('技术');
  });
});

describe('search.service — 草稿不出', () => {
  it('does not return a draft even if it contains the term', async () => {
    await createPost({ title: '向量随笔', content: 'draft body 含向量', status: 'draft' });
    const hits = await searchPosts('向量');
    expect(hits).toEqual([]);
  });
});

describe('search.service — 标题命中优先', () => {
  it('title-hit posts are ranked above body-only hits', async () => {
    // A: term only in body (older published date)
    const a = await createPost({
      title: '数据库笔记',
      content: '这里讨论向量索引。',
      status: 'published',
    });
    // Make sure A's publishedAt is earlier by sleeping slightly isn't reliable;
    // we instead rely on the explicit ORDER BY titleHit DESC.
    // B: term only in title (newer)
    const b = await createPost({
      title: '向量检索实战',
      content: '完全不相关的内容。',
      status: 'published',
    });

    const hits = await searchPosts('向量');
    expect(hits.map((h) => h.id)).toEqual([b.id, a.id]);
  });
});

describe('search.service — 空输入安全', () => {
  it('empty string returns [] without throwing', async () => {
    await createPost({ title: '向量', content: 'x', status: 'published' });
    const hits = await searchPosts('');
    expect(hits).toEqual([]);
  });

  it('whitespace-only string returns [] without throwing', async () => {
    await createPost({ title: '向量', content: 'x', status: 'published' });
    const hits = await searchPosts('   ');
    expect(hits).toEqual([]);
  });
});

describe('search.service — LIKE 元字符安全', () => {
  it('does not treat % as a wildcard', async () => {
    // Seed a post whose body contains the literal "100%"
    const p = await createPost({
      title: '折扣说明',
      content: '全场 100% 退款保证。',
      status: 'published',
    });
    // 诱饵:含 "100 元",若 % 被当通配符会被误匹配 — 必须不中
    await createPost({
      title: '满减活动',
      content: '满 100 元减 10 元。',
      status: 'published',
    });
    // Should match ONLY the literal "100%" post, not the decoy
    const hits = await searchPosts('100%');
    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe(p.id);
  });

  it('does not treat _ as a wildcard', async () => {
    // Seed a post with literal underscore in body
    const p = await createPost({
      title: '命名规范',
      content: 'Python 中 foo_bar 是常见命名。',
      status: 'published',
    });
    const hits = await searchPosts('foo_bar');
    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe(p.id);
  });
});

describe('search.service — 增改删生效', () => {
  it('create: a freshly published post containing the term is immediately findable', async () => {
    const p = await createPost({ title: '向量基础', content: '介绍向量。', status: 'published' });
    const hits = await searchPosts('向量');
    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe(p.id);
    // Basic persistence sanity
    const refetched = await searchPosts('基础');
    expect(refetched.length).toBe(1);
    expect(refetched[0].id).toBe(p.id);
  });

  it('update: changing the title to remove the term makes it unfindable', async () => {
    const p = await createPost({ title: '向量基础', content: '正文。', status: 'published' });
    expect((await searchPosts('向量')).length).toBe(1);
    await updatePost(p.id, { title: '完全不同的标题' });
    expect(await searchPosts('向量')).toEqual([]);
  });

  it('delete: a deleted post is no longer findable', async () => {
    const p = await createPost({ title: '向量专题', content: '正文。', status: 'published' });
    expect((await searchPosts('向量')).length).toBe(1);
    await deletePost(p.id);
    expect(await searchPosts('向量')).toEqual([]);
  });
});
