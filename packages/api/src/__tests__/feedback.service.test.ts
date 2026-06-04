import { describe, it, expect, beforeEach } from 'vitest';
import { resetNewTables } from './helpers.js';
import { createPodcast } from '../services/podcast.service.js';
import { createEpisode } from '../services/episode.service.js';
import {
  createFeedback,
  listFeedbackByEpisode,
  listFeedbackSince,
} from '../services/feedback.service.js';

beforeEach(resetNewTables);

async function makeEpisode() {
  const show = await createPodcast({ title: 'FB Show' });
  const ep = await createEpisode(show.id, {
    title: 'FB Ep',
    audioUrl: '/uploads/ep.mp3',
  });
  return ep;
}

describe('feedback service', () => {
  it('createFeedback with valid category+reaction returns a persisted row', async () => {
    const ep = await makeEpisode();
    const row = await createFeedback(ep.id, {
      category: 'repetitive',
      reaction: 'down',
    });
    expect(row.id).toBeTruthy();
    expect(typeof row.createdAt).toBe('number');
    expect(row.episodeId).toBe(ep.id);
    expect(row.category).toBe('repetitive');
    expect(row.reaction).toBe('down');
  });

  it('createFeedback with invalid category throws', async () => {
    const ep = await makeEpisode();
    await expect(
      createFeedback(ep.id, { category: 'lol', reaction: 'down' })
    ).rejects.toThrow();
  });

  it('createFeedback with invalid reaction throws', async () => {
    const ep = await makeEpisode();
    await expect(
      createFeedback(ep.id, { category: 'great', reaction: 'meh' })
    ).rejects.toThrow();
  });

  it('createFeedback with missing category throws', async () => {
    const ep = await makeEpisode();
    // @ts-expect-error -- intentionally missing required category
    await expect(createFeedback(ep.id, { reaction: 'up' })).rejects.toThrow();
  });

  it('createFeedback with reaction omitted succeeds and reaction===null', async () => {
    const ep = await makeEpisode();
    const row = await createFeedback(ep.id, { category: 'other' });
    expect(row.category).toBe('other');
    expect(row.reaction).toBeNull();
  });

  it('createFeedback for non-existent episodeId throws', async () => {
    await expect(
      createFeedback('does-not-exist', { category: 'great' })
    ).rejects.toThrow();
  });

  it('append-only: two submits with different category from same ip → 2 rows', async () => {
    const ep = await makeEpisode();
    await createFeedback(ep.id, { category: 'great', reaction: 'up', ipAddress: '1.1.1.1' });
    await createFeedback(ep.id, { category: 'boring', reaction: 'down', ipAddress: '1.1.1.1' });
    const list = await listFeedbackByEpisode(ep.id, { page: 1, limit: 50 });
    expect(list.data.length).toBe(2);
  });

  it('dedup: identical submit (same ip, category, reaction, no note) within window → 1 row', async () => {
    const ep = await makeEpisode();
    const a = await createFeedback(ep.id, {
      category: 'boring', reaction: 'down', ipAddress: '2.2.2.2',
    });
    const b = await createFeedback(ep.id, {
      category: 'boring', reaction: 'down', ipAddress: '2.2.2.2',
    });
    expect(b.id).toBe(a.id);
    const list = await listFeedbackByEpisode(ep.id, { page: 1, limit: 50 });
    expect(list.data.length).toBe(1);
  });

  it('dedup null-reaction: two null-reaction submits same ip+category+note-less → 1 row', async () => {
    const ep = await makeEpisode();
    const a = await createFeedback(ep.id, { category: 'other', ipAddress: '3.3.3.3' });
    const b = await createFeedback(ep.id, { category: 'other', ipAddress: '3.3.3.3' });
    expect(b.id).toBe(a.id);
    const list = await listFeedbackByEpisode(ep.id, { page: 1, limit: 50 });
    expect(list.data.length).toBe(1);
  });

  it('dedup bypass: identical submit with non-empty note → 2 rows', async () => {
    const ep = await makeEpisode();
    await createFeedback(ep.id, {
      category: 'boring', reaction: 'down', ipAddress: '4.4.4.4', note: 'first',
    });
    await createFeedback(ep.id, {
      category: 'boring', reaction: 'down', ipAddress: '4.4.4.4', note: 'second',
    });
    const list = await listFeedbackByEpisode(ep.id, { page: 1, limit: 50 });
    expect(list.data.length).toBe(2);
  });

  it('createFeedback caps note at 200 chars and listener at 100 chars', async () => {
    const ep = await makeEpisode();
    const row = await createFeedback(ep.id, {
      category: 'disagree',
      reaction: 'down',
      note: 'x'.repeat(250),
      listener: 'y'.repeat(150),
    });
    expect(row.note?.length).toBe(200);
    expect(row.listener?.length).toBe(100);
  });

  it('listFeedbackSince treats a NaN since (non-numeric query) as no filter, not a broken bind', async () => {
    const ep = await makeEpisode();
    await createFeedback(ep.id, { category: 'great' });
    // Route passes parseInt('abc') === NaN; the service must not push gte(col, NaN).
    const rows = await listFeedbackSince(Number.NaN, {});
    expect(rows.length).toBe(1);
  });

  it('listFeedbackSince(ts) returns rows with createdAt >= ts, newest first', async () => {
    const ep = await makeEpisode();
    const older = await createFeedback(ep.id, { category: 'great' });
    // Force a gap so the second row's createdAt is strictly newer.
    await new Promise((r) => setTimeout(r, 1100));
    const newer = await createFeedback(ep.id, { category: 'boring' });
    const sinceTs = older.createdAt + 1;
    const rows = await listFeedbackSince(sinceTs, {});
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(newer.id);
  });
});
