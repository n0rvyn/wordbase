/** Editorial promotional media is kept in meta, independently of Apple imports. */
export type PromotionalMedia = { type: 'video' | 'animated-image' | 'image'; src: string; poster?: string; alt?: string } | { type: 'none' };

export class AppMediaError extends Error { status = 400; }

function mediaUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\\\x00-\x1f]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}

export function mergePromotionalMedia(meta: string | null, value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppMediaError('promotionalMedia must be an object');
  const data = value as Record<string, unknown>;
  if (!['none', 'video', 'animated-image', 'image'].includes(String(data.type))) throw new AppMediaError('Choose video, animated-image, image, or none');
  if (Object.keys(data).some(key => !['type', 'src', 'poster', 'alt'].includes(key))) throw new AppMediaError('Unsupported promotional-media field');
  if (data.type !== 'none' && !mediaUrl(data.src)) throw new AppMediaError('Promotional media needs a root-relative or HTTPS src');
  if (data.poster !== undefined && !mediaUrl(data.poster)) throw new AppMediaError('Invalid promotional-media poster URL');
  if (data.type === 'animated-image' && !data.poster) throw new AppMediaError('Animated images need a still poster for reduced-motion and paused states');
  if (data.alt !== undefined && (typeof data.alt !== 'string' || data.alt.length > 400)) throw new AppMediaError('Promotional-media alt text must be a string up to 400 characters');
  let base: Record<string, unknown> = {};
  if (meta) {
    try { const parsed = JSON.parse(meta); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); base = parsed; }
    catch { throw new AppMediaError('Existing meta must be a JSON object; repair it explicitly before editing promotional media'); }
  }
  delete base.video;
  delete base.videoPoster;
  if (data.type === 'none') delete base.promotionalMedia;
  else base.promotionalMedia = { type: data.type, src: data.src, ...(data.poster ? { poster: data.poster } : {}), ...(data.alt ? { alt: data.alt } : {}) };
  return Object.keys(base).length ? JSON.stringify(base) : null;
}
