import { serve } from '@hono/node-server';
import { app } from './app.js';
import { initializeDatabase } from './db/index.js';

const port = parseInt(process.env.PORT || '4100', 10);

console.log('Initializing database...');
initializeDatabase();
console.log(`Starting API server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`API server running on http://localhost:${port}`);
