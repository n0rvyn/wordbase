/**
 * HTML-entity-encode untrusted text before interpolating it into an HTML string.
 *
 * Use this wherever a client-side renderer builds markup as a string and assigns
 * it to `innerHTML` (e.g. CommentSection's comment list), because Astro's
 * compile-time escaping and Preact's JSX escaping do NOT apply to runtime
 * `innerHTML` writes. Comment author names and bodies are anonymous, public
 * input, so they must be encoded at this output boundary.
 */
export function escapeHtml(value: string): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return ch;
    }
  });
}
