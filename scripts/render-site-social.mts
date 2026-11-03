/** Deterministic first-party artwork. No network or image generation service. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderSiteOgImage, renderBrandIcon } from '../packages/web/src/lib/og-image';
const publicDir = fileURLToPath(new URL('../packages/web/public/', import.meta.url));
mkdirSync(publicDir + 'social', { recursive: true });
const wide = await renderSiteOgImage();
writeFileSync(publicDir + 'social/julian-cafe-v1.png', wide);
writeFileSync(publicDir + 'social/julian-cafe-square-v1.png', await renderSiteOgImage(true));
writeFileSync(publicDir + 'og-image.png', wide); // Preserve the established asset URL.
console.log('Rendered crop-safe wide/square Julian.cafe social artwork.');

writeFileSync(publicDir + 'social/julian-cafe-icon-v1.png', await renderBrandIcon(512));
writeFileSync(publicDir + 'apple-touch-icon.png', await renderBrandIcon(180));
writeFileSync(publicDir + 'favicon.png', await renderBrandIcon(48));
