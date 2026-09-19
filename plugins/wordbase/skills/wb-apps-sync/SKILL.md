---
name: wb-apps-sync
model: haiku
description: Sync WordBase app entries from App Store Connect — pick up apps newly released on the App Store and refresh the ones already tracked — and show the result. Use when the user wants to refresh app metadata, pull the latest App Store data, add new apps to the site, or says "sync my apps".
---

# WordBase apps sync

Bring the WordBase apps section in line with App Store Connect via the `wordbase` MCP server. "Sync" means BOTH halves: apps that exist in ASC but not on the site yet, and fresh data for the ones already there. `app_sync` alone only does the second half — it never creates a row, so a newly released app stays invisible no matter how often you sync (2026-09-19: two live App Store apps were missing from /apps for exactly this reason).

1. **Discover new apps first.** Call `app_discover`. It creates a **draft** row for every ASC app the site does not track yet (matched by App Store ID) and leaves existing rows untouched. `created` = the new rows; an empty `created` is normal.
2. **Sync everything.** Call `app_sync` with **no `id`**. This covers every app with an App Store ID, drafts included, so the rows `app_discover` just created get their icon / description / screenshots / version here. (Pass `id` to sync a single app.)
3. **Check `rebuildTriggered` in the result.** `app_sync` rebuilds the site itself whenever a **published** app actually changed — the `/apps/*` pages are static Astro output, so this is what makes a sync visible. If `rebuildTriggered` is `true`, poll `build_status` until `status` is `success` (or `failed`). If it is `false`, confirm why from the same result: either `changed` is empty (nothing differed — a normal outcome) or the changed apps are all `draft` (they render no public page).
4. **New apps are drafts — the user decides which go public.** For each row from step 1, check the sync result: if its slug is in `notOnAnyStorefront`, the app is not on sale anywhere yet — recommend keeping it a draft. Otherwise it is live on the App Store. Name these apps and ask which to publish; do NOT publish on your own (it puts a page on the public site). Also call out an app found only on a non-CN storefront (`storefront` ≠ `cn` in its `changed` entry) — its price and store copy come from that storefront.
5. **Publish what the user approved** with `app_publish` per app. `app_publish` triggers a site rebuild itself; poll `build_status` until `success`, then confirm each new slug appears on the live `https://norvyn.com/apps`.
6. Call `app_list` to show the resulting app entries.
7. Summarize: new apps discovered (and which were published / left as drafts), which apps synced, any that errored, and that the rebuild completed. For every app the user is asking about, report its **screenshot count, `icon` URL, and `lastSyncedAt`** — so a "nothing changed" outcome is visible rather than silent.

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
   - If the **API already shows the new data but the page shows old** → the static build is stale. This is the #1 cause. Run `build_trigger` and poll `build_status` until `success`; the page updates within ~30s. (Step 3 above prevents this — never report a sync as done without rebuilding.)
2. **If the API itself still shows old data**, the sync didn't get new data from Apple. Check what Apple actually serves:
   - **ASC**: `GET /v1/apps/<appStoreId>/appStoreVersions?include=appStoreVersionLocalizations` → find the `READY_FOR_SALE` version → its `appScreenshotSets`. If it still lists the old files, ASC itself has not taken the change.
   - **Storefront**: `curl 'https://itunes.apple.com/lookup?id=<appStoreId>&country=cn'` → inspect `screenshotUrls` / `ipadScreenshotUrls` / `artworkUrl512`.
   - If both Apple sources still show old assets → WordBase is correct; wait for Apple to propagate, or confirm the edit was saved to the **live** version's `zh-Hans` localization (not a draft/next version, not another locale). An icon change can lag the iTunes CDN for hours.

Note: app sync requires the API key to hold the `apps:write` scope and the server to have valid App Store Connect credentials (`ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_PRIVATE_KEY_PATH`). If `app_sync` returns an auth/credential error, report it plainly rather than retrying.
