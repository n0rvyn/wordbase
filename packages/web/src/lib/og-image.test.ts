import { describe, it, expect } from 'vitest';

import { renderPostOgImage, renderAppOgImage } from './og-image.js';

// PNG signature: 89 50 4E 47 0D 0A 1A 0A
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Read the IHDR width/height (big-endian u32 at byte offsets 16 and 20). */
function pngDimensions(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('renderPostOgImage', () => {
  it('returns a non-empty PNG buffer for a Chinese title', async () => {
    const buf = await renderPostOgImage({
      title: '开发日志6: 像治病一样修 Bug',
      dateLabel: '2026-06-14',
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('emits valid PNG magic bytes', async () => {
    const buf = await renderPostOgImage({ title: '测试标题', dateLabel: '2026-06-14' });
    expect(buf.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it('renders at exactly 1200x630', async () => {
    const buf = await renderPostOgImage({
      title: '从做一个 AI 跑步教练开始',
      dateLabel: '2026-06-14',
    });
    const { width, height } = pngDimensions(buf);
    expect(width).toBe(1200);
    expect(height).toBe(630);
  });

  it('handles a long title without throwing (wraps/clamps)', async () => {
    const long = '这是一个非常非常非常长的标题用来测试自动换行和截断逻辑是否会在画布范围内正确处理而不会溢出或抛错'.repeat(2);
    const buf = await renderPostOgImage({ title: long, dateLabel: '2026-06-14' });
    const { width, height } = pngDimensions(buf);
    expect(width).toBe(1200);
    expect(height).toBe(630);
  });
});

describe('renderAppOgImage', () => {
  // iconUrl: null exercises the text-only path — no network fetch in tests.
  it('returns a valid 1200x630 PNG (text-only, no icon)', async () => {
    const buf = await renderAppOgImage({ name: 'Delphi - 认识你自己', tagline: '记录点滴，让思想生根发芽。', iconUrl: null });
    expect(buf.subarray(0, 8)).toEqual(PNG_MAGIC);
    const { width, height } = pngDimensions(buf);
    expect(width).toBe(1200);
    expect(height).toBe(630);
  });

  it('renders without a tagline (single hero line)', async () => {
    const buf = await renderAppOgImage({ name: 'Cashie', tagline: '', iconUrl: null });
    const { width, height } = pngDimensions(buf);
    expect(width).toBe(1200);
    expect(height).toBe(630);
  });

  it('degrades to text-only when the icon URL is unreachable', async () => {
    const buf = await renderAppOgImage({ name: '测试 App', tagline: '一句话标语', iconUrl: 'https://invalid.invalid/nope.png' });
    expect(buf.subarray(0, 8)).toEqual(PNG_MAGIC);
    const { width } = pngDimensions(buf);
    expect(width).toBe(1200);
  });
});
