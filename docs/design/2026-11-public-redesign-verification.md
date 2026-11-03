# Private preview verification

This report records the original isolated-checkout verification. For reconciliation into Wordbase Work, fresh test/build/route results, the workspace preview on port 4413 and the hosted review blocker, see [Wordbase Work review](2026-11-wordbase-work-review.md). Media fixtures and external-project video copies were not transferred into the workspace.

Implementation branch: `redesign/curated-public-preview`, based on `d5779441b54ea567c450c090d22ec2035be34b7b`. Work is isolated from the original Wordbase checkout and its existing untracked content updates. Production release remains deferred for owner review.

## Automated results

- API: 62 test files, **1,008 tests passed**; TypeScript build passed.
- Web: 19 test files, **316 tests passed**.
- Astro source check: **0 errors, 0 warnings**, 6 hints. Generated `dist` is excluded from source checking; it previously caused the language checker to scan minified output and race a rebuild.
- Final static build: **872 pages built**, successful.
- Complete sitemap baseline: **829 URLs** return 200 and retain the advertised public canonical path. Public styles are enabled on every checked page.
- **60 Chinese/English privacy, support and terms pages** retain identical normalized prose and in-body link targets, with direct 200 responses.
- Blog/podcast feeds: GUIDs, item links, enclosure URLs/types/lengths and transcript links unchanged.
- Real missing route returns 404; preview POSTs return 405.
- `git diff --check`, Python syntax and deployment shell syntax pass.

Raw evidence lives in ignored `.preview/`: `media-api-tests.log`, `api-build.log`, `media-web-tests.log`, `astro-check.log`, `web-build.log`, `route-baseline.json`, `route-verification.json` and `public-project-link-audit.json`.

## Browser checks

- 28 representative route checks at 320px: English/light and Chinese/dark home, journal, catalog, podcast, app detail, article, about, search, companion, taxonomy, archives and missing-page views. No horizontal overflow remains. Extra visual captures at 390px and 1280px.
- Fixed two observed visual issues: a translated home CTA inherited arrow sizing, and related-app metadata overflowed the 320px app-detail layout. Actual public CSS root marker is verified in rendered HTML.
- Light/Dark selection works and persists across navigation. Selecting System resolves to the browser's actual dark OS preference. Pure helper tests cover both OS preferences; the operating-system setting itself was not changed.
- Mobile navigation opens/closes and includes search. `/` opens search outside editable controls.
- English/Chinese switching changes the corresponding URL, language and labels without losing the selected theme.
- App macOS filter shows exactly Model Proxy; screenshot dialog expands, closes with Escape and restores focus to its opener.
- Journal title search `AI` shows 11 matching stories. Project search `wordbase` shows one repository. All 12 repository URLs return public GitHub API records (`private: false`) without authentication.
- Search page `AI` returns 20 results with correct English article links; clearing removes the results. Loading/error/empty states remain visitor-facing information.
- Real podcast playback reached `readyState=4`, duration 1,758.648 seconds and advanced to 26.63 seconds; native pause worked. The preview resolved the actual media from cached episode metadata and did not call production's download-counting endpoint. Audio retains `preload="none"`.
- Public copy audit removed implementation/design explanations, original-aspect captions, development-progress notes, a technical colophon and stale About claims. Authored articles and protected legal content were preserved.

Independent media review also verified the approved prototype’s actual MP4 and found a missing structured authoring path. The implementation now accepts explicit promotional media through existing MCP/REST tools, including video uploads. A separate in-memory fixture exercised actual validated MCP create/update, proposal readback and selected-field import review; promotion and unrelated metadata survived.

A landscape MP4 with an audio track played muted (`readyState=4`, time advanced to 4.94s); its rendered ratio was 1.77774 against natural 1.77778. A portrait GIF rendered at its exact 0.5625 ratio. Scrolling out of view paused the MP4 and removed the animated source while displaying a frozen 180×320 canvas. Both manual pauses survived expanded-view open/close. Expanded animation played while background media paused; Escape closed it and restored opener focus. At 320px, the fixture had no horizontal overflow and retained both ratios. Reduced-motion/save-data/background-tab policies have pure tests; OS/network preferences were not changed. Evidence: `.preview/media-fixture/authoring-verification.json` and `runtime-verification.json`.

Screenshots are in `.preview/screenshots/`: home desktop light/dark, home mobile light, apps desktop/mobile light, journal desktop light and podcast desktop System, plus `apps-media-fixture.jpg` and `apps-media-fixture-expanded.jpg`.

## Rollback rehearsal

Disposable fixture only, with service commands mocked. `snapshot-release.sh` created a consistent SQLite/artifact snapshot and rejected destinations inside the checkout, served roots and symlink aliases. Corrupted checksums stopped rollback before service commands. `restore-release.sh` restored prior frontend source/output while retaining the reviewed-import API and current database. Evidence: `.preview/safety-review.json`.

Deployment now refuses an unaccounted dirty checkout or alternate/detached branch and uses a fast-forward-only pull. No production deployment, service restart, backup or rollback has been performed.

## Remaining review boundaries

- Existing real catalog rows have no assigned promotional media. The populated synthetic fixture verifies video/GIF behavior, upload support and editorial tools; actual app videos/GIFs and their app mapping still need editorial selection. Existing apps retain their real screenshot fallback. See `promotional-media-and-catalog-review.md` for authoring and review access.
- Existing English content falls back to source text where no approved rendition exists. This preserves the current content; no new translations were invented.
- Comment/feedback/catalog writes are blocked in the private preview. Their API behavior is verified in isolated tests rather than posting to production.
- Live production scheduler/configuration and actual production DB-path overrides must be read immediately before an authorized release. Official ASC URL readback was completed during investigation; no ASC fields changed.
- Public GET audits may register normal server request metrics; the explicit initial podcast-feed baseline read may register a feed poll. Preview playback and repeated feed browsing bypass production counting routes.

See `2026-11-public-redesign-release.md` for the release gate and attended rollback procedure.
