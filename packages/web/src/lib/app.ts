import type { App } from './api';

/**
 * Lighten/darken a hex colour by pct (-100..100).
 * Ported verbatim from App Detail.html:423-424; non-hex input returned unchanged.
 */
export function shade(hex: string, pct: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = pct / 100;
  const ch = (c: number) => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f);
  return '#' + [ch(r), ch(g), ch(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Safe JSON.parse for features / screenshots / links JSON strings.
 * Returns [] on null / malformed / non-array.
 */
export function parseJsonArray<T>(s: string | null): T[] {
  if (s == null) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

const SITE_ACCENT = '#3457B6';

/**
 * Compute the two per-app CSS colour vars.
 * app  = accentColor ?? siteAccent
 * app2 = shade(app, -28)
 */
export function appColors(
  accentColor: string | null,
  siteAccent = SITE_ACCENT,
): { app: string; app2: string } {
  const app = accentColor ?? siteAccent;
  const app2 = shade(app, -28);
  return { app, app2 };
}

export interface MetaCell {
  k: string;
  kEn: string;
  v: string;
  star?: boolean;
}

/**
 * Build the hero spec strip in display order, omitting any cell whose source is
 * null/falsy. Rating is omitted when ratingCount is 0 or null (DP-4.4).
 *
 * `k` is the Chinese label (consumed by the apps/[slug] template's dual-copy
 * <T zh={cell.k} en={cell.kEn} />). `kEn` is the English label counterpart.
 * `v` is the API-sourced value (price, rating, system version, …) and is never
 * translated — that would mutate user-visible numeric / system-version data.
 *
 * Category and version are deliberately NOT cells: the hero eyebrow above the
 * title already reads `Food & Drink · iOS · v1.2`. Repeating them made the
 * strip five cells wide, which at 390px wrapped `分类 / Food & Drink` onto a
 * row of its own with the rest of the row empty.
 */
export function buildMetaCells(app: Pick<
  App,
  'rating' | 'ratingCount' | 'price' | 'minimumOsVersion' | 'releaseDate'
>): MetaCell[] {
  const cells: MetaCell[] = [];

  if (app.price) {
    cells.push({ k: '价格', kEn: 'Price', v: app.price });
  }

  if (app.minimumOsVersion) {
    cells.push({ k: '系统要求', kEn: 'Requires', v: app.minimumOsVersion });
  }

  if (app.ratingCount) {
    cells.push({
      k: '评分',
      kEn: 'Rating',
      v: `${app.rating ?? ''} (${app.ratingCount})`,
      star: true,
    });
  }

  const year = formatYear(app.releaseDate);
  if (year != null) {
    cells.push({ k: '首发', kEn: 'Released', v: String(year) });
  }

  return cells;
}

/**
 * Split a plain-text description blob into paragraphs (split on blank lines).
 * Trims each paragraph; drops empties. Returns [] for null.
 */
export function descriptionParagraphs(desc: string | null): string[] {
  if (desc == null) return [];
  return desc
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Convert a Unix timestamp (seconds) to its UTC year.
 * Returns null when ts is null.
 */
export function formatYear(ts: number | null): number | null {
  if (ts == null) return null;
  return new Date(ts * 1000).getUTCFullYear();
}

/**
 * The product name to show as the page's title, split off the App Store's
 * keyword suffix.
 *
 * Every published app's `trackName` follows `<product> - <keyword string>`
 * (verified 2026-09-06 across all 7: `配料表解密 - 拍照识别食品添加剂`,
 * `Cashie 记账 - AI拍照语音自动记账本`, `Delphi - 语音记灵感·想法关联·口述速记`,
 * `Lifuel - 个人健康助手`, `Model Proxy - 大模型 API 网关`,
 * `佳同步 - 国区国际版活动记录互传`). The suffix is ASO padding, so it is
 * dropped from the display heading — the full `name` still carries the
 * document <title>, the spine label, JSON-LD and the OG image.
 *
 * Splits on the FIRST spaced hyphen / en dash / em dash only, so a product
 * name containing an unspaced hyphen (`Wi-Fi Scout`) survives intact. Returns
 * the input unchanged when there is no such separator or the head is empty.
 */
export function displayName(name: string): string {
  const head = name.split(/\s+[-–—]\s+/)[0]?.trim();
  return head ? head : name;
}

export type ShotDevice = 'phone' | 'tablet' | 'desktop' | 'unknown';

export interface ShotMeta {
  url: string;
  width: number | null;
  height: number | null;
  device: ShotDevice;
}

/**
 * Read a screenshot's pixel size out of its mzstatic URL, whose last path
 * segment is the rendition size (`…/iphone-01.png/1284x2778bb.png`).
 *
 * Verified 2026-09-06 against all 65 screenshot URLs across the 7 published
 * apps: 65/65 parse, in exactly three aspect bands — 1284×2778 (0.462),
 * 2064×2752 & 2048×2732 (0.750), 2880×1800 (1.600).
 *
 * FAILS CLOSED: an unparseable URL yields `{width: null, height: null,
 * device: 'unknown'}`, which the templates render at the image's own
 * intrinsic aspect with no group label. Nothing is ever cropped to a guess.
 */
export function parseShotMeta(url: string): ShotMeta {
  const m = /\/(\d+)x(\d+)bb\.(?:png|jpg|jpeg|webp)$/i.exec(url);
  if (!m) return { url, width: null, height: null, device: 'unknown' };

  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!width || !height) return { url, width: null, height: null, device: 'unknown' };

  return { url, width, height, device: deviceForRatio(width / height) };
}

/** Aspect → device band. < 0.6 phone · < 1.0 tablet · ≥ 1.0 desktop. */
function deviceForRatio(ratio: number): ShotDevice {
  if (ratio < 0.6) return 'phone';
  if (ratio < 1) return 'tablet';
  return 'desktop';
}

export interface ShotGroup {
  device: ShotDevice;
  /** Rendition size shared by the group, e.g. `1284 × 2778`; null when mixed or unknown. */
  dimensions: string | null;
  shots: ShotMeta[];
}

/**
 * Bucket an app's screenshots by device, preserving each group's original
 * order within a band and ordering the bands by the app's own platform.
 *
 * This replaces the old single strip of fixed 9/19.5 frames, which forced
 * every shot — including 3:4 iPad art — through `object-fit: cover` and cut
 * the sides off. Groups exist so each band can be laid out at ITS aspect.
 *
 * Band order is by platform, NOT by first appearance: App Store Connect's
 * array order is arbitrary (配料表解密 stores its five iPad shots first), and
 * an iPhone app whose page opens with iPad art reads backwards.
 */
export function groupScreenshots(urls: string[], platform: string | null = null): ShotGroup[] {
  const seen: ShotDevice[] = [];
  const byDevice = new Map<ShotDevice, ShotMeta[]>();

  for (const url of urls) {
    const meta = parseShotMeta(url);
    if (!byDevice.has(meta.device)) {
      byDevice.set(meta.device, []);
      seen.push(meta.device);
    }
    byDevice.get(meta.device)!.push(meta);
  }

  const preferred: ShotDevice[] = platform === 'macOS'
    ? ['desktop', 'tablet', 'phone', 'unknown']
    : ['phone', 'tablet', 'desktop', 'unknown'];
  const order = [...seen].sort((a, b) => preferred.indexOf(a) - preferred.indexOf(b));

  return order.map((device) => {
    const shots = byDevice.get(device)!;
    const sizes = new Set(
      shots.map((s) => (s.width && s.height ? `${s.width} × ${s.height}` : '')),
    );
    const only = sizes.size === 1 ? [...sizes][0] : '';
    return { device, dimensions: only || null, shots };
  });
}

/**
 * The screenshot to hang in the hero: the first one whose device band matches
 * the app's own platform, else the first parseable one, else the first.
 *
 * Blindly taking `screenshots[0]` is what put a 2064×2752 iPad shot in the
 * hero of an iOS app; ordering inside the array is App Store Connect's, not
 * ours, so it cannot be relied on.
 */
export function heroShot(urls: string[], platform: string | null): ShotMeta | null {
  if (urls.length === 0) return null;
  const metas = urls.map(parseShotMeta);
  const want: ShotDevice = platform === 'macOS' ? 'desktop' : 'phone';
  return metas.find((m) => m.device === want) ?? metas.find((m) => m.device !== 'unknown') ?? metas[0];
}

/**
 * The App Store link for an app, or null when there is no evidence the app is
 * actually on a storefront.
 *
 * Two separate questions, deliberately kept apart:
 *
 * 1. IS IT LISTED? `appStoreUrl` is iTunes' own `trackViewUrl`, so its presence
 *    proves the listing exists. An `appStoreId` alone does NOT: an ID is minted
 *    in App Store Connect long before (or without) release. Verified 2026-09-06
 *    — Claudex (id 6763678207) returns no iTunes result on cn/us/jp/gb and its
 *    store page 404s, while the site linked to it anyway. `icon` is only ever
 *    written from a successful lookup, so it stands in as that proof for rows
 *    synced before `appStoreUrl` began being stored.
 *
 * 2. WHICH URL? Not `trackViewUrl` — that is country-locked
 *    (`…/cn/app/cashie-记账…/id6757636100`) because it is whatever storefront
 *    the lookup happened to use. An app is ONE App Store record with per-locale
 *    localizations, reached through ONE storefront-neutral URL that Apple
 *    resolves for each visitor: `https://apps.apple.com/app/id<id>` (verified
 *    200, 2026-09-06). Emitting the CN URL sent every English reader to the
 *    Chinese listing.
 */
export function storeHref(app: Pick<App, 'appStoreUrl' | 'appStoreId' | 'icon'>): string | null {
  const listed = Boolean(app.appStoreUrl) || Boolean(app.appStoreId && app.icon);
  if (!listed) return null;
  if (app.appStoreId) return `https://apps.apple.com/app/id${app.appStoreId}`;
  // No id to build a neutral URL from — the stored one is all there is.
  return app.appStoreUrl;
}

/** The English App Store copy an app carries for /en, stored by app_sync. */
export interface EnStoreCopy {
  name: string | null;
  description: string | null;
  price: string | null;
  whatsNew: string | null;
}

/**
 * Read the English storefront's copy out of an app's `meta` JSON.
 *
 * `app_sync` writes it to `meta.i18n.en` from the app's English localization.
 * One App Store record carries several independently authored localizations —
 * for id 6760798981 the English one is named `Glink: Workout & Activity Sync`
 * against the Chinese `佳同步 - 国区国际版活动记录互传` — so this is quoting
 * the app project's own English copy, not translating the Chinese.
 *
 * Returns null for absent/unparseable meta or a missing key, so /en falls back
 * to the row's own copy rather than the build breaking on a hand-edited row.
 */
export function enStoreCopy(meta: string | null): EnStoreCopy | null {
  if (!meta) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(meta);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const i18n = (parsed as Record<string, unknown>).i18n;
  if (!i18n || typeof i18n !== 'object' || Array.isArray(i18n)) return null;
  const en = (i18n as Record<string, unknown>).en;
  if (!en || typeof en !== 'object' || Array.isArray(en)) return null;

  const pick = (k: string): string | null => {
    const v = (en as Record<string, unknown>)[k];
    return typeof v === 'string' && v.length > 0 ? v : null;
  };
  return {
    name: pick('name'),
    description: pick('description'),
    price: pick('price'),
    whatsNew: pick('whatsNew'),
  };
}

export interface ReleaseLine {
  kind: 'head' | 'item';
  text: string;
}

/**
 * Split an App Store "What's New" blob into headings and bullet items.
 *
 * ASC stores release notes as plain text: some apps write a flat list of `·`
 * bullets, others group them under bare heading lines ("新增", "修复",
 * "备份与其他"). A line is an ITEM when it opens with a bullet marker, and a
 * HEAD otherwise; markers are stripped so the template supplies its own.
 *
 * Returns [] for null/blank so the caller can drop the section entirely.
 */
export function parseReleaseNotes(text: string | null): ReleaseLine[] {
  if (text == null) return [];
  return text
    .split(/\r?\n/)
    .map((raw) => raw.trim())
    // A line of nothing but bullet markers carries no content — drop it before
    // classifying, or it would fall through to `head` and render as a stray dot.
    .filter((line) => line.length > 0 && !/^[·•‣▪*+–—-]+$/.test(line))
    .map((line) => {
      const m = /^[·•‣▪*+–—-]\s*(.+)$/.exec(line);
      return m
        ? { kind: 'item' as const, text: m[1].trim() }
        : { kind: 'head' as const, text: line };
    })
    .filter((l) => l.text.length > 0);
}

/**
 * The apps to show in the index's showcase band: only apps that actually have
 * art to show, most recently updated first, `featured` rows ahead of the rest.
 */
export function pickShowcase<T extends {
  screenshots: string | null;
  featured?: number | null;
  currentVersionReleaseDate?: number | null;
}>(apps: T[], limit = 3): T[] {
  return apps
    .filter((a) => parseJsonArray<string>(a.screenshots).length > 0)
    .sort((a, b) =>
      (b.featured ?? 0) - (a.featured ?? 0) ||
      (b.currentVersionReleaseDate ?? 0) - (a.currentVersionReleaseDate ?? 0),
    )
    .slice(0, limit);
}
