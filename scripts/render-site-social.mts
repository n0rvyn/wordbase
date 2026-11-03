/** Deterministic first-party artwork. No network or image generation service. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderSiteOgImage } from '../packages/web/src/lib/og-image';
const publicDir = fileURLToPath(new URL('../packages/web/public/', import.meta.url));
mkdirSync(publicDir + 'social', { recursive: true });
const wide = await renderSiteOgImage();
writeFileSync(publicDir + 'social/norvyn-v2.png', wide);
writeFileSync(publicDir + 'social/norvyn-square-v2.png', await renderSiteOgImage(true));
writeFileSync(publicDir + 'og-image.png', wide); // Preserve the established asset URL.
console.log('Rendered crop-safe wide/square norvyn social artwork.');
