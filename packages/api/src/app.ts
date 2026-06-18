import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { postsRouter } from './routes/posts.js';
import { categoriesRouter } from './routes/categories.js';
import { tagsRouter } from './routes/tags.js';
import { pagesRouter } from './routes/pages.js';
import { mediaRouter } from './routes/media.js';
import { commentsRouter } from './routes/comments.js';
import { analyticsRouter } from './routes/analytics.js';
import { observabilityRouter } from './routes/observability.js';
import { settingsRouter } from './routes/settings.js';
import { buildRouter } from './routes/build.js';
import { redirectsRouter } from './routes/redirects.js';
import { podcastsRouter } from './routes/podcasts.js';
import { appsRouter } from './routes/apps.js';
import { i18nRouter } from './routes/i18n.js';
import { searchRouter } from './routes/search.js';
import { mcpHttpHandler } from './mcp/http.js';
import { redirectMiddleware } from './middleware/redirect.js';
import { errorMiddleware } from './middleware/error.js';
import { metricsMiddleware } from './middleware/metrics.js';
import type { AppEnv } from './types.js';

export const app = new Hono<AppEnv>();

// CORS: the admin UI (Astro dev server, localhost:4321/4322/…) and the API
// (localhost:4100) are different origins in local dev, so the browser needs
// CORS headers to read API responses. Production is same-origin behind Caddy.
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return origin; // non-browser / same-origin requests
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
      if (process.env.SITE_URL && origin === process.env.SITE_URL) return origin;
      return undefined; // not allowed
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);

app.onError(errorMiddleware);

app.get('/', (c) => c.json({ status: 'ok', message: 'Wordbase API' }));
app.get('/health', (c) => c.json({ status: 'healthy' }));

// Static file serving for uploaded media (dev; production uses Caddy)
app.use('/uploads/*', serveStatic({ root: './data/uploads', rewriteRequestPath: (p) => p.replace('/uploads', '') }));

// Request observability: time every matched route (excludes /health, panel polling, static)
app.use('*', metricsMiddleware);

app.route('/api/posts', postsRouter);
app.route('/api/categories', categoriesRouter);
app.route('/api/tags', tagsRouter);
app.route('/api/pages', pagesRouter);
app.route('/api/media', mediaRouter);
// MCP-over-HTTP (Streamable HTTP transport). Registered before the broad
// `/api` comments mount so the exact path wins. Auth + scope-gating happen
// inside the handler. See mcp/http.ts.
app.on(['POST', 'GET', 'DELETE'], '/api/mcp', mcpHttpHandler);
// i18n render/pending/cache — public render (no auth) + authed pending/cache.
// Mounted before the broad `/api` comments router (mirrors the /api/mcp
// ordering) so the exact path wins.
app.route('/api/i18n', i18nRouter);
app.route('/api/search', searchRouter);
app.route('/api', commentsRouter);
app.route('/api/analytics', analyticsRouter);
app.route('/api/observability', observabilityRouter);
app.route('/api/settings', settingsRouter);
app.route('/api/build', buildRouter);
app.route('/api/redirects', redirectsRouter);
app.route('/api/podcasts', podcastsRouter);
app.route('/api/apps', appsRouter);

// Redirect middleware (catches old WP URLs and redirect table entries)
app.use('*', redirectMiddleware);
