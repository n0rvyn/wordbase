import type { App } from './api';
/** Unlisted records retain their published detail routes and authored content. */
export function visibleCatalogApps(apps: App[]): App[] {
  return apps.filter(app => {
    try { return JSON.parse(app.meta || '{}').catalogVisibility !== 'unlisted'; }
    catch { return true; }
  });
}
