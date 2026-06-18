import { describe, it, expect, afterEach } from 'vitest';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { posts, postTags, tags, postCategories, categories } from '../db/schema.js';
import {
  listTagsWithCounts,
  tagUsedByPublished,
  createTag,
} from '../services/tag.service.js';
import {
  listCategoriesWithCounts,
  categoryUsedByPublished,
  createCategory,
} from '../services/category.service.js';
import { createPost, updatePost } from '../services/post.service.js';

// Service helper single tests — counts + usedByPublished + CJK slug.
// These are written FIRST so they fail until Task 1-impl adds the helpers
// and fixes createCategory's slugify.
//
// afterEach clears the 5 tables resetNewTables() doesn't cover (plan MUST-FIX-1):
// postTags, postCategories, posts, tags, categories. Junction ON DELETE CASCADE
// would handle them if we deleted posts first, but junctions aren't FK'd to
// posts alone, so explicit ordering keeps counts from drifting across tests.

afterEach(async () => {
  await db.delete(postTags);
  await db.delete(postCategories);
  await db.delete(posts);
  await db.delete(tags);
  await db.delete(categories);
});

describe('listTagsWithCounts', () => {
  it('reports postCount for tags attached to posts', async () => {
    const tag = await createTag({ name: 'typescript' });
    const other = await createTag({ name: 'unused' });

    const now = Math.floor(Date.now() / 1000);
    // 2 posts that reference `tag`
    for (let i = 0; i < 2; i++) {
      const post = await createPost({ title: `P${i}`, content: 'b' });
      await db.insert(postTags).values({ postId: post.id, tagId: tag.id });
      // touch updatedAt to silence the linter; createdAt is set inside createPost
      void now;
    }

    const result = await listTagsWithCounts();
    const tagRow = result.find(r => r.id === tag.id);
    const otherRow = result.find(r => r.id === other.id);

    expect(tagRow).toBeDefined();
    expect(tagRow?.postCount).toBe(2);
    expect(otherRow?.postCount).toBe(0);
  });

  it('returns zero for a tag with no posts attached', async () => {
    const tag = await createTag({ name: 'lonely' });
    const result = await listTagsWithCounts();
    const row = result.find(r => r.id === tag.id);
    expect(row?.postCount).toBe(0);
  });
});

describe('listCategoriesWithCounts', () => {
  it('reports postCount for categories attached to posts', async () => {
    const cat = await createCategory({ name: 'essays' });
    const other = await createCategory({ name: 'empty' });

    for (let i = 0; i < 2; i++) {
      const post = await createPost({ title: `P${i}`, content: 'b' });
      await db.insert(postCategories).values({ postId: post.id, categoryId: cat.id });
    }

    const result = await listCategoriesWithCounts();
    const catRow = result.find(r => r.id === cat.id);
    const otherRow = result.find(r => r.id === other.id);

    expect(catRow?.postCount).toBe(2);
    expect(otherRow?.postCount).toBe(0);
  });
});

describe('tagUsedByPublished', () => {
  it('is true when the tag is attached to a published post', async () => {
    const tag = await createTag({ name: 'live' });
    const post = await createPost({ title: 'P', content: 'b', status: 'published' });
    await db.insert(postTags).values({ postId: post.id, tagId: tag.id });

    expect(await tagUsedByPublished(tag.id)).toBe(true);
  });

  it('is false when only attached to draft posts', async () => {
    const tag = await createTag({ name: 'wip' });
    const post = await createPost({ title: 'P', content: 'b', status: 'draft' });
    await db.insert(postTags).values({ postId: post.id, tagId: tag.id });

    expect(await tagUsedByPublished(tag.id)).toBe(false);
  });

  it('is false when the tag is not attached to any post', async () => {
    const tag = await createTag({ name: 'orphan' });
    expect(await tagUsedByPublished(tag.id)).toBe(false);
  });

  it('flips to false after the post is unpublished (draft)', async () => {
    const tag = await createTag({ name: 'flip' });
    const post = await createPost({ title: 'P', content: 'b', status: 'published' });
    await db.insert(postTags).values({ postId: post.id, tagId: tag.id });
    expect(await tagUsedByPublished(tag.id)).toBe(true);

    await updatePost(post.id, { status: 'draft' });
    expect(await tagUsedByPublished(tag.id)).toBe(false);
  });
});

describe('categoryUsedByPublished', () => {
  it('is true when the category is attached to a published post', async () => {
    const cat = await createCategory({ name: 'live-cat' });
    const post = await createPost({ title: 'P', content: 'b', status: 'published' });
    await db.insert(postCategories).values({ postId: post.id, categoryId: cat.id });

    expect(await categoryUsedByPublished(cat.id)).toBe(true);
  });

  it('is false when only attached to draft posts', async () => {
    const cat = await createCategory({ name: 'wip-cat' });
    const post = await createPost({ title: 'P', content: 'b', status: 'draft' });
    await db.insert(postCategories).values({ postId: post.id, categoryId: cat.id });

    expect(await categoryUsedByPublished(cat.id)).toBe(false);
  });

  it('is false when the category is not attached to any post', async () => {
    const cat = await createCategory({ name: 'orphan-cat' });
    expect(await categoryUsedByPublished(cat.id)).toBe(false);
  });
});

describe('createCategory CJK slug (DP-005)', () => {
  it('produces a non-empty slug for a Chinese category name', async () => {
    const cat = await createCategory({ name: '技术随笔' });
    expect(cat.slug).toBeTruthy();
    expect(cat.slug.length).toBeGreaterThan(0);
  });

  it('two distinct Chinese category names do not collapse onto the same empty slug', async () => {
    const a = await createCategory({ name: '技术随笔' });
    const b = await createCategory({ name: '生活' });
    // The bug: old ASCII-only slugify turned both into '' and they collided on the
    // UNIQUE slug constraint. The fix must produce distinct non-empty slugs.
    expect(a.slug).toBeTruthy();
    expect(b.slug).toBeTruthy();
    expect(a.slug).not.toBe(b.slug);
    expect(a.id).not.toBe(b.id);
  });
});