import { describe, it, expect, beforeEach } from 'vitest';
import { resetNewTables } from './helpers.js';
import { createPodcast } from '../services/podcast.service.js';
import {
  createEpisode,
  listEpisodes,
  getEpisode,
  upsertEpisodeByExternal,
  publishEpisode,
  deleteEpisode,
} from '../services/episode.service.js';

beforeEach(resetNewTables);

describe('episode service', () => {
  it('createEpisode without audioUrl throws', async () => {
    const show = await createPodcast({ title: 'Test Show' });
    await expect(
      createEpisode(show.id, { title: 'Episode 1', audioUrl: '' })
    ).rejects.toThrow();
  });

  it('createEpisode with audioUrl returns row with defaults', async () => {
    const show = await createPodcast({ title: 'Test Show 2' });
    const ep = await createEpisode(show.id, {
      title: 'First Episode',
      audioUrl: '/uploads/ep1.mp3',
    });
    expect(ep.id).toBeTruthy();
    expect(ep.guid).toBeTruthy();
    expect(ep.audioType).toBe('audio/mpeg');
    expect(ep.episodeType).toBe('full');
    expect(ep.status).toBe('draft');
    expect(ep.slug).toBeTruthy();
  });

  it('upsertEpisodeByExternal with same externalId yields one row with latest title', async () => {
    const show = await createPodcast({ title: 'Test Show 3' });
    const r1 = await upsertEpisodeByExternal(show.id, {
      externalSource: 'adam',
      externalId: 'ep-abc',
      title: 'Original Title',
      audioUrl: '/uploads/ep.mp3',
    });
    expect(r1.created).toBe(true);

    const r2 = await upsertEpisodeByExternal(show.id, {
      externalSource: 'adam',
      externalId: 'ep-abc',
      title: 'Updated Title',
      audioUrl: '/uploads/ep.mp3',
    });
    expect(r2.created).toBe(false);

    const list = await listEpisodes(show.id);
    expect(list.data.length).toBe(1);
    expect(list.data[0].title).toBe('Updated Title');
  });

  it('upsertEpisodeByExternal with empty externalId throws', async () => {
    const show = await createPodcast({ title: 'Test Show 4' });
    await expect(
      upsertEpisodeByExternal(show.id, {
        externalSource: 'adam',
        externalId: '',
        title: 'Bad Episode',
        audioUrl: '/uploads/ep.mp3',
      })
    ).rejects.toThrow();
  });

  it('publishEpisode sets status=published and numeric publishedAt', async () => {
    const show = await createPodcast({ title: 'Test Show 5' });
    const ep = await createEpisode(show.id, {
      title: 'To Publish Ep',
      audioUrl: '/uploads/ep.mp3',
    });
    const published = await publishEpisode(ep.id);
    expect(published?.status).toBe('published');
    expect(typeof published?.publishedAt).toBe('number');
  });

  it('publishEpisode preserves an already-set publishedAt (imported original date)', async () => {
    const show = await createPodcast({ title: 'Test Show 5b' });
    const original = 1_600_000_000; // a fixed historical epoch
    const ep = await createEpisode(show.id, {
      title: 'Imported Ep',
      audioUrl: '/uploads/ep.mp3',
      publishedAt: original,
    });
    expect(ep.publishedAt).toBe(original);
    const published = await publishEpisode(ep.id);
    expect(published?.status).toBe('published');
    expect(published?.publishedAt).toBe(original); // not overwritten with now()
  });

  it('getEpisode finds by id and by slug', async () => {
    const show = await createPodcast({ title: 'Test Show 6' });
    const ep = await createEpisode(show.id, {
      title: 'Find Me Episode',
      audioUrl: '/uploads/ep.mp3',
    });
    const byId = await getEpisode(ep.id);
    expect(byId?.id).toBe(ep.id);

    const bySlug = await getEpisode(ep.slug);
    expect(bySlug?.id).toBe(ep.id);
  });

  it('deleteEpisode removes the row', async () => {
    const show = await createPodcast({ title: 'Test Show 7' });
    const ep = await createEpisode(show.id, {
      title: 'Delete Me Episode',
      audioUrl: '/uploads/ep.mp3',
    });
    await deleteEpisode(ep.id);
    const found = await getEpisode(ep.id);
    expect(found).toBeNull();
  });
});
