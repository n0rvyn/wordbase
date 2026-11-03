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

import { renderSiteOgImage, appOgCacheKey, balancedOgLines } from './og-image';
import { Resvg } from '@resvg/resvg-js';
describe('square-safe first-party social artwork', () => {
  it('keeps all key artwork inside the central square of the wide site card', async () => {
    const png = await renderSiteOgImage();
    expect(pngDimensions(png)).toEqual({width:1200,height:630});
    const image = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><image width="1200" height="630" href="data:image/png;base64,${png.toString('base64')}"/></svg>`).render();
    const pixels = image.pixels;
    let left=1200,right=0,top=630,bottom=0;
    for(let y=0;y<630;y++) for(let x=0;x<1200;x++) {
      const i=(y*1200+x)*4;
      if(Math.abs(pixels[i]-242)+Math.abs(pixels[i+1]-240)+Math.abs(pixels[i+2]-233)>20) { left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y); }
    }
    expect(left).toBeGreaterThanOrEqual(285);expect(right).toBeLessThan(915);
    expect(top).toBeGreaterThan(20);expect(bottom).toBeLessThan(610);
    expect(right-left).toBeGreaterThan(200);
    expect(pngDimensions(await renderSiteOgImage(true))).toEqual({width:600,height:600});
  });
  it('uses the actual app platform in rendering and the content cache identity', async () => {
    const input={name:'Nearly',tagline:'Photo editing in your browser.',iconUrl:null};
    expect(appOgCacheKey({...input,platform:'Web'})).not.toBe(appOgCacheKey({...input,platform:'iOS'}));
    const web=await renderAppOgImage({...input,platform:'Web'});
    const ios=await renderAppOgImage({...input,platform:'iOS'});
    expect(web.equals(ios)).toBe(false);
  });
});

it('balances CJK headlines without a single-character last line and retains English word boundaries', () => {
  const title = '我最近在做的几个小东西';
  const lines = balancedOgLines(title);
  expect(lines.join('')).toBe(title);
  expect(Math.max(...lines.map(line => line.length)) - Math.min(...lines.map(line => line.length))).toBeLessThanOrEqual(1);
  expect(balancedOgLines('Notes on making useful things').join(' ')).toBe('Notes on making useful things');
  expect(balancedOgLines('很长的文章标题'.repeat(30)).length).toBeLessThanOrEqual(4);
});
