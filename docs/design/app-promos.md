# App promo assets

The owner’s permanent incoming directory is `/Users/norvyn/Code/Projects/wordbase/app_promos` (`app_promos/` relative to this checkout). Put future originals there. Originals stay local, unchanged and excluded from Git; never rename, overwrite or delete them during preparation or publication.

`content/app-promos-inventory.json` is the durable account of every inspected asset. It records the original path, full SHA-256, dimensions, duration, reviewed app association, web-copy and poster hashes, exact encoding recipe and publication state. `content/app-promo-associations.json` records content-based matches by exact source hash. A replaced file has a different identity and needs a new review; its old publication history remains in the inventory. New filenames are never automatically assigned to similarly named apps.

```sh
python3 scripts/app-promos.py scan       # inspect and refresh the inventory
python3 scripts/app-promos.py prepare    # create/reuse verified web copies and posters
python3 scripts/app-promos.py preview    # prepare local-only preview assignments
```

Preparation requires official FFmpeg/ffprobe. The output is under `.preview/prepared-promos/`. MP4 copies retain their full frames and audio, resize conservatively, use broadly supported H.264/AAC and fast-start metadata. GIFs become looping MP4 copies so pausing and reduced motion are reliable; odd dimensions receive at most one padding pixel. Originals remain untouched. Stills come from actual asset frames; no synthetic promotional images are created.

Publication status is the last verified release state, with a timestamp and revision; scanning incoming files does not poll or change the live site. Re-run the retained publishing journal’s `verify` step and record its receipt when checking current publication. The inventory distinguishes:

- `not-deployed`: an unused/unreleased original; a `delivery` record means it has a prepared local copy, not that it is live.
- `uploaded-unused`: durable files exist in Wordbase’s media library but have not yet been assigned to public app metadata.
- `deployed`: the media is assigned to its verified published app and the rebuilt public pages have been checked.
- `assigned-draft`: metadata exists only on an unpublished app. Never publish a draft solely because a promo exists.

Unknown mappings remain `needs-confirmation` or `unassigned`, without a guessed app. The owner confirmed that `ArtLens.mp4` belongs to 具眼 / ArtLens and that Tiltic should be public. The stale Wordbase Tiltic draft flag is corrected through the existing publish API under that explicit instruction. Existing app IDs, slugs, ASC fields and the other four drafts are preserved.

## Publication

Upload only prepared derivatives and their posters through the existing authenticated `POST /api/media` endpoint. Use the source and delivery hashes in upload filenames for reproducible identification, verify response/download hashes, and retain media IDs and URLs in the inventory. Do not duplicate an upload already recorded with matching bytes. Never include credentials in inventory, command arguments or logs.

Assign an app’s complete reviewed ordered list through `app_update` or `PUT /api/apps/:id`:

```json
{
  "promotionalMedia": {
    "items": [
      { "id": "p_sourceHashPrefix", "type": "video", "src": "/uploads/recorded-url.mp4", "poster": "/uploads/recorded-poster.jpg", "label": "v1.1", "alt": "Description of the actual demonstration", "width": 1200, "height": 676 }
    ]
  }
}
```

There can be 1–12 ordered items; each can be a video, animated image or still image. Animated images require a still poster. A legacy single-item object remains supported, and `{ "type": "none" }` removes only promotional media. This operation preserves other editorial metadata, translations, Apple imports, content, links and publication state. It does not publish an app or alter ASC.

The reviewed publishing helper is `deploy/publish-app-promos.py`. Its default `plan` command reads a staged inventory and verifies derivative hashes without credentials or writes. `apply` requires a private journal, a verified backup marker and the exact deployed Git revision; it uploads/reuses files, appends the reviewed gallery items and journals recovery. `verify` checks actual rebuilt pages, metadata, draft preservation and build status, then emits `publication-result.json`.

After live verification, update the durable used/unused ledger with:

```sh
python3 scripts/app-promos.py record --receipt .preview/promos-release/publication-result.json
```

For a group of app changes, pause only the Wordbase rebuild watcher, perform authenticated uploads/assignments, verify readback and queue one normal rebuild; restore the watcher even on failure. Preserve already-uploaded assets and journal incomplete work rather than deleting files or overwriting unrelated metadata. Back up current data/static/uploads before a production update.

Catalog cards and app-detail heroes share one proportional media stage and explicit selectors. Only the selected, visible foreground media plays, always muted on autoplay. Offscreen items, inactive selectors and media behind dialogs pause. Reduced motion and data saving start on posters; explicit play is available. Expanded previews pause their inline counterparts and restore focus on close.

Caddy/web-server configuration is owner-managed. These media use the existing `/uploads/` route and need no Caddy change. If a future config differs, show the owner the exact proposed diff and manual instructions; do not apply it or restart shared Caddy. The deployment script now stops with a handoff instead of applying a Caddy difference.

The owner also confirmed DoodleHop is unreleased and Tiltic replaces its public listing position. DoodleHop remains published solely to preserve its existing Chinese/English detail and OG routes, with `meta.catalogVisibility = "unlisted"`; home, catalog, search and llms discovery omit it. All other metadata/content is preserved. Tiltic is published at the former DoodleHop listing position. Sitemap and existing direct links remain intact.
