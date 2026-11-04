export function shortUtc(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || !Number.isFinite(new Date(ms).getTime())) return 'Not recorded';
  return (
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: new Date(ms).getUTCFullYear() === new Date().getUTCFullYear() ? undefined : 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ms)) + ' UTC'
  );
}
export function buildLabel(status: string | undefined): string {
  return (
    (
      {
        success: 'Succeeded',
        failed: 'Failed',
        building: 'Building',
        requested: 'Queued',
        idle: 'Not recorded',
      } as Record<string, string>
    )[status ?? ''] ?? 'Unavailable'
  );
}
export function postFilter(search: string): string {
  const status = new URLSearchParams(search).get('status') ?? '';
  return ['draft', 'published', 'archived'].includes(status) ? status : '';
}
export type ObservationTab = 'audience' | 'health' | 'seo' | 'quality' | 'posts';
export function observationTab(hash: string): ObservationTab {
  return hash === '#posts' ? 'posts' : hash === '#quality' ? 'quality' : hash === '#health' ? 'health' : hash === '#seo' ? 'seo' : 'audience';
}
export const observationKeys: Record<ObservationTab, readonly string[]> = {
  audience: [
    'data-quality',
    'visits',
    'trends',
    'top-pages',
    'referrers',
    'shares',
    'regions',
    'devices',
    'podcast-summary',
    'podcast-trends',
    'podcast-episodes',
    'podcast-clients',
  ],
  posts:['post-metrics'],
  quality: ['data-quality'],
  health: ['requests', 'system'],
  seo: ['seo-health'],
};
