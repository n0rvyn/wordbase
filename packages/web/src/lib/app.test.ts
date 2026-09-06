import { describe, it, expect } from 'vitest';
import {
  shade,
  parseJsonArray,
  appColors,
  buildMetaCells,
  descriptionParagraphs,
  formatYear,
  displayName,
  parseShotMeta,
  groupScreenshots,
  heroShot,
  pickShowcase,
  parseReleaseNotes,
  storeHref,
  enStoreCopy,
} from './app';

// Real rendition URLs, copied verbatim from the published rows on 2026-09-06.
const IPHONE_SHOT =
  'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/68/b9/cc/68b9ccec/iphone-01-result.png/1284x2778bb.png';
const IPHONE_SHOT_2 =
  'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/a8/5c/6e/a85c6e40/iphone-02-naming.png/1284x2778bb.png';
const IPAD_SHOT =
  'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/7c/75/1e/7c751eb6/ipad13-01-result.png/2064x2752bb.png';
const IPAD_SHOT_ALT =
  'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/5b/4c/d8/5b4cd88e/asc-ipad129-01.png/2048x2732bb.png';
const MAC_SHOT =
  'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/8f/b6/1b/8fb61b55/06-general.png/2880x1800bb.png';

// ─── shade ────────────────────────────────────────────────────────────────────

describe('shade', () => {
  it('darkens #0CA8E5 by -28% to exactly #0979a5', () => {
    // r=12·.72→9, g=168·.72→121=0x79, b=229·.72→165=0xa5
    expect(shade('#0CA8E5', -28)).toBe('#0979a5');
  });

  it('returns invalid hex input unchanged', () => {
    expect(shade('not-a-hex', -28)).toBe('not-a-hex');
  });

  it('returns short hex input unchanged', () => {
    expect(shade('#0CA', -28)).toBe('#0CA');
  });

  it('lightens a colour (positive pct)', () => {
    // pct > 0: c + (255-c)*f. Just check it produces a valid hex string.
    const result = shade('#333333', 50);
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
    expect(result).not.toBe('#333333');
  });
});

// ─── parseJsonArray ───────────────────────────────────────────────────────────

describe('parseJsonArray', () => {
  it('returns [] for null', () => {
    expect(parseJsonArray(null)).toEqual([]);
  });

  it('parses a valid JSON array', () => {
    const result = parseJsonArray<{ a: number }>('[{"a":1}]');
    expect(result).toHaveLength(1);
    expect(result[0].a).toBe(1);
  });

  it('returns [] for malformed JSON', () => {
    expect(parseJsonArray('garbage')).toEqual([]);
  });

  it('returns [] for a JSON non-array (object)', () => {
    expect(parseJsonArray('{"a":1}')).toEqual([]);
  });

  it('returns [] for a JSON non-array (string)', () => {
    expect(parseJsonArray('"hello"')).toEqual([]);
  });
});

// ─── appColors ────────────────────────────────────────────────────────────────

describe('appColors', () => {
  it('derives app2 from accentColor (exact literal, not tautological)', () => {
    const { app, app2 } = appColors('#0CA8E5');
    expect(app).toBe('#0CA8E5');
    expect(app2).toBe('#0979a5');
  });

  it('falls back to site accent when accentColor is null', () => {
    const { app } = appColors(null);
    expect(app).toBe('#3457B6');
  });

  it('uses custom siteAccent when provided', () => {
    const { app } = appColors(null, '#aabbcc');
    expect(app).toBe('#aabbcc');
  });
});

// ─── buildMetaCells ───────────────────────────────────────────────────────────

describe('buildMetaCells', () => {
  const base = {
    rating: null,
    ratingCount: null,
    price: null,
    minimumOsVersion: null,
    releaseDate: null,
  };

  it('returns empty array when all fields null', () => {
    expect(buildMetaCells(base)).toEqual([]);
  });

  it('omits rating cell when ratingCount is 0', () => {
    const cells = buildMetaCells({ ...base, rating: 4.8, ratingCount: 0 });
    expect(cells.find(c => c.k === '评分')).toBeUndefined();
  });

  it('omits rating cell when ratingCount is null', () => {
    const cells = buildMetaCells({ ...base, rating: 4.8, ratingCount: null });
    expect(cells.find(c => c.k === '评分')).toBeUndefined();
  });

  it('includes rating cell when ratingCount is non-zero', () => {
    const cells = buildMetaCells({ ...base, rating: 4.8, ratingCount: 1200 });
    const cell = cells.find(c => c.k === '评分');
    expect(cell).toBeDefined();
    expect(cell?.star).toBe(true);
  });

  it('carries price and minimum OS verbatim', () => {
    const cells = buildMetaCells({ ...base, price: '¥1.00', minimumOsVersion: '16.0' });
    expect(cells.find(c => c.k === '价格')?.v).toBe('¥1.00');
    expect(cells.find(c => c.k === '系统要求')?.v).toBe('16.0');
  });

  it('derives the release year from releaseDate', () => {
    // 2026-05-17 07:00:00 UTC
    const cells = buildMetaCells({ ...base, releaseDate: 1779001200 });
    expect(cells.find(c => c.k === '首发')?.v).toBe('2026');
  });

  // Version and category live in the hero eyebrow; repeating them here made the
  // strip five cells wide and wrapped it onto two rows at 390px.
  it('does not emit a version or category cell', () => {
    const cells = buildMetaCells({
      ...base, price: '¥1.00', minimumOsVersion: '16.0', releaseDate: 1779001200,
    });
    const keys = cells.map(c => c.k);
    expect(keys).not.toContain('版本');
    expect(keys).not.toContain('分类');
    expect(keys).toEqual(['价格', '系统要求', '首发']);
  });

  it('never emits more than four cells (the strip must stay one row at 390px)', () => {
    const cells = buildMetaCells({
      rating: 4.8, ratingCount: 1200, price: '¥1.00',
      minimumOsVersion: '16.0', releaseDate: 1779001200,
    });
    expect(cells).toHaveLength(4);
  });
});

// ─── descriptionParagraphs ────────────────────────────────────────────────────

describe('descriptionParagraphs', () => {
  it('returns [] for null', () => {
    expect(descriptionParagraphs(null)).toEqual([]);
  });

  it('splits on blank lines and trims', () => {
    const input = 'First paragraph.\n\nSecond paragraph.';
    const result = descriptionParagraphs(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('First paragraph.');
    expect(result[1]).toBe('Second paragraph.');
  });

  it('splits the real Delphi-style blob with 【headers】 into ≥2 paragraphs', () => {
    // Synthetic blob that mirrors Delphi format (plain text, 【…】 sections, • bullets)
    const blob = [
      '【语音捕获】\n语音捕获让你用声音快速记录想法。\n• 支持实时转录\n• 多语言识别',
      '',
      '【关联思考】\n自动发现想法之间的联系，构建知识网络。',
      '',
      '订阅说明\nhttps://example.notion.site/privacy-policy',
    ].join('\n');

    const paras = descriptionParagraphs(blob);
    expect(paras.length).toBeGreaterThanOrEqual(2);
    expect(paras.some(p => p.includes('【语音捕获】'))).toBe(true);
  });

  it('drops empty paragraphs', () => {
    const input = 'A\n\n\n\nB';
    expect(descriptionParagraphs(input)).toHaveLength(2);
  });
});

// ─── formatYear ───────────────────────────────────────────────────────────────

describe('formatYear', () => {
  it('returns null for null input', () => {
    expect(formatYear(null)).toBeNull();
  });

  it('returns a 4-digit year for a known timestamp', () => {
    // 2024-04-29 00:00:00 UTC → year 2024
    const ts = 1714377600;
    expect(formatYear(ts)).toBe(2024);
  });

  it('returns a number (not a string)', () => {
    expect(typeof formatYear(1700000000)).toBe('number');
  });
});

// ─── displayName ──────────────────────────────────────────────────────────────

describe('displayName', () => {
  // Every published app's store name, verbatim from iTunes on 2026-09-06.
  it.each([
    ['配料表解密 - 拍照识别食品添加剂', '配料表解密'],
    ['Cashie 记账 - AI拍照语音自动记账本', 'Cashie 记账'],
    ['Delphi - 语音记灵感·想法关联·口述速记', 'Delphi'],
    ['Lifuel - 个人健康助手', 'Lifuel'],
    ['Model Proxy - 大模型 API 网关', 'Model Proxy'],
    ['佳同步 - 国区国际版活动记录互传', '佳同步'],
  ])('drops the keyword suffix of %s', (input, expected) => {
    expect(displayName(input)).toBe(expected);
  });

  it('leaves a name with no separator alone', () => {
    expect(displayName('Claudex')).toBe('Claudex');
  });

  it('keeps an unspaced hyphen inside the product name', () => {
    expect(displayName('Wi-Fi Scout')).toBe('Wi-Fi Scout');
  });

  it('handles en dash and em dash separators', () => {
    expect(displayName('Delphi – 认识你自己')).toBe('Delphi');
    expect(displayName('Delphi — 认识你自己')).toBe('Delphi');
  });

  it('splits on the first separator only', () => {
    expect(displayName('A - B - C')).toBe('A');
  });

  it('falls back to the full name when the head would be empty', () => {
    expect(displayName(' - 只有后缀')).toBe(' - 只有后缀');
  });
});

// ─── parseShotMeta ────────────────────────────────────────────────────────────

describe('parseShotMeta', () => {
  it('buckets a known iPhone rendition as phone', () => {
    expect(parseShotMeta(IPHONE_SHOT)).toEqual({
      url: IPHONE_SHOT, width: 1284, height: 2778, device: 'phone',
    });
  });

  it('buckets both known iPad renditions as tablet', () => {
    expect(parseShotMeta(IPAD_SHOT).device).toBe('tablet');
    expect(parseShotMeta(IPAD_SHOT_ALT).device).toBe('tablet');
  });

  it('buckets a known Mac rendition as desktop', () => {
    expect(parseShotMeta(MAC_SHOT)).toEqual({
      url: MAC_SHOT, width: 2880, height: 1800, device: 'desktop',
    });
  });

  // Negative control: the parser must fail closed, never guess a device.
  it.each([
    'https://example.com/no-size.png',
    'https://is1-ssl.mzstatic.com/image/thumb/x/shot.png/1284x2778bb.gif',
    'https://is1-ssl.mzstatic.com/image/thumb/x/1284x2778bb.png/trailing/segment',
    '',
  ])('returns unknown with null size for %s', (url) => {
    expect(parseShotMeta(url)).toEqual({ url, width: null, height: null, device: 'unknown' });
  });
});

// ─── groupScreenshots ─────────────────────────────────────────────────────────

describe('groupScreenshots', () => {
  it('splits mixed iPhone + iPad art into two groups', () => {
    const groups = groupScreenshots([IPHONE_SHOT, IPAD_SHOT, IPHONE_SHOT_2], 'iOS');
    expect(groups.map(g => g.device)).toEqual(['phone', 'tablet']);
    expect(groups[0].shots).toHaveLength(2);
    expect(groups[1].shots).toHaveLength(1);
  });

  it('keeps the original order inside each group', () => {
    const groups = groupScreenshots([IPHONE_SHOT, IPAD_SHOT, IPHONE_SHOT_2], 'iOS');
    expect(groups[0].shots.map(s => s.url)).toEqual([IPHONE_SHOT, IPHONE_SHOT_2]);
  });

  // ASC's array order is arbitrary — 配料表解密 stores its iPad shots first —
  // so bands are ordered by the app's platform, not by first appearance.
  it('puts phone art first for an iOS app even when iPad art comes first', () => {
    expect(groupScreenshots([IPAD_SHOT, IPHONE_SHOT], 'iOS').map(g => g.device))
      .toEqual(['phone', 'tablet']);
  });

  it('puts desktop art first for a macOS app', () => {
    expect(groupScreenshots([IPHONE_SHOT, MAC_SHOT], 'macOS').map(g => g.device))
      .toEqual(['desktop', 'phone']);
  });

  it('sinks an unknown band below every recognised one', () => {
    expect(groupScreenshots(['https://example.com/x.png', IPHONE_SHOT], 'iOS').map(g => g.device))
      .toEqual(['phone', 'unknown']);
  });

  it('reports a shared rendition size, and null when the group is mixed', () => {
    expect(groupScreenshots([IPHONE_SHOT, IPHONE_SHOT_2])[0].dimensions).toBe('1284 × 2778');
    expect(groupScreenshots([IPAD_SHOT, IPAD_SHOT_ALT])[0].dimensions).toBeNull();
  });

  it('collects unparseable URLs into an unknown group with no dimensions', () => {
    const groups = groupScreenshots(['https://example.com/x.png']);
    expect(groups).toHaveLength(1);
    expect(groups[0].device).toBe('unknown');
    expect(groups[0].dimensions).toBeNull();
  });

  it('returns no groups for no screenshots', () => {
    expect(groupScreenshots([])).toEqual([]);
  });
});

// ─── heroShot ─────────────────────────────────────────────────────────────────

describe('heroShot', () => {
  // The exact defect this exists to prevent: 配料表解密's screenshots[0] is a
  // 2064×2752 iPad shot, and the hero used to take [0] blindly.
  it('skips a leading iPad shot to hang a phone shot for an iOS app', () => {
    expect(heroShot([IPAD_SHOT, IPHONE_SHOT], 'iOS')?.url).toBe(IPHONE_SHOT);
  });

  it('prefers a desktop shot for a macOS app', () => {
    expect(heroShot([IPHONE_SHOT, MAC_SHOT], 'macOS')?.url).toBe(MAC_SHOT);
  });

  it('falls back to the first parseable shot when no band matches', () => {
    expect(heroShot(['https://example.com/x.png', IPAD_SHOT], 'iOS')?.url).toBe(IPAD_SHOT);
  });

  it('falls back to the first shot when none parse', () => {
    expect(heroShot(['https://example.com/x.png'], 'iOS')?.url).toBe('https://example.com/x.png');
  });

  it('returns null when there are no screenshots', () => {
    expect(heroShot([], 'iOS')).toBeNull();
  });
});

// ─── pickShowcase ─────────────────────────────────────────────────────────────

describe('pickShowcase', () => {
  const withArt = (id: string, updated: number, featured = 0) => ({
    id, featured, currentVersionReleaseDate: updated,
    screenshots: JSON.stringify([IPHONE_SHOT]),
  });

  it('drops apps that have no screenshots', () => {
    const apps = [
      { id: 'bare', featured: 0, currentVersionReleaseDate: 999, screenshots: null },
      withArt('has-art', 1),
    ];
    expect(pickShowcase(apps).map(a => a.id)).toEqual(['has-art']);
  });

  it('orders by most recently updated', () => {
    const apps = [withArt('old', 100), withArt('new', 300), withArt('mid', 200)];
    expect(pickShowcase(apps).map(a => a.id)).toEqual(['new', 'mid', 'old']);
  });

  it('puts a featured app ahead of a more recently updated one', () => {
    const apps = [withArt('recent', 900), withArt('starred', 100, 1)];
    expect(pickShowcase(apps).map(a => a.id)).toEqual(['starred', 'recent']);
  });

  it('caps at the requested limit', () => {
    const apps = [withArt('a', 4), withArt('b', 3), withArt('c', 2), withArt('d', 1)];
    expect(pickShowcase(apps)).toHaveLength(3);
    expect(pickShowcase(apps, 2)).toHaveLength(2);
  });

  it('does not mutate the input order', () => {
    const apps = [withArt('old', 100), withArt('new', 300)];
    pickShowcase(apps);
    expect(apps.map(a => a.id)).toEqual(['old', 'new']);
  });

  it('returns an empty list when nothing has art', () => {
    expect(pickShowcase([{ id: 'x', featured: 0, currentVersionReleaseDate: 1, screenshots: '[]' }]))
      .toEqual([]);
  });
});

// ─── parseReleaseNotes ────────────────────────────────────────────────────────

describe('parseReleaseNotes', () => {
  it('returns [] for null and for a blank blob', () => {
    expect(parseReleaseNotes(null)).toEqual([]);
    expect(parseReleaseNotes('   \n\n  ')).toEqual([]);
  });

  // 配料表解密 v1.2, verbatim from the published row.
  it('reads a flat bullet list as two items and no headings', () => {
    const blob = [
      '· 签到得到的次数不再清零：用不完会一直攒着，随时可用',
      '· 应用更名为「配料表解密」，功能和数据都不变',
    ].join('\n');
    const lines = parseReleaseNotes(blob);
    expect(lines).toEqual([
      { kind: 'item', text: '签到得到的次数不再清零：用不完会一直攒着，随时可用' },
      { kind: 'item', text: '应用更名为「配料表解密」，功能和数据都不变' },
    ]);
  });

  // Cashie v1.1, verbatim: bare heading lines with • bullets under them.
  it('separates bare heading lines from bulleted items', () => {
    const blob = [
      '退款终于是退款了',
      '',
      '• 退款成为独立的交易类型，不再被记成一笔负支出',
      '• 原来那笔消费那一行直接显示「已退多少」',
      '',
      '账单识别更准',
      '• 医保票据只计入本人自付部分',
    ].join('\n');
    const lines = parseReleaseNotes(blob);
    expect(lines.map(l => l.kind)).toEqual(['head', 'item', 'item', 'head', 'item']);
    expect(lines[0].text).toBe('退款终于是退款了');
    expect(lines[1].text).toBe('退款成为独立的交易类型，不再被记成一笔负支出');
    expect(lines[3].text).toBe('账单识别更准');
  });

  it('treats an unbulleted sentence as a heading, not an item', () => {
    // Model Proxy / Lifuel ship a single unbulleted line.
    expect(parseReleaseNotes('Bug fixes and performance improvements.'))
      .toEqual([{ kind: 'head', text: 'Bug fixes and performance improvements.' }]);
  });

  it('strips every accepted bullet marker', () => {
    const lines = parseReleaseNotes(['· a', '• b', '- c', '* d', '– e'].join('\n'));
    expect(lines.every(l => l.kind === 'item')).toBe(true);
    expect(lines.map(l => l.text)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('drops a bullet marker with nothing after it', () => {
    expect(parseReleaseNotes('·\n· real')).toEqual([{ kind: 'item', text: 'real' }]);
  });
});

// ─── storeHref ────────────────────────────────────────────────────────────────

describe('storeHref', () => {
  it('uses the stored trackViewUrl when present', () => {
    expect(storeHref({
      appStoreUrl: 'https://apps.apple.com/cn/app/id6757636100',
      appStoreId: '6757636100',
      icon: 'https://is1-ssl.mzstatic.com/icon.jpg',
    })).toBe('https://apps.apple.com/cn/app/id6757636100');
  });

  it('falls back to the id URL for a row synced before appStoreUrl existed', () => {
    // A non-null icon proves an iTunes lookup succeeded, so the listing is real.
    expect(storeHref({
      appStoreUrl: null,
      appStoreId: '6790027807',
      icon: 'https://is1-ssl.mzstatic.com/icon.jpg',
    })).toBe('https://apps.apple.com/app/id6790027807');
  });

  // The defect this guards: Claudex holds an App Store Connect id but is on no
  // storefront (verified cn/us/jp/gb 2026-09-06) and its store page 404s.
  it('returns null for an app with an id but no successful lookup', () => {
    expect(storeHref({ appStoreUrl: null, appStoreId: '6763678207', icon: null })).toBeNull();
  });

  it('returns null when there is no id at all', () => {
    expect(storeHref({ appStoreUrl: null, appStoreId: null, icon: 'https://x/icon.jpg' })).toBeNull();
  });
});

// ─── enStoreCopy ──────────────────────────────────────────────────────────────

describe('enStoreCopy', () => {
  // Real pair, measured 2026-09-06 on id 6760798981: the US listing is not a
  // translation of the CN one, it is a different product name.
  const EN = {
    name: 'Glink: Workout & Activity Sync',
    description: 'Sync workouts between regional accounts.',
    price: 'Free',
    whatsNew: 'Bug fixes.',
  };
  const meta = (o: unknown) => JSON.stringify(o);

  it('reads the four fields out of meta.i18n.en', () => {
    expect(enStoreCopy(meta({ i18n: { en: EN } }))).toEqual(EN);
  });

  it('ignores sibling keys and other locales', () => {
    const out = enStoreCopy(meta({ appId: 'x', i18n: { ja: { name: 'ジェイ' }, en: EN } }));
    expect(out).toEqual(EN);
  });

  it('reports a missing field as null rather than dropping the whole overlay', () => {
    expect(enStoreCopy(meta({ i18n: { en: { name: 'Glink' } } }))).toEqual({
      name: 'Glink', description: null, price: null, whatsNew: null,
    });
  });

  it('treats an empty string as absent', () => {
    // An empty en name must fall back to the row, not blank the page title.
    expect(enStoreCopy(meta({ i18n: { en: { ...EN, name: '' } } }))?.name).toBeNull();
  });

  it('rejects non-string values instead of leaking them into the DOM', () => {
    expect(enStoreCopy(meta({ i18n: { en: { name: 42, price: ['Free'] } } }))).toEqual({
      name: null, description: null, price: null, whatsNew: null,
    });
  });

  // Negative controls — every one of these must yield null, never a throw:
  // the build must not break on a hand-edited or legacy meta column.
  it.each([
    ['null meta', null],
    ['empty string', ''],
    ['unparseable JSON', '{oops'],
    ['a JSON array', '[1,2,3]'],
    ['a JSON scalar', '"just a string"'],
    ['meta without i18n', '{"appId":"x"}'],
    ['i18n that is not an object', '{"i18n":"oops"}'],
    ['i18n without en', '{"i18n":{"ja":{"name":"ジェイ"}}}'],
    ['en that is not an object', '{"i18n":{"en":"Glink"}}'],
    ['en that is an array', '{"i18n":{"en":[]}}'],
  ])('returns null for %s', (_label, input) => {
    expect(enStoreCopy(input as string | null)).toBeNull();
  });
});
