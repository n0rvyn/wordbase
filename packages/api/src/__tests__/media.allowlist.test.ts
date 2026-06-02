import { describe, it, expect, afterAll } from 'vitest';
import { rm } from 'fs/promises';
import { join } from 'path';
import { uploadMedia, getUploadsDir } from '../services/media.service.js';

function fakeFile(name: string, type: string, bytes = 4) {
  const buf = Buffer.alloc(bytes, 0);
  return { name, size: buf.length, type, arrayBuffer: async () => buf.buffer as ArrayBuffer };
}

const createdPaths: string[] = [];

afterAll(async () => {
  for (const p of createdPaths) {
    try { await rm(join(getUploadsDir(), p)); } catch { /* best effort */ }
  }
});

describe('media upload allow-list', () => {
  it('rejects a disallowed extension (.exe)', async () => {
    await expect(uploadMedia({ file: fakeFile('payload.exe', 'application/octet-stream') }))
      .rejects.toThrow(/Unsupported file extension/i);
  });

  it('rejects SVG (script-carrying image kept off the allow-list)', async () => {
    await expect(uploadMedia({ file: fakeFile('logo.svg', 'image/svg+xml') }))
      .rejects.toThrow(/Unsupported file extension/i);
  });

  it('rejects an allowed extension paired with a forbidden MIME', async () => {
    await expect(uploadMedia({ file: fakeFile('photo.png', 'text/html') }))
      .rejects.toThrow(/Unsupported MIME type/i);
  });

  it('rejects a path-traversal-styled name (extension sanitized to a disallowed value)', async () => {
    await expect(uploadMedia({ file: fakeFile('x.jpg/../../../../etc/passwd', 'image/jpeg') }))
      .rejects.toThrow(/Unsupported file extension/i);
  });

  it('accepts an allowed image (png) and stores a sanitized .png path', async () => {
    const rec = await uploadMedia({ file: fakeFile('photo.png', 'image/png') });
    createdPaths.push(rec.path);
    expect(rec).toHaveProperty('url');
    expect(rec.path).toMatch(/\.png$/);
  });

  it('accepts allowed audio (mp3)', async () => {
    const rec = await uploadMedia({ file: fakeFile('clip.mp3', 'audio/mpeg') });
    createdPaths.push(rec.path);
    expect(rec).toHaveProperty('url');
    expect(rec.path).toMatch(/\.mp3$/);
  });

  // MCP tools (blog_upload_media / podcast_upload_audio) pass a caller-supplied
  // filename that may lack an extension — the extension must be derived from the
  // (validated) MIME so these uploads are NOT regressed by the allow-list.
  it('derives the extension from MIME when the filename has none (image)', async () => {
    const rec = await uploadMedia({ file: fakeFile('screenshot', 'image/png') });
    createdPaths.push(rec.path);
    expect(rec.path).toMatch(/\.png$/);
  });

  it('derives .mp3 from audio/mpeg for an extension-less audio name', async () => {
    const rec = await uploadMedia({ file: fakeFile('episode-1', 'audio/mpeg') });
    createdPaths.push(rec.path);
    expect(rec.path).toMatch(/\.mp3$/);
  });

  it('still rejects an extension-less file whose MIME is not allowed', async () => {
    await expect(uploadMedia({ file: fakeFile('blob', 'application/octet-stream') }))
      .rejects.toThrow(/Unsupported MIME type/i);
  });
});
