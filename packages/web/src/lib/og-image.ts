import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

// Bump when the card design changes — invalidates every cached image.
const OG_RENDERER_VERSION = '3';

// Build-time only: the CJK font is read once from disk (not shipped to the
// browser). Loaded at module scope so each render reuses the same buffer.
// Resolve robustly: import.meta.url works for vitest + direct node, but Vite
// rewrites it when it bundles the Astro endpoint, so fall back to a cwd-anchored
// path (astro build always runs with cwd = packages/web).
const FONT_REL = 'src/assets/fonts/NotoSansSC-Regular.ttf';
function loadFont(): Buffer {
  const candidates = [
    new URL('../assets/fonts/NotoSansSC-Regular.ttf', import.meta.url).pathname,
    path.resolve(process.cwd(), FONT_REL),
    path.resolve(process.cwd(), 'packages/web', FONT_REL),
  ];
  for (const p of candidates) {
    try {
      return fs.readFileSync(p);
    } catch {
      /* try next candidate */
    }
  }
  throw new Error(
    `og-image: CJK font not found. Tried:\n  ${candidates.join('\n  ')}`,
  );
}
const fontData = loadFont();

// Shared public palette. The central 600px is safe when a landscape card is
// cropped to a square; titles, app icons and the signature stay inside it.
const BG = '#f2f0e9';
const INK = '#20211e';
const MUTED = '#64685e';
const ACCENT = '#ff5b2d';

const WIDTH = 1200;
const HEIGHT = 630;

export interface OgImageInput {
  /** Post title — rendered as the hero text (data, not markup). */
  title: string;
  /** Pre-formatted date label, e.g. "2026-06-14". */
  dateLabel: string;
}

/** Unix seconds → "YYYY-MM-DD" in UTC. Shared by the OG endpoints + sample script. */
export function fmtDateUTC(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// satori takes an element tree; we build it as plain objects (no JSX runtime in
// this package). The argument is typed ReactNode and this project has Preact +
// no @types/react, so we cast to `any`. Do NOT "fix" the type by adding a JSX
// runtime — that would change the render. (pnpm build uses esbuild with no
// `astro check`, so a type error here would not fail the build anyway.)
function element(type: string, style: Record<string, unknown>, children: unknown): unknown {
  return { type, props: { style, children } };
}
function mark(size: number, accent = ACCENT): unknown {
  return { type: 'svg', props: { width: size, height: size, viewBox: '0 0 100 100', children:
    [[50,10,50,90],[10,50,90,50],[22,22,78,78],[22,78,78,22]].map(([x1,y1,x2,y2]) => ({ type:'line', props:{x1,y1,x2,y2,stroke:accent,strokeWidth:8,strokeLinecap:'round'} })) } };
}
function canvas(children: unknown[], width = WIDTH, height = HEIGHT): unknown {
  return element('div', { width, height, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', backgroundColor:BG, color:INK, fontFamily:'Noto Sans SC', padding:32 }, children);
}
function signature(accent = ACCENT): unknown {
  return element('div', { display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginTop:30, color:MUTED, fontSize:24 }, [element('div', {}, 'norvyn'), mark(18, accent)]);
}
/** Balance compact card headlines while keeping English words together. */
export function balancedOgLines(text: string, maxLines = 4): string[] {
  const units = (value: string) => [...value].reduce((sum, ch) => sum + (/\s/.test(ch) ? .3 : /[ilI.,'!|:;]/.test(ch) ? .3 : /[MW@#%]/.test(ch) ? .9 : /[A-Z]/.test(ch) ? .65 : /[a-z0-9]/.test(ch) ? .55 : 1), 0);
  const capacity = 10.4;
  const tokens = (text.trim().match(/[A-Za-z0-9][A-Za-z0-9_'-]*|\s+|[^\s]/gu) || []).flatMap(word => {
    if (units(word) <= capacity) return [word];
    const parts: string[] = []; let part = '';
    for (const ch of word) { if (part && units(part + ch) > capacity) { parts.push(part); part = ''; } part += ch; }
    return [...parts, part];
  });
  const count = Math.min(maxLines, Math.max(1, Math.ceil(units(text) / capacity)));
  const lines: string[] = [];
  for (let index = 0; index < count && tokens.length; index++) {
    while (tokens.length && !tokens[0].trim()) tokens.shift();
    const target = Math.min(capacity, units(tokens.join('')) / (count - index));
    let line = '';
    while (tokens.length) {
      const next = tokens[0]; const size = units(line); const withNext = units(line + next);
      if (line && withNext > capacity) break;
      if (line && withNext > target && Math.abs(target - size) <= Math.abs(target - withNext) && !/^[，。！？、；：）】》,.;:!?)]$/.test(next)) break;
      line += tokens.shift();
    }
    lines.push(line.trim());
  }
  if (tokens.some(token => token.trim())) lines[lines.length - 1] = lines[lines.length - 1].replace(/[\s，。,.]+$/u, '') + '…';
  return lines;
}
function card({ title, dateLabel }: OgImageInput): unknown {
  return canvas([
    element('div', { fontSize:21, color:MUTED, marginBottom:26 }, dateLabel),
    element('div', { display:'flex', flexDirection:'column', alignItems:'center', maxWidth:560, fontSize:52, lineHeight:1.25, textAlign:'center' }, balancedOgLines(title).map(line => element('div', { display:'block', maxWidth:560, whiteSpace:'nowrap' }, line))),
    signature(),
  ]);
}
/** A simple personal signature. No essential artwork lives outside the square crop. */
export async function renderSiteOgImage(square = false): Promise<Buffer> {
  const width = square ? 600 : WIDTH;
  const height = square ? 600 : HEIGHT;
  const tree = canvas([
    mark(64),
    element('div', { fontSize:118, lineHeight:1.2, letterSpacing:-7, marginTop:22, paddingRight:7 }, 'norvyn'),
    element('div', { fontSize:18, color:MUTED, letterSpacing:2, marginTop:20 }, 'norvyn.com'),
  ], width, height);
  const svg = await satori(tree as any, { width, height, fonts:[{ name:'Noto Sans SC', data:fontData, weight:400, style:'normal' }] });
  return Buffer.from(new Resvg(svg, { font:{loadSystemFonts:false} }).render().asPng());
}

// ── App OG card ──────────────────────────────────────────────────────────────
// Landscape app artwork with icon, name and actual platform in the square-safe
// center. It remains legible in messaging thumbnails and wide social cards.

// Bump when the app card design changes — invalidates the app cache only.
const APP_OG_RENDERER_VERSION = '3';

export interface AppOgInput {
  /** App name — the hero line (data, not markup). */
  name: string;
  /** Short tagline under the name; '' renders no second line. */
  tagline: string;
  /** Absolute App Store icon URL; null/unfetchable → text-only card. */
  iconUrl: string | null;
  /** Brand accent for the wordmark dot; defaults to the canonical token. */
  accentColor?: string | null;
  /** Actual app platform; Web and macOS must not be labeled iOS. */
  platform?: string | null;
}

/** Fetch an icon URL into a data URI for satori. Returns null on any failure
 *  (network, non-2xx, abort) so the card degrades to text-only, never throws. */
async function fetchIconDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type') || 'image/jpeg';
    if (buf.length > 5 * 1024 * 1024 || !mime.startsWith('image/')) return null;
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function appCard(name: string, tagline: string, iconDataUri: string | null, accent: string, platform: string | null | undefined): unknown {
  return canvas([
    iconDataUri ? { type:'img', props:{src:iconDataUri,width:96,height:96,style:{borderRadius:22}} } : mark(64, accent),
    element('div', { fontSize:18, color:MUTED, marginTop:18 }, platform === 'Web' ? 'WEB APP' : platform ? `${platform} APP` : 'APP'),
    element('div', { display:'block', maxWidth:560, fontSize:54, lineHeight:1.2, textAlign:'center', lineClamp:2, marginTop:18 }, name),
    ...(tagline ? [element('div', { display:'block', maxWidth:520, fontSize:23, lineHeight:1.45, color:MUTED, textAlign:'center', lineClamp:2, marginTop:14 }, tagline)] : []),
    signature(accent),
  ]);
}

/** Render an app's OG card to a 1200×630 PNG buffer. Fetches the icon (best-effort). */
export async function renderAppOgImage(input: AppOgInput): Promise<Buffer> {
  const iconDataUri = await fetchIconDataUri(input.iconUrl);
  const svg = await satori(appCard(input.name, input.tagline, iconDataUri, /^#[0-9a-f]{6}$/i.test(input.accentColor || '') ? input.accentColor! : ACCENT, input.platform) as any, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [{ name: 'Noto Sans SC', data: fontData, weight: 400, style: 'normal' }],
  });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();
  return Buffer.from(png);
}

/** Stable cache key for an app card (sha1 of version + name + tagline + icon + accent). */
export function appOgCacheKey(input: AppOgInput): string {
  return crypto
    .createHash('sha1')
    .update(`${APP_OG_RENDERER_VERSION} app ${input.name} ${input.tagline} ${input.iconUrl ?? ''} ${input.accentColor ?? ''} ${input.platform ?? ''}`)
    .digest('hex');
}

/** Cached app render: returns the cached PNG if unchanged, else renders + caches. */
export async function renderAppOgImageCached(input: AppOgInput): Promise<Buffer> {
  const file = path.join(CACHE_DIR, `${appOgCacheKey(input)}.png`);
  try {
    return fs.readFileSync(file);
  } catch {
    /* cache miss — render below */
  }
  const png = await renderAppOgImage(input);
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, png);
  } catch {
    /* cache write is best-effort; never fail a build over it */
  }
  return png;
}

/** Render a post's OG card to a 1200×630 PNG buffer (satori → resvg). Pure: no disk I/O. */
export async function renderPostOgImage(input: OgImageInput): Promise<Buffer> {
  const svg = await satori(card(input) as any, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [{ name: 'Noto Sans SC', data: fontData, weight: 400, style: 'normal' }],
  });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } })
    .render()
    .asPng();
  return Buffer.from(png);
}

// Content-addressed build cache: a card only depends on (title, dateLabel,
// renderer version), so an unchanged post reuses its PNG instead of re-rendering
// (~3s each × 134 posts × 2 locales would otherwise re-run every build). The
// cache lives outside dist/ so `astro build` wiping dist doesn't clear it; it
// persists across in-place content rebuilds and git pulls (gitignored).
const CACHE_DIR = path.resolve(process.cwd(), '.og-cache');

/** Stable cache key for a card (sha1 of version + title + date). */
export function ogCacheKey(input: OgImageInput): string {
  return crypto
    .createHash('sha1')
    .update(`${OG_RENDERER_VERSION} ${input.title} ${input.dateLabel}`)
    .digest('hex');
}

/** Cached render: returns the cached PNG if the card is unchanged, else renders + caches. */
export async function renderPostOgImageCached(input: OgImageInput): Promise<Buffer> {
  const file = path.join(CACHE_DIR, `${ogCacheKey(input)}.png`);
  try {
    return fs.readFileSync(file);
  } catch {
    /* cache miss — render below */
  }
  const png = await renderPostOgImage(input);
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, png);
  } catch {
    /* cache write is best-effort; never fail a build over it */
  }
  return png;
}
