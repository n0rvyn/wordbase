import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/index.js';
import { pages } from '../db/schema.js';
import {
  createPage,
  updatePage,
  publishPage,
  getPage,
} from '../services/page.service.js';

beforeEach(async () => {
  await db.delete(pages);
});

describe('page.service — slug generation (准确)', () => {
  it('create: derives an ASCII slug from the title', async () => {
    const p = await createPage({ title: 'Privacy Policy', content: 'x' });
    expect(p.slug).toBe('privacy-policy');
  });

  it('create: dedupes a duplicate title to -2 instead of throwing a UNIQUE error', async () => {
    await createPage({ title: 'Privacy Policy', content: 'x' });
    // Before the fix this throws SqliteError UNIQUE constraint failed: pages.slug.
    const p2 = await createPage({ title: 'Privacy Policy', content: 'y' });
    expect(p2.slug).toBe('privacy-policy-2');
  });

  it('create: normalizes an explicitly-provided messy slug', async () => {
    const p = await createPage({ title: 't', content: 'x', slug: 'My Slug!' });
    expect(p.slug).toBe('my-slug');
  });

  it('update: re-saving the same slug is self-excluded (not bumped to -2)', async () => {
    const p = await createPage({ title: 'Privacy Policy', content: 'x' }); // privacy-policy
    const updated = await updatePage(p.id, { slug: 'privacy-policy' });
    expect(updated?.slug).toBe('privacy-policy');
  });
});

describe('page.service — publishedAt (准确)', () => {
  it('create draft: publishedAt is null', async () => {
    const p = await createPage({ title: 't', content: 'x' });
    expect(p.publishedAt).toBeNull();
  });

  it('create published: publishedAt is stamped', async () => {
    const p = await createPage({ title: 't', content: 'x', status: 'published' });
    expect(typeof p.publishedAt).toBe('number');
  });

  it('update to published preserves the first publish date (COALESCE)', async () => {
    const p = await createPage({ title: 't', content: 'x', status: 'published' });
    const t0 = p.publishedAt;
    expect(typeof t0).toBe('number');
    const updated = await updatePage(p.id, { status: 'published', title: 'edited' });
    expect(updated?.publishedAt).toBe(t0);
  });

  it('publishPage stamps publishedAt and sets status', async () => {
    const p = await createPage({ title: 't', content: 'x' }); // draft, publishedAt null
    const published = await publishPage(p.id);
    expect(published?.status).toBe('published');
    expect(typeof published?.publishedAt).toBe('number');
  });

  it('create: stores a valid JSON object string for meta unchanged', async () => {
    const p = await createPage({ title: 't', content: 'x', meta: '{"appId":"delphi"}' });
    expect(p.meta).toBe('{"appId":"delphi"}');
    const fetched = await getPage(p.id);
    expect(fetched?.meta).toBe('{"appId":"delphi"}');
  });
});
