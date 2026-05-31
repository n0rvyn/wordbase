import { describe, it, expect } from 'vitest';
import { injectHeadingIds, selectAdjacent } from './article';

// ─── injectHeadingIds ─────────────────────────────────────────────────────────

describe('injectHeadingIds', () => {
  it('injects index-based ids on h2 and h3, leaves h4 untouched', () => {
    const input =
      '<h2>三种声音 <em>一只手</em></h2><p>x</p><h3>小标题 <code>x</code></h3><h2>ship</h2><h4>skip</h4>';
    const { html } = injectHeadingIds(input);
    expect(html).toContain('<h2 id="h-0">');
    expect(html).toContain('<h3 id="h-1">');
    expect(html).toContain('<h2 id="h-2">');
    // h4 must remain untouched (no id attribute)
    expect(html).toContain('<h4>skip</h4>');
  });

  it('builds correct toc entries with stripped inline tags', () => {
    const input =
      '<h2>三种声音 <em>一只手</em></h2><p>x</p><h3>小标题 <code>x</code></h3><h2>ship</h2><h4>skip</h4>';
    const { toc } = injectHeadingIds(input);
    expect(toc).toEqual([
      { id: 'h-0', level: 2, text: '三种声音 一只手' },
      { id: 'h-1', level: 3, text: '小标题 x' },
      { id: 'h-2', level: 2, text: 'ship' },
    ]);
  });

  it('returns empty toc for input with no h2/h3 headings', () => {
    const input = '<p>no headings here</p><h1>title</h1><h4>small</h4>';
    const { html, toc } = injectHeadingIds(input);
    expect(html).toBe(input);
    expect(toc).toEqual([]);
  });

  it('returns empty toc for empty string', () => {
    const { html, toc } = injectHeadingIds('');
    expect(html).toBe('');
    expect(toc).toEqual([]);
  });

  it('preserves inner html content while injecting id', () => {
    const input = '<h2>Hello <strong>World</strong></h2>';
    const { html } = injectHeadingIds(input);
    expect(html).toBe('<h2 id="h-0">Hello <strong>World</strong></h2>');
  });
});

// ─── selectAdjacent ───────────────────────────────────────────────────────────

describe('selectAdjacent', () => {
  const slugs = ['newest', 'middle', 'oldest'];

  it('first item has newer=null and older=next', () => {
    const result = selectAdjacent(slugs, 'newest');
    expect(result).toEqual({ newer: null, older: 'middle' });
  });

  it('last item has older=null and newer=prev', () => {
    const result = selectAdjacent(slugs, 'oldest');
    expect(result).toEqual({ newer: 'middle', older: null });
  });

  it('middle item has both newer and older', () => {
    const result = selectAdjacent(slugs, 'middle');
    expect(result).toEqual({ newer: 'newest', older: 'oldest' });
  });

  it('returns both null when current is the only item', () => {
    const result = selectAdjacent(['solo'], 'solo');
    expect(result).toEqual({ newer: null, older: null });
  });

  it('returns both null when current is not found', () => {
    const result = selectAdjacent(slugs, 'nonexistent');
    expect(result).toEqual({ newer: null, older: null });
  });
});
