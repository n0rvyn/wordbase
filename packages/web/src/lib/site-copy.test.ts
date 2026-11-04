import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SITE_COPY_FIELDS, resolveSiteCopy } from './site-copy';
import { SITE_COPY_FIELDS as API_FIELDS } from '../../../api/src/services/site-copy';
describe('site presentation copy', () => {
  it('keeps build and API defaults and limits identical', () => {
    expect(Object.keys(API_FIELDS)).toEqual(Object.keys(SITE_COPY_FIELDS));
    for (const key of Object.keys(SITE_COPY_FIELDS) as Array<keyof typeof SITE_COPY_FIELDS>) {
      expect(API_FIELDS[key]).toEqual({ default: SITE_COPY_FIELDS[key].default, maxLength: SITE_COPY_FIELDS[key].maxLength });
    }
  });
  it('uses safe current defaults with partial or older API responses', () => {
    expect(resolveSiteCopy().shareTitleZh).toBe('Julian.cafe');
    expect(resolveSiteCopy({ headline: '  My headline  ', introZh: '' }).headline).toBe('My headline');
    expect(resolveSiteCopy({ introZh: '' }).introZh).toBe(SITE_COPY_FIELDS.introZh.default);
  });
  it('renders authored copy as escaped text, preserving bilingual switches', () => {
    for (const file of ['../layouts/BaseLayout.astro', '../components/page-bodies/HomeBody.astro']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source).not.toMatch(/set:html=\{copy/);
      expect(source).toContain('data-l="zh"');
      expect(source).toContain('data-l="en"');
    }
  });
});
