import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escape';

describe('escapeHtml', () => {
  it('neutralizes an img onerror XSS payload', () => {
    const out = escapeHtml('<img src=x onerror="alert(1)">');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('onerror="');
    expect(out).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('neutralizes a script tag in an author name', () => {
    const out = escapeHtml('Jane<script>steal()</script>');
    expect(out).not.toContain('<script');
    expect(out).toBe('Jane&lt;script&gt;steal()&lt;/script&gt;');
  });

  it('escapes all five HTML-significant characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('leaves ordinary text (including CJK) unchanged', () => {
    expect(escapeHtml('Hello 世界 123')).toBe('Hello 世界 123');
  });

  it('coerces nullish input to an empty string', () => {
    expect(escapeHtml(undefined as unknown as string)).toBe('');
    expect(escapeHtml(null as unknown as string)).toBe('');
  });
});
