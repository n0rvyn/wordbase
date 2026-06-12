import { describe, it, expect } from 'vitest';
import { enHref, stripEn, isEnPath, hreflangAlternates } from './locale';

describe('enHref', () => {
  it('apex / maps to /en', () => {
    expect(enHref('/')).toBe('/en');
    expect(enHref('')).toBe('/en');
  });

  it('nested path gains /en prefix', () => {
    expect(enHref('/posts/foo')).toBe('/en/posts/foo');
    expect(enHref('/apps')).toBe('/en/apps');
    expect(enHref('/categories/essay')).toBe('/en/categories/essay');
  });

  it('adds leading slash if missing', () => {
    expect(enHref('posts/foo')).toBe('/en/posts/foo');
  });
});

describe('stripEn', () => {
  it('/en (or /en/) maps back to /', () => {
    expect(stripEn('/en')).toBe('/');
    expect(stripEn('/en/')).toBe('/');
  });

  it('nested en path loses the /en prefix', () => {
    expect(stripEn('/en/posts/foo')).toBe('/posts/foo');
    expect(stripEn('/en/apps/delphi')).toBe('/apps/delphi');
  });

  it('a non-en path passes through unchanged', () => {
    expect(stripEn('/posts/foo')).toBe('/posts/foo');
    expect(stripEn('/')).toBe('/');
  });
});

describe('enHref / stripEn round-trip', () => {
  it.each([
    '/',
    '/posts/foo',
    '/apps/delphi',
    '/about',
    '/writing',
    '/categories/essay',
    '/tags/design',
  ])('zh path %s round-trips', (path) => {
    expect(stripEn(enHref(path))).toBe(path);
  });
});

describe('isEnPath', () => {
  it('true for /en and /en/*', () => {
    expect(isEnPath('/en')).toBe(true);
    expect(isEnPath('/en/')).toBe(true);
    expect(isEnPath('/en/posts/foo')).toBe(true);
  });

  it('false for zh paths and unrelated prefixes', () => {
    expect(isEnPath('/')).toBe(false);
    expect(isEnPath('/posts/foo')).toBe(false);
    expect(isEnPath('/english')).toBe(false);  // /english is NOT /en + "glish"
    expect(isEnPath('/endpoint')).toBe(false);
  });
});

describe('hreflangAlternates', () => {
  const site = new URL('https://norvyn.com');

  it('from a zh path, emits all three with zh-CN + x-default pointing to zh', () => {
    const out = hreflangAlternates('/posts/foo', site);
    expect(out).toEqual([
      { hreflang: 'zh-CN',     href: 'https://norvyn.com/posts/foo' },
      { hreflang: 'en',        href: 'https://norvyn.com/en/posts/foo' },
      { hreflang: 'x-default', href: 'https://norvyn.com/posts/foo' },
    ]);
  });

  it('from an en path, emits all three with zh-CN + x-default pointing to the zh twin', () => {
    const out = hreflangAlternates('/en/posts/foo', site);
    expect(out).toEqual([
      { hreflang: 'zh-CN',     href: 'https://norvyn.com/posts/foo' },
      { hreflang: 'en',        href: 'https://norvyn.com/en/posts/foo' },
      { hreflang: 'x-default', href: 'https://norvyn.com/posts/foo' },
    ]);
  });

  it('from apex / the en side is /en (no trailing path)', () => {
    const out = hreflangAlternates('/', site);
    expect(out).toEqual([
      { hreflang: 'zh-CN',     href: 'https://norvyn.com/' },
      { hreflang: 'en',        href: 'https://norvyn.com/en' },
      { hreflang: 'x-default', href: 'https://norvyn.com/' },
    ]);
  });

  it('accepts a string site origin', () => {
    const out = hreflangAlternates('/apps', 'https://norvyn.com/');
    expect(out[0].href).toBe('https://norvyn.com/apps');
    expect(out[1].href).toBe('https://norvyn.com/en/apps');
  });

  it('handles undefined site (degrades to root-relative URLs)', () => {
    const out = hreflangAlternates('/posts/foo', undefined);
    expect(out[0].href).toBe('/posts/foo');
    expect(out[1].href).toBe('/en/posts/foo');
    expect(out[2].href).toBe('/posts/foo');
  });
});
