# Approved design comparison and full-site review

Date: 2026-11-03. Reference: `https://norvyn-design-study.n0rvyn.chatgpt.site/` (the live approved study, rather than the older Geist-based reference files in this repository).

Review entry: **http://127.0.0.1:4413/__review**. This local-only index links to complete Chinese/English home, writing, article, apps, app-detail, About and search pages, plus the podcast show, full episode, archives, taxonomy, companion pages and 404. These are the actual built Wordbase routes. The index is served by the preview script and is not included in the public build or sitemap.

## Concrete differences corrected

| Surface | Previous difference | Result |
| --- | --- | --- |
| Shared typography | Earlier Geist/Newsreader system remained visible throughout | DM Sans with Noto Sans SC and Georgia, matching the live study. |
| Width and color | 1440px layout contract, different paper/ink/accent shades | 1280px content width, study light/dark paper, ink, surfaces and orange accent. Existing explicit user accent preferences remain compatible. |
| Header | 112px header, icon-only search, mobile hamburger | 100px desktop header, compact appearance/search controls and the four visible mobile destinations. The existing language control remains. |
| Home | Larger hero, different portal proportions, full-width writing followed by a separate large credo and additional app/podcast sections | Study hero sizing and Georgia italic; 1:1.08:1 staggered portals with matching paper/record geometry; three recent stories next to a compact credo. The additional homepage sections were removed; all work remains accessible through the portals/navigation. Real app artwork remains in the apps portal. |
| Footer | Large tinted multi-column footer | Compact wordmark, signature, About/Contact and copyright. Taxonomy/archive/GitHub navigation remains available under More. |
| Journal | Oversized heading, lead-story scale, spacing and long excerpt | Study heading/feature proportions, two-line lead excerpt, compact two-column archive rows and date rail. All 141 real posts remain in the index. |
| Article | Left metadata rail, duplicated excerpt and author byline before the body | Centered 740px reading column, category/date eyebrow, title then full body. Contents/share remain accessible in an expandable section. Full article text, comments, adjacent navigation, SEO and URLs remain. |
| Apps | Different card proportions and generic lavender surfaces | Study card spacing/type/media proportions and tints derived from each app's configured accent. Intrinsic image ratios, platform/search filtering and expandable screenshots remain. |
| Podcast | Subscription row before artwork; a dense archive repeating players, summaries and feedback for every episode | Subscription links beside the featured listening experience; compact linked episode shelf. One real featured player and all 59 archive episode links; every full episode retains its player, transcript and feedback. Featured transcript/feedback are expandable. |
| Other public pages | Old shared type/color/width | App detail, About, search, taxonomy, archives, legal/companion pages and episode detail inherit the revised shared styles. Protected bodies and links remain unchanged. |

## Verification

- Web: **316 tests passed** across 19 files.
- Final Astro build: **872 pages**. Astro source check: **0 errors, 0 warnings, 6 hints**.
- Complete saved baseline: **829 URLs**, **60 protected privacy/support/terms pages**, **2 feeds**; zero failures. This used the frozen public cache and did not recapture production.
- Browser geometry: **27 checks** across home, writing, apps, full article, podcast show, full episode, app detail, About and search at **1280px, 390px and 320px**; no horizontal overflow. All 27 final checks used dark mode. Additional light-mode 320px checks covered those page types before the final podcast shelf adjustment, plus taxonomy and a protected privacy page; the English full article was checked again in light mode after the final build.
- Visually inspected the approved study's home, journal, apps, podcast and article, plus mobile home, then the corresponding local layouts. The prototype-only toolbar and future-subdomain labels are deliberately absent.
- Mobile app filter returned exactly Model Proxy. Its screenshot opened in the dialog; Escape closed it and restored focus to the opener.
- Cached `AI` search returned 20 results. Switching to English preserved dark mode; selecting light persisted through navigation. The English full article rendered all **3,173 text characters**, rather than the study's two-paragraph sample.
- Podcast navigation reached the full stored episode route; the show page contains one real audio player and 59 linked archive episodes. Audio markup retains `preload="none"`; no production download tracker was exercised during this comparison.
- `git diff --check` and preview Python syntax passed. All seven pre-existing `docs/content-updates/` files retain their recorded hashes.

Rerun evidence: `.preview/parity-web-tests.log`, `parity-web-build.log`, `parity-astro-check.log`, `parity-route-check.log`, `parity-browser-checks.json`. Earlier workspace API tests (1,008 passed) remain valid; this comparison changed frontend/layout and local-preview code only.

## Remaining differences and boundaries

This is closer to the approved visual composition, not a claim of pixel-identical content. Real post titles, dates, categories, translations and publication order are preserved. The study has 14 selected stories; Wordbase has 141. The study shows 11 curated apps and 19 repository entries, while this frozen Wordbase build has nine published apps and the existing 12-project list. EXT4 Access/Nearly catalog additions and the additional repository records were not silently published or fabricated during visual correction.

The actual podcast artwork remains; the study's orange-sun artwork was labelled as a cover proposal. Real screenshot fallbacks remain where no approved Wordbase promotional video is assigned. External-project video copies were not accessed or used. Those editorial/media selections remain pending, as do English renditions that do not exist in the source.

No Sites source connection, source upload, hosted release, production deployment, DNS/subdomain change or ASC change was attempted during this follow-up. The separately pending Sites source-disclosure approval remains pending. Admin remains deferred.

If the local server is no longer running, restart from this workspace with `python3 scripts/start-private-preview.py`; no credentials are required. This launcher detaches the offline server from the terminal and records its PID in `.preview/review-server.json` and output in `.preview/review-server.log`. Repeated launches reuse a healthy Wordbase server. It binds only to `127.0.0.1:4413`; the URL works on this Mac, while an iPhone's `127.0.0.1` points to that phone. No LAN exposure, firewall changes or automatic login startup is configured. Builds use `API_URL=http://127.0.0.1:4413 PUBLIC_SITE_URL=http://127.0.0.1:4413` and the working Node runtime under `.preview/runtime/`.
