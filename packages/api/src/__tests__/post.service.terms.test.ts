import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/index.js';
import { posts, postCategories, postTags, categories, tags } from '../db/schema.js';
import { createPost } from '../services/post.service.js';
import { createTag } from '../services/tag.service.js';
import { createCategory } from '../services/category.service.js';
// NOTE: getPostWithTerms does not exist yet — this import will fail at compile time.
// That is the expected red gate; Task 3-impl adds the service function.
import { getPostWithTerms } from '../services/post.service.js';

beforeEach(async () => {
  // FK-safe order: junction tables before parents.
  await db.delete(postCategories);
  await db.delete(postTags);
  await db.delete(posts);
  await db.delete(categories);
  await db.delete(tags);
});

describe('post service — getPostWithTerms joins tags and categories', () => {
  it('returns post + tags + categories for a post with 2 tags and 1 category', async () => {
    const tag1 = await createTag({ name: 'TypeScript' });
    const tag2 = await createTag({ name: 'Drizzle' });
    const cat = await createCategory({ name: 'Tech', slug: 'tech' });

    const post = await createPost({
      title: 'Hello',
      content: 'world',
      tagIds: [tag1.id, tag2.id],
      categoryIds: [cat.id],
    });

    const result = await getPostWithTerms(post.id);
    expect(result).not.toBeNull();
    // Original post fields preserved.
    expect(result?.id).toBe(post.id);
    expect(result?.title).toBe('Hello');
    expect(result?.content).toBe('world');
    // tags: 2 entries, each with id/slug/name.
    expect(result?.tags).toHaveLength(2);
    const tagNames = result?.tags.map(t => t.name).sort();
    expect(tagNames).toEqual(['Drizzle', 'TypeScript']);
    expect(result?.tags[0]).toHaveProperty('id');
    expect(result?.tags[0]).toHaveProperty('slug');
    expect(result?.tags[0]).toHaveProperty('name');
    // categories: 1 entry, each with id/slug/name.
    expect(result?.categories).toHaveLength(1);
    expect(result?.categories[0].id).toBe(cat.id);
    expect(result?.categories[0].slug).toBe('tech');
    expect(result?.categories[0].name).toBe('Tech');
  });

  it('returns empty arrays for a post with no tags or categories', async () => {
    const post = await createPost({ title: 'Lonely', content: 'no terms' });
    const result = await getPostWithTerms(post.id);
    expect(result).not.toBeNull();
    expect(result?.tags).toEqual([]);
    expect(result?.categories).toEqual([]);
  });

  it('returns null for a non-existent id', async () => {
    const result = await getPostWithTerms('does-not-exist');
    expect(result).toBeNull();
  });

  it('also resolves by slug (idOrSlug contract)', async () => {
    const cat = await createCategory({ name: 'Misc', slug: 'misc' });
    const post = await createPost({
      title: 'FindBySlug',
      content: 'body',
      categoryIds: [cat.id],
    });

    const byId = await getPostWithTerms(post.id);
    const bySlug = await getPostWithTerms(post.slug);
    expect(bySlug).not.toBeNull();
    expect(bySlug?.id).toBe(post.id);
    expect(bySlug?.categories).toHaveLength(1);
    expect(byId?.id).toBe(bySlug?.id);
  });
});