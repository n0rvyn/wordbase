# Social link previews

The homepage share title and Open Graph site name are **Julian.cafe**. Chinese copy: **我最近在折腾的东西，都放在这里。随便看看。** English: **What I’ve been making and figuring out lately. Have a look around.** Page-specific titles retain their subjects with the Julian.cafe suffix. Routing, canonical URLs and actual serving host remain `https://norvyn.com`; this branding change does not cut over the domain.

The original emblem is an orange coffee cup with cream steam on deep evergreen, using the site palette. The retained source is `packages/web/src/assets/julian-cafe-icon.png`. It was created for this project, with no text or asterisk in the icon. The 600px square image is icon-first; the 1200 × 630 card places a 456px emblem and a readable Julian.cafe signature within its central square. The same emblem supplies the PNG favicon and touch icon. Previous image URLs remain available.

Run `pnpm --filter api exec tsx ../../scripts/render-site-social.mts` with the project-supported Node runtime to reproduce the wide card, square, icon and fallback exports from the retained source. This export has no network dependency. The source generation is not required to rebuild.

Metadata includes absolute Open Graph images, known dimensions/types, alt text, square `image_src`, and Twitter large-card fields. App cards retain real app icons and actual platforms; authored covers and podcast artwork remain intact. Generated page cards use renderer version 4. No WeChat SDK, credentials, extra permissions, DNS or Caddy configuration is introduced.

QA compares square thumbnails at 32/48/64px and the wide card center crop; these are size simulations, not a claim that the Weixin client refreshed its cache. Live HTML and image bytes can be verified immediately; existing platform cards may remain cached until the platform fetches them again.
