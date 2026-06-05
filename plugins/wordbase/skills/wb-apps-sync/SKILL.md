---
name: wb-apps-sync
description: Sync WordBase app entries from App Store Connect and show the result. Use when the user wants to refresh app metadata, pull the latest App Store data, or says "sync my apps".
---

# WordBase apps sync

Refresh the App Store data backing the WordBase apps section via the `wordbase` MCP server.

1. Call `app_sync_all` to pull the latest App Store Connect data for all tracked apps.
2. **Trigger a site rebuild — this step is mandatory, not optional.** `app_sync_all` only writes the database; the public `/apps/*` pages are **static Astro output**, so a sync is invisible on the live site until the site is rebuilt. Call `blog_trigger_build` (it rebuilds the whole site, apps included), then poll `blog_build_status` until `status` is `success` (or `failed`). Skipping this is the #1 cause of "I synced but the page still shows the old version/images".
3. Call `app_list` to show the resulting app entries.
4. Summarize what changed: which apps synced, any that errored, and that the rebuild completed. For every app the user is asking about, report its **screenshot count, `icon` URL, and `lastSyncedAt`** — so a "nothing changed" outcome is visible rather than silent.

## What sync can and cannot pull

WordBase mirrors the **live** App Store listing; it never invents data.

- **Screenshots / subtitle / whatsNew / version / category** come from **App Store Connect**, read from the version whose `appStoreState` is `READY_FOR_SALE` (the released one). A newer version still in `PREPARE_FOR_SUBMISSION` / in review is deliberately ignored, so its not-yet-released assets will NOT appear until that version goes live. Screenshots are read from the `zh-Hans` localization first, else the first localization — assets uploaded only to another locale won't show.
- **icon / rating / price / description** come from the **iTunes Lookup** storefront API, which is CDN-cached and can lag the real store by hours. A freshly changed icon often stays stale even after the version date has already moved.
- Every field falls back to the current DB value, so a sync never blanks out existing data.

## "I updated App Store images today but they didn't change"

Diagnose in this order — the first cause is the common one, and it is on the WordBase side:

1. **Did the site get rebuilt?** Compare the dynamic API against the static page:
   - API (DB): `curl -s 'https://norvyn.com/api/apps?limit=20'` → the app's `version` / `screenshots`.
   - Static page: open `/apps/<slug>` and read the rendered version/images.
   - If the **API already shows the new data but the page shows old** → the static build is stale. This is the #1 cause. Run `blog_trigger_build` and poll `blog_build_status` until `success`; the page updates within ~30s. (Step 2 above prevents this — never report a sync as done without rebuilding.)
2. **If the API itself still shows old data**, the sync didn't get new data from Apple. Check what Apple actually serves:
   - **ASC**: `GET /v1/apps/<appStoreId>/appStoreVersions?include=appStoreVersionLocalizations` → find the `READY_FOR_SALE` version → its `appScreenshotSets`. If it still lists the old files, ASC itself has not taken the change.
   - **Storefront**: `curl 'https://itunes.apple.com/lookup?id=<appStoreId>&country=cn'` → inspect `screenshotUrls` / `ipadScreenshotUrls` / `artworkUrl512`.
   - If both Apple sources still show old assets → WordBase is correct; wait for Apple to propagate, or confirm the edit was saved to the **live** version's `zh-Hans` localization (not a draft/next version, not another locale). An icon change can lag the iTunes CDN for hours.

Note: app sync requires the API key to hold the `apps:write` scope and the server to have valid App Store Connect credentials (`ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_PRIVATE_KEY_PATH`). If `app_sync_all` returns an auth/credential error, report it plainly rather than retrying.
