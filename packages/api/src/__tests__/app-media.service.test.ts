import { describe, expect, it } from 'vitest';
import { AppMediaError, mergePromotionalMedia } from '../services/app-media.service.js';

const video = { type: 'video', id: 'p_video', src: '/uploads/promo.mp4', poster: '/uploads/still.jpg', width: 720, height: 1280, label: 'Overview' };
const gif = { type: 'animated-image', id: 'p_gif', src: '/uploads/promo.gif', poster: '/uploads/gif-still.jpg', width: 1200, height: 675, label: 'v1.1' };
describe('ordered app promos', () => {
  it('preserves editorial and Apple copy while replacing only the promo gallery', () => {
    const meta = { i18n: { en: { name: 'English name' } }, editorialI18n: { en: { tagline: 'Manual copy' } }, video: '/legacy.mp4', custom: { keep: true } };
    const result = JSON.parse(mergePromotionalMedia(JSON.stringify(meta), { items: [video, gif] })!);
    expect(result).toEqual({ i18n: meta.i18n, editorialI18n: meta.editorialI18n, custom: meta.custom, promotionalMedia: { items: [video, gif] } });
    expect(JSON.parse(mergePromotionalMedia(JSON.stringify(result), { type: 'none' })!)).toEqual({ i18n: meta.i18n, editorialI18n: meta.editorialI18n, custom: meta.custom });
  });
  it('rejects an entire invalid gallery before mutating existing metadata', () => {
    for (const value of [
      { items: [] }, { items: Array.from({ length: 13 }, (_, i) => ({ ...video, src: `/uploads/${i}.mp4` })) },
      { items: [video, video] }, { items: [video, { ...gif, id: video.id }] },
      { items: [video, { ...gif, poster: undefined }] }, { items: [video, { ...gif, src: 'javascript:alert(1)' }] },
      { items: [video, { ...gif, width: 0 }] }, { items: [video], type: 'video' }, { type: 'none', src: '/unwanted.mp4' },
    ]) expect(() => mergePromotionalMedia('{"keep":true}', value)).toThrow(AppMediaError);
  });
  it('keeps legacy single-item callers compatible', () => {
    expect(JSON.parse(mergePromotionalMedia(null, video)!)).toEqual({ promotionalMedia: video });
  });
});
