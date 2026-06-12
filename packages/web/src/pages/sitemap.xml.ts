import type { APIRoute } from 'astro';
import { getPosts, getCategories, getTags, getPages, getApps, getPodcasts, getEpisodes, type Post, type Category, type Tag, type Page, type App, type Episode } from '../lib/api';
import { selectShow } from '../lib/podcast';
import { enHref } from '../lib/locale';

interface Entry {
  path: string;        // extensionless zh path, e.g. /posts/foo  (root = /)
  lastmod?: string;
  changefreq?: string;
  priority: string;
  bilingual: boolean;  // true => also emit /en twin + hreflang alternates
}

export const GET: APIRoute = async ({ site }) => {
  const origin = (site?.href ?? 'https://norvyn.com/').replace(/\/$/, '');

  const [postsRes, categories, tags, pages, appsRes, podcastsRes] = await Promise.all([
    getPosts({ status: 'published', limit: 10000 }),
    getCategories(),
    getTags(),
    getPages(),
    getApps({ status: 'published', limit: 10000 }),
    getPodcasts({ status: 'published', limit: 10000 }),
  ]);

  const posts = postsRes.data;
  const apps = appsRes.data;

  // Single-episode pages exist at /podcast/<slug>; podcast stays single-language
  // (zh only) — no /en twin, no hreflang alternates.
  const show = selectShow(podcastsRes.data);
  const episodes: Episode[] = show
    ? (await getEpisodes(show.slug, { status: 'published', limit: 10000 })).data
    : [];

  const entries: Entry[] = [];

  // Homepage (bilingual: /en is the en home)
  entries.push({ path: '/', changefreq: 'daily', priority: '1.0', bilingual: true });

  // Posts (bilingual)
  posts.forEach((post: Post) => {
    const lastmod = post.updatedAt ? new Date(post.updatedAt * 1000).toISOString().split('T')[0] : undefined;
    entries.push({ path: `/posts/${post.slug}`, lastmod, changefreq: 'weekly', priority: '0.8', bilingual: true });
  });

  // Categories (bilingual)
  entries.push({ path: '/categories', changefreq: 'weekly', priority: '0.5', bilingual: true });
  categories.forEach((cat: Category) => {
    entries.push({ path: `/categories/${cat.slug}`, changefreq: 'weekly', priority: '0.5', bilingual: true });
  });

  // Tags (bilingual)
  entries.push({ path: '/tags', changefreq: 'weekly', priority: '0.4', bilingual: true });
  tags.forEach((tag: Tag) => {
    entries.push({ path: `/tags/${tag.slug}`, changefreq: 'weekly', priority: '0.3', bilingual: true });
  });

  // Companion pages (bilingual)
  pages
    .filter((p: Page) => p.status === 'published')
    .forEach((page: Page) => {
      entries.push({ path: `/${page.slug}`, changefreq: 'monthly', priority: '0.6', bilingual: true });
    });

  // Archives (bilingual)
  entries.push({ path: '/archives', changefreq: 'monthly', priority: '0.4', bilingual: true });

  // Apps index + each (bilingual)
  entries.push({ path: '/apps', changefreq: 'weekly', priority: '0.7', bilingual: true });
  apps.forEach((app: App) => {
    const lastmod = app.updatedAt ? new Date(app.updatedAt * 1000).toISOString().split('T')[0] : undefined;
    entries.push({ path: `/apps/${app.slug}`, lastmod, changefreq: 'monthly', priority: '0.6', bilingual: true });
  });

  // Podcast index + each episode (SINGLE-LANGUAGE — no /en twin)
  entries.push({ path: '/podcast', changefreq: 'weekly', priority: '0.6', bilingual: false });
  episodes.forEach((ep: Episode) => {
    const lastmod = ep.updatedAt ? new Date(ep.updatedAt * 1000).toISOString().split('T')[0] : undefined;
    entries.push({ path: `/podcast/${ep.slug}`, lastmod, changefreq: 'monthly', priority: '0.6', bilingual: false });
  });

  // Writing index (bilingual)
  entries.push({ path: '/writing', changefreq: 'weekly', priority: '0.6', bilingual: true });

  // About (bilingual)
  entries.push({ path: '/about', changefreq: 'monthly', priority: '0.5', bilingual: true });

  const meta = (e: Entry) =>
    `${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ''}${e.changefreq ? `\n    <changefreq>${e.changefreq}</changefreq>` : ''}\n    <priority>${e.priority}</priority>`;

  // Dedupe by path: WordPress-imported companion pages can carry slugs that
  // collide with route names (e.g. a page slugged "categories"/"tags"), which
  // would otherwise emit a duplicate <loc>. First occurrence wins.
  const seenPath = new Set<string>();
  const deduped = entries.filter((e) => {
    if (seenPath.has(e.path)) return false;
    seenPath.add(e.path);
    return true;
  });

  const urlBlocks: string[] = [];
  for (const e of deduped) {
    const zhUrl = `${origin}${e.path === '/' ? '/' : e.path}`;
    if (!e.bilingual) {
      urlBlocks.push(`  <url>\n    <loc>${zhUrl}</loc>${meta(e)}\n  </url>`);
      continue;
    }
    const enUrl = `${origin}${enHref(e.path)}`;
    // Per the sitemap hreflang spec, every URL in a localized set lists the
    // full alternate group (including a self-reference); x-default points to zh.
    const alts =
      `\n    <xhtml:link rel="alternate" hreflang="zh-CN" href="${zhUrl}"/>` +
      `\n    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}"/>` +
      `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${zhUrl}"/>`;
    urlBlocks.push(`  <url>\n    <loc>${zhUrl}</loc>${meta(e)}${alts}\n  </url>`);
    urlBlocks.push(`  <url>\n    <loc>${enUrl}</loc>${meta(e)}${alts}\n  </url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlBlocks.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
};
