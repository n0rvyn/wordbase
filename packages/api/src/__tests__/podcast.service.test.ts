import { describe, it, expect, beforeEach } from 'vitest';
import { resetNewTables } from './helpers.js';
import {
  createPodcast,
  getPodcast,
  listPodcasts,
  updatePodcast,
  publishPodcast,
  deletePodcast,
} from '../services/podcast.service.js';

beforeEach(resetNewTables);

describe('podcast show service', () => {
  it('createPodcast returns a row with slug, language=zh-CN, status=draft', async () => {
    const show = await createPodcast({ title: '每日综合播客', ownerEmail: 'test@example.com' });
    expect(show.id).toBeTruthy();
    expect(show.slug).toBeTruthy();
    expect(show.language).toBe('zh-CN');
    expect(show.status).toBe('draft');
  });

  it('getPodcast finds by id', async () => {
    const show = await createPodcast({ title: 'Show A' });
    const found = await getPodcast(show.id);
    expect(found?.id).toBe(show.id);
  });

  it('getPodcast finds by slug', async () => {
    const show = await createPodcast({ title: 'Show Slug Test' });
    const found = await getPodcast(show.slug);
    expect(found?.id).toBe(show.id);
  });

  it('updatePodcast changes a field', async () => {
    const show = await createPodcast({ title: 'Original Title' });
    const updated = await updatePodcast(show.id, { title: 'Updated Title' });
    expect(updated?.title).toBe('Updated Title');
  });

  it('createPodcast persists appleUrl + spotifyUrl', async () => {
    const show = await createPodcast({
      title: 'Links Show',
      appleUrl: 'https://podcasts.apple.com/cn/podcast/x/id123',
      spotifyUrl: 'https://open.spotify.com/show/abc',
    });
    expect(show.appleUrl).toBe('https://podcasts.apple.com/cn/podcast/x/id123');
    expect(show.spotifyUrl).toBe('https://open.spotify.com/show/abc');
  });

  it('updatePodcast sets appleUrl without clearing spotifyUrl', async () => {
    const show = await createPodcast({ title: 'Partial', spotifyUrl: 'https://open.spotify.com/show/keep' });
    const updated = await updatePodcast(show.id, { appleUrl: 'https://podcasts.apple.com/cn/podcast/y/id456' });
    expect(updated!.appleUrl).toBe('https://podcasts.apple.com/cn/podcast/y/id456');
    expect(updated!.spotifyUrl).toBe('https://open.spotify.com/show/keep');
  });

  it('publishPodcast sets status to published', async () => {
    const show = await createPodcast({ title: 'To Publish' });
    const published = await publishPodcast(show.id);
    expect(published?.status).toBe('published');
  });

  it('listPodcasts filters by status', async () => {
    await createPodcast({ title: 'Draft Show' });
    const show2 = await createPodcast({ title: 'Published Show' });
    await publishPodcast(show2.id);

    const drafts = await listPodcasts({ status: 'draft' });
    expect(drafts.data.every((s) => s.status === 'draft')).toBe(true);

    const published = await listPodcasts({ status: 'published' });
    expect(published.data.some((s) => s.id === show2.id)).toBe(true);
  });

  it('deletePodcast removes the row', async () => {
    const show = await createPodcast({ title: 'To Delete' });
    await deletePodcast(show.id);
    const found = await getPodcast(show.id);
    expect(found).toBeNull();
  });
});
