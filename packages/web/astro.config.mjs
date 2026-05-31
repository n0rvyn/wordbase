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
});
