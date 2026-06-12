import { describe, it, expect, beforeEach } from 'vitest';
import { resetNewTables } from './helpers.js';
import {
  hashBlock,
  splitBlocks,
  normalizeBlock,
  getCache,
  putCache,
  putCacheBatch,
  renderLocalized,
  findMissingBlocks,
  findOrphanedHumanEdits,
} from '../services/i18n.service.js';

beforeEach(resetNewTables);

describe('i18n.service — hash & normalize', () => {
  it('hashBlock is deterministic', () => {
    const a = hashBlock('# Hello\n\nworld');
    const b = hashBlock('# Hello\n\nworld');
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });

  it('hashBlock changes when one character changes', () => {
    expect(hashBlock('# Hello\n\nworld')).not.toBe(hashBlock('# Hello\n\nWorld'));
  });

  it('normalizeBlock strips trailing whitespace per line and outer blank lines', () => {
    expect(normalizeBlock('\n\n# Title   \n\nbody   \n\n')).toBe('# Title\n\nbody');
  });

  it('trailing-whitespace normalization yields the same hash', () => {
    const a = hashBlock('# Title\n\nbody');
    const b = hashBlock('# Title   \n\nbody   ');
    const c = hashBlock('\n\n# Title\n\nbody\n\n');
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it('code-fence content change changes the hash', () => {
    const a = hashBlock('```js\nconsole.log(1)\n```');
    const b = hashBlock('```js\nconsole.log(2)\n```');
    expect(a).not.toBe(b);
  });

  it('CRLF and LF line endings hash identically (cache stability, G-001)', () => {
    expect(hashBlock('a\r\nb')).toBe(hashBlock('a\nb'));
    expect(hashBlock('# Title\r\n\r\nbody')).toBe(hashBlock('# Title\n\nbody'));
  });
});

describe('i18n.service — splitBlocks', () => {
  it('splits heading + paragraph + list + code + table into multiple blocks', () => {
    const md = [
      '# Title',
      '',
      'First paragraph with some content.',
      '',
      '- item one',
      '- item two',
      '',
      '```ts',
      'const x = 1;',
      '```',
      '',
      '| a | b |',
      '| - | - |',
      '| 1 | 2 |',
      '',
    ].join('\n');
    const blocks = splitBlocks(md);
    // 5 distinct semantic blocks: heading, paragraph, list, code, table
    expect(blocks.length).toBe(5);
    for (const b of blocks) {
      expect(b.hash).toMatch(/^[0-9a-f]{16}$/);
      expect(b.raw.length).toBeGreaterThan(0);
    }
  });

  it('hashes are stable across re-splits', () => {
    const md = '# H\n\nbody';
    const a = splitBlocks(md);
    const b = splitBlocks(md);
    expect(a.map(x => x.hash)).toEqual(b.map(x => x.hash));
  });

  it('empty markdown yields zero blocks', () => {
    expect(splitBlocks('').length).toBe(0);
  });
});

describe('i18n.service — cache CRUD', () => {
  it('putCache then getCache returns the row', async () => {
    await putCache({ sourceHash: 'h1', lang: 'en', text: 'Hello', model: 'claude-test', humanEdited: false });
    const row = await getCache('h1', 'en');
    expect(row).toBeTruthy();
    expect(row!.text).toBe('Hello');
    expect(row!.model).toBe('claude-test');
    expect(row!.humanEdited).toBe(0);
    expect(row!.updatedAt).toBeGreaterThan(0);
  });

  it('repeated putCache on same key upserts and updates updatedAt', async () => {
    await putCache({ sourceHash: 'h1', lang: 'en', text: 'one', model: 'claude-test', humanEdited: false });
    const first = await getCache('h1', 'en');
    // wait at least 1s because updatedAt is unix seconds
    await new Promise(r => setTimeout(r, 1100));
    await putCache({ sourceHash: 'h1', lang: 'en', text: 'two', model: 'claude-test', humanEdited: false });
    const second = await getCache('h1', 'en');
    expect(second!.text).toBe('two');
    expect(second!.updatedAt).toBeGreaterThan(first!.updatedAt);
  });

  it('getCache returns null for missing key', async () => {
    expect(await getCache('nope', 'en')).toBeNull();
  });
});

describe('i18n.service — human_edited guard', () => {
  it('AI write into a human_edited=1 row is rejected (keptHuman=true, no overwrite)', async () => {
    await putCache({ sourceHash: 'h1', lang: 'en', text: 'Human version', model: 'human', humanEdited: true });
    const r = await putCache({ sourceHash: 'h1', lang: 'en', text: 'AI version', model: 'claude-test', humanEdited: false });
    expect(r.written).toBe(false);
    expect(r.keptHuman).toBe(true);
    expect(r.warning).toMatch(/human_edited/);
    const row = await getCache('h1', 'en');
    expect(row!.text).toBe('Human version');
    expect(row!.humanEdited).toBe(1);
  });

  it('human write (humanEdited=true) can replace a human row', async () => {
    await putCache({ sourceHash: 'h1', lang: 'en', text: 'v1', model: 'human', humanEdited: true });
    const r = await putCache({ sourceHash: 'h1', lang: 'en', text: 'v2', model: 'human', humanEdited: true });
    expect(r.written).toBe(true);
    expect((await getCache('h1', 'en'))!.text).toBe('v2');
  });

  it('AI finalize (model=claude, humanEdited=true) can replace a prior human row', async () => {
    await putCache({ sourceHash: 'h1', lang: 'en', text: 'stale human', model: 'human', humanEdited: true });
    const r = await putCache({ sourceHash: 'h1', lang: 'en', text: 'human-finalized', model: 'claude-test', humanEdited: true });
    expect(r.written).toBe(true);
    const row = await getCache('h1', 'en');
    expect(row!.text).toBe('human-finalized');
    expect(row!.humanEdited).toBe(1);
  });

  it('putCacheBatch aggregates written / keptHuman / warnings', async () => {
    await putCache({ sourceHash: 'h1', lang: 'en', text: 'human', model: 'human', humanEdited: true });
    const r = await putCacheBatch([
      { sourceHash: 'h1', lang: 'en', text: 'AI overwrite', model: 'claude-test', humanEdited: false }, // guarded
      { sourceHash: 'h2', lang: 'en', text: 'fresh', model: 'claude-test', humanEdited: false },          // written
    ]);
    expect(r.written).toBe(1);
    expect(r.keptHuman).toBe(1);
    expect(r.warnings).toHaveLength(1);
  });
});

describe('i18n.service — renderLocalized', () => {
  it('full cache hit renders all translated text', async () => {
    const md = '# H\n\nfirst paragraph\n\nsecond paragraph';
    const blocks = splitBlocks(md);
    for (const b of blocks) {
      await putCache({ sourceHash: b.hash, lang: 'en', text: `[en] ${b.raw}`, model: 'claude-test', humanEdited: false });
    }
    const r = await renderLocalized(md, 'en');
    expect(r.coverage).toEqual({ hit: blocks.length, total: blocks.length });
    for (const b of blocks) {
      expect(r.markdown).toContain(`[en] ${b.raw}`);
    }
  });

  it('partial hit falls back to source for the missing block', async () => {
    const md = '# H\n\nfirst\n\nsecond';
    const blocks = splitBlocks(md);
    // translate only the first block
    await putCache({ sourceHash: blocks[0].hash, lang: 'en', text: '[en] first', model: 'claude-test', humanEdited: false });
    const r = await renderLocalized(md, 'en');
    expect(r.coverage.hit).toBe(1);
    expect(r.coverage.total).toBe(blocks.length);
    expect(r.markdown).toContain('[en] first');
    // the un-translated block stays in source raw
    const untranslated = blocks.find(b => b.hash !== blocks[0].hash)!;
    expect(r.markdown).toContain(untranslated.raw);
  });

  it('zero hits returns source coverage {hit:0, total:N}', async () => {
    const md = '# H\n\nfirst\n\nsecond';
    const total = splitBlocks(md).length;
    const r = await renderLocalized(md, 'en');
    expect(r.coverage).toEqual({ hit: 0, total });
    expect(r.markdown).toBe(md);
  });

  it('lang equal to sourceLang returns source unchanged', async () => {
    const md = '# H\n\nfirst';
    const r = await renderLocalized(md, 'zh', 'zh');
    expect(r.markdown).toBe(md);
    expect(r.coverage.hit).toBe(0);
  });

  it('empty lang returns source unchanged', async () => {
    const md = '# H\n\nfirst';
    const r = await renderLocalized(md, '', 'zh');
    expect(r.markdown).toBe(md);
  });
});

describe('i18n.service — findMissingBlocks', () => {
  it('returns only blocks with no cache entry', async () => {
    const md = '# H\n\nfirst\n\nsecond';
    const blocks = splitBlocks(md);
    await putCache({ sourceHash: blocks[0].hash, lang: 'en', text: 'x', model: 'claude-test', humanEdited: false });
    const missing = await findMissingBlocks(md, 'en');
    expect(missing).toHaveLength(blocks.length - 1);
    expect(missing.map(b => b.hash)).not.toContain(blocks[0].hash);
  });
});

describe('i18n.service — findOrphanedHumanEdits', () => {
  it('returns human-edited rows whose hash is no longer in the current set', async () => {
    await putCache({ sourceHash: 'oldHash', lang: 'en', text: 'orphan', model: 'human', humanEdited: true });
    const orphans = await findOrphanedHumanEdits(['newHash1', 'newHash2'], 'en');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].sourceHash).toBe('oldHash');
    // not deleted — still queryable
    const stillThere = await getCache('oldHash', 'en');
    expect(stillThere).toBeTruthy();
  });

  it('does not return rows whose hash IS in the current set', async () => {
    await putCache({ sourceHash: 'h1', lang: 'en', text: 'x', model: 'human', humanEdited: true });
    const orphans = await findOrphanedHumanEdits(['h1', 'h2'], 'en');
    expect(orphans).toHaveLength(0);
  });

  it('empty currentHashes returns every human_edited row for the lang (no NOT IN () SQL)', async () => {
    await putCache({ sourceHash: 'h1', lang: 'en', text: 'x', model: 'human', humanEdited: true });
    await putCache({ sourceHash: 'h2', lang: 'en', text: 'y', model: 'human', humanEdited: true });
    // also a non-human row, which should NOT be returned
    await putCache({ sourceHash: 'h3', lang: 'en', text: 'z', model: 'claude-test', humanEdited: false });
    const orphans = await findOrphanedHumanEdits([], 'en');
    expect(orphans).toHaveLength(2);
    expect(orphans.map(r => r.sourceHash).sort()).toEqual(['h1', 'h2']);
  });

  it('scopes by lang', async () => {
    await putCache({ sourceHash: 'h1', lang: 'en', text: 'en orphan', model: 'human', humanEdited: true });
    await putCache({ sourceHash: 'h1', lang: 'ja', text: 'ja orphan', model: 'human', humanEdited: true });
    const enOrphans = await findOrphanedHumanEdits([], 'en');
    expect(enOrphans).toHaveLength(1);
    expect(enOrphans[0].text).toBe('en orphan');
  });
});
