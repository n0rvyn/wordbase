/** Editorial promotional media is kept in meta, independently of Apple imports. */
export type PromoItem = { type: 'video' | 'animated-image' | 'image'; src: string; poster?: string; alt?: string; id?: string; label?: string; width?: number; height?: number };
export type PromotionalMedia = PromoItem | { items: PromoItem[] } | { type: 'none' };
export const MAX_APP_PROMOS = 12;
export class AppMediaError extends Error { status = 400; }

function mediaUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\\\x00-\x1f]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
function item(value: unknown): PromoItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppMediaError('Each promo must be an object');
  const data = value as Record<string, unknown>;
  if (!['video', 'animated-image', 'image'].includes(String(data.type))) throw new AppMediaError('Choose video, animated-image, or image for each promo');
  if (Object.keys(data).some(key => !['type', 'src', 'poster', 'alt', 'id', 'label', 'width', 'height'].includes(key))) throw new AppMediaError('Unsupported promotional-media field');
  if (!mediaUrl(data.src)) throw new AppMediaError('Promotional media needs a root-relative or HTTPS src');
  if (data.poster !== undefined && !mediaUrl(data.poster)) throw new AppMediaError('Invalid promotional-media poster URL');
  if (data.type === 'animated-image' && !data.poster) throw new AppMediaError('Animated images need a still poster for reduced-motion and paused states');
  if (data.alt !== undefined && (typeof data.alt !== 'string' || data.alt.length > 400)) throw new AppMediaError('Promotional-media alt text must be a string up to 400 characters');
  if (data.id !== undefined && (typeof data.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(data.id))) throw new AppMediaError('Invalid promo identifier');
  if (data.label !== undefined && (typeof data.label !== 'string' || !data.label.trim() || data.label.length > 160)) throw new AppMediaError('Promo label must be 1–160 characters');
  if (data.width !== undefined || data.height !== undefined) {
    if (![data.width, data.height].every(n => typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 16384)) throw new AppMediaError('Promo dimensions must include valid integer width and height');
  }
  return { ...data } as PromoItem;
}
export function mergePromotionalMedia(meta: string | null, value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppMediaError('promotionalMedia must be an object');
  const data = value as Record<string, unknown>;
  let normalized: PromoItem | { items: PromoItem[] } | null;
  if ('items' in data) {
    if (Object.keys(data).some(key => key !== 'items') || !Array.isArray(data.items) || !data.items.length || data.items.length > MAX_APP_PROMOS) throw new AppMediaError(`Use items with 1–${MAX_APP_PROMOS} promos, or type:none to remove`);
    const items = data.items.map(item);
    if (new Set(items.map(m => m.src)).size !== items.length) throw new AppMediaError('Duplicate promo source');
    const ids = items.flatMap(m => m.id ? [m.id] : []);
    if (new Set(ids).size !== ids.length) throw new AppMediaError('Duplicate promo identifier');
    normalized = { items };
  } else if (data.type === 'none') {
    if (Object.keys(data).some(key => key !== 'type')) throw new AppMediaError('type:none cannot include media fields');
    normalized = null;
  } else normalized = item(data);
  let base: Record<string, unknown> = {};
  if (meta) {
    try { const parsed = JSON.parse(meta); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); base = parsed; }
    catch { throw new AppMediaError('Existing meta must be a JSON object; repair it explicitly before editing promotional media'); }
  }
  delete base.video;
  delete base.videoPoster;
  if (normalized === null) delete base.promotionalMedia;
  else base.promotionalMedia = normalized;
  return Object.keys(base).length ? JSON.stringify(base) : null;
}
