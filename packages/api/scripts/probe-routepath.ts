// Probe: does c.req.routePath give the FULL matched pattern (low cardinality)
// after next() resolves, for nested routers + top-level timing middleware?
import { Hono } from 'hono';

const app = new Hono();
const captured: any[] = [];

app.use('*', async (c, next) => {
  const start = performance.now();
  await next();
  captured.push({
    method: c.req.method,
    routePath: c.req.routePath, // read AFTER next() — route is matched by now
    rawPath: c.req.path,
    status: c.res.status,
    ms: +(performance.now() - start).toFixed(2),
  });
});

const posts = new Hono();
posts.get('/', (c) => c.json({ ok: 'list' }));
posts.get('/:id', (c) => c.json({ ok: 'one' }));
posts.get('/:id/comments', (c) => c.json({ ok: 'comments' }));
app.route('/api/posts', posts);
app.get('/health', (c) => c.json({ ok: true }));

async function hit(method: string, path: string) {
  await app.request(path, { method });
}

await hit('GET', '/api/posts');
await hit('GET', '/api/posts/abc123');
await hit('GET', '/api/posts/abc123/comments');
await hit('GET', '/health');
await hit('GET', '/api/posts/zzz999'); // same pattern as /:id — should collapse

console.log(JSON.stringify(captured, null, 2));
