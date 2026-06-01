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
  },
});
