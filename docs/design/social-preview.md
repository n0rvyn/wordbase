# Social link previews

The homepage share title and Open Graph site name are **Julian.cafe**. The separate introduction is **我最近在折腾的东西，都放在这里。随便看看。** (English: **What I’ve been making and figuring out lately. Have a look around.**). HTML, Open Graph and Twitter titles agree; the normal search, Open Graph and Twitter descriptions all retain the introduction. Page-specific titles retain their subjects with the Julian.cafe suffix. Routing, canonical URLs and the actual serving host remain `https://norvyn.com`; this branding change does not cut over the domain.

The original emblem is an orange coffee cup with cream steam on deep evergreen, using the site palette. The retained source is `packages/web/src/assets/julian-cafe-icon.png`. It was created for this project, with no text or asterisk in the icon. The revised 600px square image fills every corner with deep green, with generous internal space around the cup and steam. The 1200 × 630 card uses the same green background, a centered 456px icon canvas and a cream Julian.cafe signature within its central square. Version 2 replaces the tight rounded tile and white corner slivers; previous URLs remain available. The same emblem supplies the PNG favicon and touch icon. Previous image URLs remain available.

Run `pnpm --filter api exec tsx ../../scripts/render-site-social.mts` with the project-supported Node runtime to reproduce the wide card, square, icon and fallback exports from the retained source. This export has no network dependency. The source generation is not required to rebuild.

Metadata includes absolute Open Graph images, known dimensions/types, alt text, square `image_src`, and Twitter large-card fields. App cards retain real app icons and actual platforms; authored covers and podcast artwork remain intact. Generated page cards use renderer version 4. No WeChat SDK, credentials, extra permissions, DNS or Caddy configuration is introduced.

The Weixin title-to-description spacing is platform-owned and is not changed by site metadata. QA compares square thumbnails at 32/48/64px and the wide card center crop; these are size simulations, not a claim that the Weixin client refreshed its cache. Live HTML and image bytes can be verified immediately; existing platform cards may remain cached until the platform fetches them again.

## Homepage title and subtitle

The owner's final direction restores the separate title and subtitle after comparing the same native share-sheet layout with Apple Music. The current version 2 cup/steam icon, its internal spacing, all artwork paths and image bytes are preserved. The temporary compact-title candidate is retained in private review evidence; its unrelated optional-tag serialization refinement is preserved. No broad checkout or worktree reversion was performed.

Other pages retain their own title and description behavior. Native Weixin layout has not been re-observed, and platform cache refresh is not asserted. No iPhone Mirroring retry, SDK integration, new permission or unrelated design change is included.
