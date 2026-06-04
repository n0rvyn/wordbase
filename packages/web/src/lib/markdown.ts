/**
 * Shared Markdown marker stripping. Single source of truth for turning raw
 * Markdown into plain text — consumed by both `stripMarkdown` (api.ts, blurbs)
 * and the transcript segmenter (transcript.ts). Pure string logic, no DOM/fetch,
 * so it is safe to import into client bundles.
 */

export interface StripInlineOptions {
  /**
   * How to treat inline/block code spans:
   * - 'drop' (default): remove the span entirely — right for preview blurbs.
   * - 'keep': keep the code's text content — right for spoken transcripts,
   *   where the words inside backticks were read aloud.
   */
  code?: 'drop' | 'keep';
}

/**
 * Strip Markdown markers (headings, images, links, bold, italic, code, list
 * bullets, numbered lists, blockquotes) from `md`, returning the text content.
 * Does NOT collapse newlines or truncate — callers compose those as needed.
 * Line-anchored markers use the `m` flag, so pass text with its newlines intact
 * (strip before collapsing) for multi-line blocks to be cleaned per line.
 */
export function stripInlineMarkdown(md: string, opts: StripInlineOptions = {}): string {
  const code = opts.code ?? 'drop';
  let out = md
    .replace(/^#{1,6}\s+/gm, '')           // headings
    .replace(/!\[.*?\]\(.*?\)/g, '')        // images
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')  // links → text
    .replace(/(\*\*|__)(.*?)\1/g, '$2')     // bold
    .replace(/(\*|_)(.*?)\1/g, '$2');       // italic
  out = code === 'keep'
    ? out.replace(/`{1,3}([^`]*)`{1,3}/g, '$1') // keep code content (spoken)
    : out.replace(/`{1,3}[^`]*`{1,3}/g, '');    // drop code span (preview)
  return out
    .replace(/^[-*+]\s+/gm, '')             // list markers
    .replace(/^\d+\.\s+/gm, '')             // numbered lists
    .replace(/^>\s+/gm, '');                // blockquotes
}
