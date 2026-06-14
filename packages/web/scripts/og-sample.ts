// Sample-render script (look-review checkpoint for the per-article OG feature).
// Renders the latest published posts' OG cards to packages/web/og-samples/<slug>.png
// using the SAME renderer the build endpoint uses. Output is gitignored.
//
// Run from packages/web:
//   node scripts/og-sample.ts                      (uses API_URL || localhost:4100)
//   API_URL=https://norvyn.com node scripts/og-sample.ts
import fs from 'node:fs';
import { renderPostOgImage, fmtDateUTC } from '../src/lib/og-image.ts';

const API = process.env.API_URL || 'http://localhost:4100';
const OUT_DIR = new URL('../og-samples/', import.meta.url);

interface SamplePost {
  slug: string;
  title: string;
  publishedAt: number;
}

// Offline fallback so the look can be reviewed even with no API reachable.
const FALLBACK: SamplePost[] = [
  { slug: 'kai-fa-ri-zhi-6-xiang-zhi-bing-yi-yang-xiu-bug', title: '开发日志6: 像治病一样修 Bug', publishedAt: 1781424808 },
  { slug: 'kai-fa-ri-zhi-5-cong-zuo-yi-ge-ai-pao-bu-jiao', title: '开发日志5: 从做一个 AI 跑步教练开始', publishedAt: 1781250000 },
  { slug: 'kai-fa-ri-zhi-4-zuo-bo-ke-gei-zi-ji-ting', title: '开发日志4: 做播客给自己听', publishedAt: 1781000000 },
];

async function getPosts(): Promise<SamplePost[]> {
  try {
    const r = await fetch(`${API}/api/posts?status=published&limit=6`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d: any = await r.json();
    return d.data.map((p: any) => ({
      slug: p.slug,
      title: p.title,
      publishedAt: p.publishedAt ?? p.createdAt,
    }));
  } catch (e: any) {
    console.warn(`[og-sample] API ${API} unreachable (${e.message}); using fallback titles`);
    return FALLBACK;
  }
}

const posts = await getPosts();
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const p of posts) {
  const png = await renderPostOgImage({ title: p.title, dateLabel: fmtDateUTC(p.publishedAt) });
  const out = new URL(`${p.slug}.png`, OUT_DIR);
  fs.writeFileSync(out, png);
  console.log(`wrote ${out.pathname}  (${(png.length / 1024).toFixed(0)} KB)  ${p.title}`);
}
console.log(`\n${posts.length} sample card(s) in packages/web/og-samples/`);
