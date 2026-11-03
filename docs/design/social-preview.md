# Social link previews

The Open Graph site name is **Julian.cafe**. The homepage title carries the complete introduction (see “Homepage content consolidation” below), while its separate Open Graph/Twitter description is explicitly empty. The normal search description is preserved: **我最近在折腾的东西，都放在这里。随便看看。** / **What I’ve been making and figuring out lately. Have a look around.** Page-specific titles retain their subjects with the Julian.cafe suffix. Routing, canonical URLs and the actual serving host remain `https://norvyn.com`; this branding change does not cut over the domain.

The original emblem is an orange coffee cup with cream steam on deep evergreen, using the site palette. The retained source is `packages/web/src/assets/julian-cafe-icon.png`. It was created for this project, with no text or asterisk in the icon. The revised 600px square image fills every corner with deep green, with generous internal space around the cup and steam. The 1200 × 630 card uses the same green background, a centered 456px icon canvas and a cream Julian.cafe signature within its central square. Version 2 replaces the tight rounded tile and white corner slivers; previous URLs remain available. The same emblem supplies the PNG favicon and touch icon. Previous image URLs remain available.

Run `pnpm --filter api exec tsx ../../scripts/render-site-social.mts` with the project-supported Node runtime to reproduce the wide card, square, icon and fallback exports from the retained source. This export has no network dependency. The source generation is not required to rebuild.

Metadata includes absolute Open Graph images, known dimensions/types, alt text, square `image_src`, and Twitter large-card fields. App cards retain real app icons and actual platforms; authored covers and podcast artwork remain intact. Generated page cards use renderer version 4. No WeChat SDK, credentials, extra permissions, DNS or Caddy configuration is introduced.

The Weixin title-to-description spacing is platform-owned and is not changed by site metadata. QA compares square thumbnails at 32/48/64px and the wide card center crop; these are size simulations, not a claim that the Weixin client refreshed its cache. Live HTML and image bytes can be verified immediately; existing platform cards may remain cached until the platform fetches them again.

## Homepage content consolidation

The homepage title is a complete compact message: **Julian.cafe · 最近做的东西，和想说的话** (English: **Julian.cafe · Things I’m making and thinking about**). HTML, Open Graph and Twitter titles agree, with no second brand suffix. Homepage Open Graph/Twitter descriptions are explicitly empty to avoid supplying the same introduction again in a separate social field. The normal HTML search description is unchanged. Other pages retain their own title and description behavior.

This is a content adjustment, not a native layout change. Clients can ignore or fall back from empty social fields to the ordinary search description; the actual Weixin extension behavior is not asserted without observation. The user's prior screenshots establish that the existing share path displays the site's supplied title text, but do not identify which description fallback it uses. iPhone Mirroring access was not approved, and was not retried. No SDK integration, image-ratio experiment or unrelated design change is included.
