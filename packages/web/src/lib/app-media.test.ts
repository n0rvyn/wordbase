import { describe, expect, it } from 'vitest';
import { editorialMedia, promotionalMedia } from './app';
import { shouldPlayPromo } from './promotional-playback';

describe('curated app promotional media', () => {
  it('accepts deliberate local or HTTPS media without requiring Apple metadata', () => {
    expect(editorialMedia(JSON.stringify({ video: '/uploads/demo.mp4', videoPoster: 'https://cdn.example.com/poster.jpg', i18n: { en: { name: 'Example' } } }))).toEqual({ video: '/uploads/demo.mp4', poster: 'https://cdn.example.com/poster.jpg' });
  });
  it('does not turn malformed or unsafe media values into playable URLs', () => {
    for (const video of ['javascript:alert(1)', 'data:video/mp4;base64,AAAA', '//other.example/video.mp4', '/\\other.example/demo.mp4', 'http://insecure.example/video.mp4', { url: '/demo.mp4' }]) {
      expect(editorialMedia(JSON.stringify({ video })).video).toBeNull();
    }
    expect(editorialMedia('{broken')).toEqual({ video: null, poster: null });
    expect(editorialMedia(null)).toEqual({ video: null, poster: null });
  });
});

describe('promotional-media selection and playback policy', () => {
  it('selects an explicit animated image and preserves its still poster', () => {
    expect(promotionalMedia(JSON.stringify({ promotionalMedia: { type: 'animated-image', src: '/uploads/demo.gif', poster: '/uploads/still.png', alt: 'Drawing a character' } })))
      .toEqual({ type: 'animated-image', src: '/uploads/demo.gif', poster: '/uploads/still.png', alt: 'Drawing a character' });
    expect(promotionalMedia(JSON.stringify({ promotionalMedia: { type: 'animated-image', src: '/uploads/demo.gif' } }))).toBeNull();
  });
  it('uses explicit static images or videos ahead of legacy video metadata', () => {
    expect(promotionalMedia(JSON.stringify({ promotionalMedia: { type: 'image', src: '/uploads/still.png' }, video: '/old.mp4' }))?.type).toBe('image');
    expect(promotionalMedia(JSON.stringify({ video: '/old.mp4' }))?.src).toBe('/old.mp4');
    expect(promotionalMedia(JSON.stringify({ promotionalMedia: { type: 'none' }, video: '/old.mp4' }))).toBeNull();
    expect(promotionalMedia(JSON.stringify({ promotionalMedia: { type: 'video', src: 'https://user:secret@example.com/file.mp4' } }))).toBeNull();
  });
  const normal = { visible: true, pageVisible: true, modalBlocked: false, reducedMotion: false, saveData: false };
  it('autoplays only while visible in the foreground with no covering modal', () => {
    expect(shouldPlayPromo(normal)).toBe(true);
    for (const changed of [{ visible: false }, { pageVisible: false }, { modalBlocked: true }, { reducedMotion: true }, { saveData: true }, { manual: 'pause' as const }]) expect(shouldPlayPromo({ ...normal, ...changed })).toBe(false);
  });
  it('permits explicit play with reduced motion, but never offscreen or behind another view', () => {
    expect(shouldPlayPromo({ ...normal, reducedMotion: true, saveData: true, manual: 'play' })).toBe(true);
    expect(shouldPlayPromo({ ...normal, visible: false, manual: 'play' })).toBe(false);
    expect(shouldPlayPromo({ ...normal, pageVisible: false, manual: 'play' })).toBe(false);
  });
});
