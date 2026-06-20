import { describe, it, expect } from 'vitest';

import { markdownToHtml } from './render-markdown.js';

describe('markdownToHtml', () => {
  it('adds loading="lazy" and decoding="async" to content images', () => {
    const html = markdownToHtml('![alt text](http://x/y.png)');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
  });

  it('preserves the image alt text from markdown', () => {
    const html = markdownToHtml('![a meaningful caption](http://x/y.png)');
    expect(html).toContain('alt="a meaningful caption"');
  });

  it('renders text-only markdown without touching it', () => {
    const html = markdownToHtml('# Heading\n\nA paragraph.');
    expect(html).toContain('<h1');
    expect(html).toContain('A paragraph.');
    expect(html).not.toContain('loading="lazy"');
  });
});
