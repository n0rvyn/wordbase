import type { APIRoute } from 'astro';
import { getPosts, getCategories, getTags, getPages, getApps, type Post, type Category, type Tag, type Page, type App } from '../lib/api';

export const GET: APIRoute = async ({ site }) => {
  const origin = (site?.href ?? 'https://norvyn.com/').replace(/\/$/, '');

  const [postsRes, categories, tags, pages, appsRes] = await Promise.all([
    getPosts({ status: 'published', limit: 10000 }),
    getCategories(),
    getTags(),
    getPages(),
    getApps({ status: 'published', limit: 10000 }),
  ]);

  const posts = postsRes.data;
  const apps = appsRes.data;

  const urls: { loc: string; lastmod?: string; changefreq?: string; priority: string }[] = [];

  // Homepage
  urls.push({ loc: `${origin}/`, changefreq: 'daily', priority: '1.0' });

  // Posts
  posts.forEach((post: Post) => {
    const lastmod = post.updatedAt
      ? new Date(post.updatedAt * 1000).toISOString().split('T')[0]
      : undefined;
    urls.push({ loc: `${origin}/posts/${post.slug}`, lastmod, changefreq: 'weekly', priority: '0.8' });
  });

  // Categories
  urls.push({ loc: `${origin}/categories`, changefreq: 'weekly', priority: '0.5' });
  categories.forEach((cat: Category) => {
    urls.push({ loc: `${origin}/categories/${cat.slug}`, changefreq: 'weekly', priority: '0.5' });
  });

  // Tags
  urls.push({ loc: `${origin}/tags`, changefreq: 'weekly', priority: '0.4' });
  tags.forEach((tag: Tag) => {
    urls.push({ loc: `${origin}/tags/${tag.slug}`, changefreq: 'weekly', priority: '0.3' });
  });

  // Pages
  pages
    .filter((p: Page) => p.status === 'published')
    .forEach((page: Page) => {
      urls.push({ loc: `${origin}/${page.slug}`, changefreq: 'monthly', priority: '0.6' });
    });

  // Archives
  urls.push({ loc: `${origin}/archives`, changefreq: 'monthly', priority: '0.4' });

  // Apps index + each app
  urls.push({ loc: `${origin}/apps`, changefreq: 'weekly', priority: '0.7' });
  apps.forEach((app: App) => {
    const lastmod = app.updatedAt
      ? new Date(app.updatedAt * 1000).toISOString().split('T')[0]
      : undefined;
    urls.push({ loc: `${origin}/apps/${app.slug}`, lastmod, changefreq: 'monthly', priority: '0.6' });
  });

  // Podcast index (no single-episode route exists at packages/web/src/pages/podcast/ — verified)
  urls.push({ loc: `${origin}/podcast`, changefreq: 'weekly', priority: '0.6' });

  // Writing index
  urls.push({ loc: `${origin}/writing`, changefreq: 'weekly', priority: '0.6' });

  // About
  urls.push({ loc: `${origin}/about`, changefreq: 'monthly', priority: '0.5' });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}${u.changefreq ? `\n    <changefreq>${u.changefreq}</changefreq>` : ''}
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
};
