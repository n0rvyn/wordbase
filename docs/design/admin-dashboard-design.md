# Human-readable admin dashboard

Status: dashboard and observability release, approved for production. No schema migration, credential or proxy changes. Separate SEO work is excluded.

## Purpose and hierarchy

The dashboard answers three immediate editorial questions first: which comments need review, how many drafts can be continued, and whether the latest static build succeeded. Traffic and recent posts follow. The latest build is explicitly a publishing record, not an uptime guarantee.

Drafts come from the existing content snapshot, rather than subtracting published posts from all stored posts. The writing shortcut opens the actual draft filter. Build details opens Operations directly. Traffic opens Audience. No credentials, permissions or API definitions change.

Audience, Operations and Search essentials have distinct purposes. Only the active view's sources load. Episode downloads initially show the top ten, with an explicit control retaining access to every episode. Existing reporting windows and metric definitions remain intact.

## Reading measurements

Brief observation times stay beside readings. The expandable Data sources & freshness panel retains each source, exact window, timezone, observation time, expiry and definition. Failures stay independent: missing data displays a dash and Unavailable; a measured zero displays zero. Expired snapshots remain labelled stale with their original observation time. Previously retained readings keep their old window when refresh fails.

## Presentation

Uses the existing site tokens and themes. Bounded desktop content, restrained cards, readable labels and clear actions replace undifferentiated statistics. Mobile gives the comment queue a full row, keeps drafts and build status together, then stacks traffic and posts. Public layouts and content are untouched.

## Verification

- 349 web tests pass, including validated route/filter/tab helpers and invalid or epoch timestamps.
- Astro check: zero errors, zero warnings (six existing hints).
- Local browser review at 1280×900 desktop and 390×844 mobile, light and dark. No horizontal overflow in dashboard or Audience at 390px.
- Verified draft-filter URL/request, direct Operations entry and its two-source request group, source disclosure, independent source failures, explicit stale snapshots, and show-all episode interaction.
- Browser fixtures are loopback-only synthetic data, with no production credential or content writes. Screenshots under `.preview/admin-board-design/` are synthetic UI evidence, not live metrics.
- Final build and public-preservation results are recorded privately alongside the screenshots.

Review: http://127.0.0.1:4417/admin (local Mac only). Production accuracy verification remains in `.preview/admin-accuracy-release/completion.json`; this visual redesign has not been released.

## Second design pass — owner review

The large status cards have been replaced by a compact editorial queue. Traffic now uses comparable adjacent readings plus a daily bar chart from the existing observed trends endpoint. Recent posts lead the main workspace; publishing and content counts sit beside them. Content counts share the content snapshot instead of mixing the overview and posts-list snapshots. A failed build surfaces a clear next action.

The shared admin shell now groups Workspace, Content and Manage links, uses consistent line icons and an active-page indication, and provides a fully labelled mobile menu, public-site link and skip link. It preserves existing destinations, authentication and theme persistence. No new permissions or API are required.

Verified in Chrome at desktop and 390px mobile, including light/dark, the mobile menu, Operations navigation, retained stale values after refresh failure, unavailable readings on a fresh failed load and measured zero. No horizontal overflow at 390px. Seven measurements retain exact provenance. The review server uses visibly labelled simulated data, never production credentials. Screenshots: `.preview/admin-board-design/pass-two/desktop.png`, `mobile.png`, `mobile-content.png`, `desktop-dark.png`. Local preview remains http://127.0.0.1:4417/admin. No commit, push or deployment performed.
