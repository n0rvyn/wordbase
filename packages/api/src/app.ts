import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { postsRouter } from './routes/posts.js';
import { categoriesRouter } from './routes/categories.js';
import { tagsRouter } from './routes/tags.js';
import { pagesRouter } from './routes/pages.js';
import { mediaRouter } from './routes/media.js';
import { commentsRouter } from './routes/comments.js';
import { analyticsRouter } from './routes/analytics.js';
import { settingsRouter } from './routes/settings.js';
import { buildRouter } from './routes/build.js';
import { redirectsRouter } from './routes/redirects.js';
import { podcastsRouter } from './routes/podcasts.js';
import { appsRouter } from './routes/apps.js';
import { redirectMiddleware } from './middleware/redirect.js';
import { errorMiddleware } from './middleware/error.js';
import type { AppEnv } from './types.js';

export const app = new Hono<AppEnv>();

app.onError(errorMiddleware);

app.get('/', (c) => c.json({ status: 'ok', message: 'Wordbase API' }));
app.get('/health', (c) => c.json({ status: 'healthy' }));

// Static file serving for uploaded media (dev; production uses Caddy)
app.use('/uploads/*', serveStatic({ root: './data/uploads', rewriteRequestPath: (p) => p.replace('/uploads', '') }));

app.route('/api/posts', postsRouter);
app.route('/api/categories', categoriesRouter);
app.route('/api/tags', tagsRouter);
app.route('/api/pages', pagesRouter);
app.route('/api/media', mediaRouter);
app.route('/api', commentsRouter);
app.route('/api/analytics', analyticsRouter);
app.route('/api/settings', settingsRouter);
app.route('/api/build', buildRouter);
app.route('/api/redirects', redirectsRouter);
app.route('/api/podcasts', podcastsRouter);
app.route('/api/apps', appsRouter);

// Redirect middleware (catches old WP URLs and redirect table entries)
app.use('*', redirectMiddleware);
