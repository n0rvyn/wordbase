import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import preact from '@astrojs/preact';

export default defineConfig({
  site: 'https://norvyn.com',
  output: 'static',
  server: { port: 4321 },
  build: {
    outDir: './dist',
    format: 'file',
  },
  integrations: [tailwind(), preact()],
  // Read the SINGLE repo-root .env (matches packages/api/src/env.ts) so the
  // client build picks up PUBLIC_SITE_URL regardless of build cwd.
  vite: {
    envDir: fileURLToPath(new URL('../../', import.meta.url)),
    // Dev-only: uploaded media lives behind the API on :4100, but pages are
    // served from :4321, so a relative /uploads/* <img> would 404 in dev.
    // Proxy it to the API so dev mirrors prod (where Caddy serves /uploads).
    // `astro build` (static) ignores server.proxy — zero prod/build impact.
    server: {
      proxy: {
        '^/uploads/.*': { target: 'http://localhost:4100', changeOrigin: true },
      },
    },
  },
});
