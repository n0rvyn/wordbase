import { marked } from 'marked';

/**
 * Render Markdown → HTML for content bodies (posts, companion pages).
 *
 * Adds native lazy-loading + async decode to content images: markdown carries
 * no intrinsic dimensions, so we can't emit width/height, but loading="lazy"
 * keeps below-fold images from blocking the initial load. `alt` is already
 * emitted by marked from the image's alt text.
 *
 * marked.parse is used synchronously (no async extensions configured), matching
 * the existing call sites.
 */
export function markdownToHtml(md: string): string {
  const html = marked.parse(md) as string;
  return html.replace(/<img /g, '<img loading="lazy" decoding="async" ');
}
