import type { Post, App, Podcast, SiteIdentity } from './api.js';

/**
 * Build the `llms.txt` Markdown index for the site. Follows the llmstxt.org
 * format: H1 site name, blockquote summary, then `## Section` groups with
 * `- [title](absolute-url)` entries. Pure: no I/O, no Date.now() — sort + cap
 * are deterministic from input.
 *
 * `origin` must already be trimmed of trailing slash.
 *
 * Writing is capped at the 30 most-recent posts (newest first by publishedAt,
 * falling back to createdAt). Apps and podcasts are emitted in the order
 * passed in — the caller controls sort (the endpoint sorts by recency when
 * the loader returns it).
 */
const RECENT_POSTS = 30;

export interface LlmsSections {
  posts: Post[];
  apps: App[];
  podcasts: Podcast[];
}

export function buildLlmsTxt(
  sections: LlmsSections,
  origin: string,
  id: SiteIdentity,
): string {
  const lines: string[] = [];

  // H1 + summary blockquote
  lines.push(`# ${id.name}`);
  lines.push('');
  lines.push(`> ${id.description}`);
  lines.push('');

  // Writing — sort newest first, cap at RECENT_POSTS
  if (sections.posts.length > 0) {
    const sortedPosts = [...sections.posts].sort(
      (a, b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt),
    );
    const recent = sortedPosts.slice(0, RECENT_POSTS);
    lines.push('## Writing');
    lines.push('');
    for (const post of recent) {
      lines.push(`- [${post.title}](${origin}/posts/${post.slug})`);
    }
    lines.push('');
  }

  // Apps
  if (sections.apps.length > 0) {
    lines.push('## Apps');
    lines.push('');
    for (const app of sections.apps) {
      lines.push(`- [${app.name}](${origin}/apps/${app.slug})`);
    }
    lines.push('');
  }

  // Podcast
  if (sections.podcasts.length > 0) {
    lines.push('## Podcast');
    lines.push('');
    for (const show of sections.podcasts) {
      lines.push(`- [${show.title}](${origin}/podcasts/${show.slug})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
