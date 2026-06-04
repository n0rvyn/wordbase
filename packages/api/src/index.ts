import './env.js'; // load repo-root .env first (before db/index reads process.env)
import { serve } from '@hono/node-server';
import { app } from './app.js';
import { initializeDatabase } from './db/index.js';
import { initGeoip } from './lib/geoip.js';

const port = parseInt(process.env.PORT || '4100', 10);

console.log('Initializing database...');
initializeDatabase();

// Fire-and-forget: downloads/auto-updates the GeoLite2 DB in the background so
// boot isn't blocked on the network. Country lookups degrade to null until ready.
void initGeoip();

console.log(`Starting API server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`API server running on http://localhost:${port}`);
