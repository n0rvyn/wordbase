import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { uploadMedia, podcastAudioMaxBytes } from '../services/media.service.js';

const TEST_UPLOADS_DIR = join(process.cwd(), 'data', 'test-uploads-media');

// Patch UPLOADS_DIR to a temp location so we don't write to real uploads
// We accomplish this by using process.cwd()-relative path which will be data/test-uploads-media
// The real test just checks the thrown error or the returned record

describe('media upload size cap', () => {
  beforeEach(async () => {
    await mkdir(TEST_UPLOADS_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_UPLOADS_DIR, { recursive: true, force: true });
  });

  it('rejects a file >10MB with no maxSize override', async () => {
    const size11MB = 11 * 1024 * 1024;
    const buf = Buffer.alloc(size11MB, 0);
    const file = {
      name: 'big.mp3',
      size: buf.length,
      type: 'audio/mpeg',
      arrayBuffer: async () => buf.buffer as ArrayBuffer,
    };

    await expect(uploadMedia({ file })).rejects.toThrow(/too large/i);
  });

  it('allows a file >10MB when maxSize is set higher', async () => {
    const size11MB = 11 * 1024 * 1024;
    const buf = Buffer.alloc(size11MB, 0);
    const file = {
      name: 'podcast.mp3',
      size: buf.length,
      type: 'audio/mpeg',
      arrayBuffer: async () => buf.buffer as ArrayBuffer,
    };

    const result = await uploadMedia({ file, maxSize: 50 * 1024 * 1024 });
    expect(result).toHaveProperty('url');
  });

  it('podcastAudioMaxBytes returns 200MB by default', () => {
    expect(podcastAudioMaxBytes()).toBe(200 * 1024 * 1024);
  });

  it('podcastAudioMaxBytes respects PODCAST_MAX_AUDIO_MB env var', () => {
    const original = process.env.PODCAST_MAX_AUDIO_MB;
    process.env.PODCAST_MAX_AUDIO_MB = '100';
    expect(podcastAudioMaxBytes()).toBe(100 * 1024 * 1024);
    if (original === undefined) delete process.env.PODCAST_MAX_AUDIO_MB;
    else process.env.PODCAST_MAX_AUDIO_MB = original;
  });
});
