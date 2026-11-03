import { expect, it } from 'vitest';
import type { App } from './api';
import { visibleCatalogApps } from './catalog';
it('omits unlisted apps without mutating their publication or detail data', () => {
  const rows = [{slug:'released',meta:null,status:'published'}, {slug:'unreleased',meta:'{"catalogVisibility":"unlisted","other":"preserve"}',status:'published'}, {slug:'legacy',meta:'invalid',status:'published'}] as App[];
  const before = JSON.stringify(rows);
  expect(visibleCatalogApps(rows).map(app => app.slug)).toEqual(['released','legacy']);
  expect(JSON.stringify(rows)).toBe(before);
});
