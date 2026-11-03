# Maintaining app media and reviewing Apple imports

The admin console is unchanged. The existing Wordbase MCP connection and REST API provide the complete editorial workflow after this source release is authorized and deployed. Private preview servers reject writes deliberately.

## Add an app's promotional media

1. Use `media_upload` with filename, base64 content and MIME type, or authenticated multipart `POST /api/media` with the `file` field. Images/GIF/WebP default to 10 MB; MP4/WebM video defaults to 50 MB (`APP_PROMO_MAX_VIDEO_MB` can configure the video limit). Keep audio in the video if useful; gallery autoplay always mutes it.
2. Keep the returned root-relative `/uploads/...` URL. Upload a still poster too; animated images require one so reduced-motion/data-saving visitors have a static cover without loading the animation.
3. Find the existing row using `app_list`/`app_get`. Set its explicit `promotionalMedia` field with `app_update`, or `PUT /api/apps/<id>` with `apps:write`:

```json
{
  "id": "<existing-app-id>",
  "promotionalMedia": {
    "type": "video",
    "src": "/uploads/2026/11/demo.mp4",
    "poster": "/uploads/2026/11/demo-poster.jpg",
    "alt": "A short demonstration of the app"
  }
}
```

For a GIF or animated WebP use `type: "animated-image"` with `src` and a still `poster`. For a static promotional image use `type: "image"`. Use `{ "type": "none" }` to clear the promotion and return to the existing screenshot fallback. `app_create` accepts the same field for new draft rows.

4. Read the app back and run the normal `build_trigger` tool to render the editorial change. Existing slugs, publication state, support/privacy links and unrelated metadata are preserved. The structured field merges into `meta.promotionalMedia`; users need not replace or hand-edit the metadata JSON. Legacy `meta.video`/`meta.videoPoster` still render until explicitly replaced or cleared.

The gallery reserves media space for every app. Video and animated images keep their intrinsic aspect ratio, play silently while visible in the foreground, pause offscreen/behind a modal, and retain a user's manual pause. Animated images freeze the displayed frame to a canvas and unload the animated source. Reduced-motion/data-saving visitors see the poster until they choose Play. Expansion retains aspect ratio and can be closed with Escape.

## Review an Apple update

1. `app_sync` fetches Apple metadata and returns a proposal ID; it changes no displayed catalog fields.
2. `app_import_list` with that proposal ID returns the exact stored before/after diff and `reviewToken`.
3. Apply only selected fields, or reject:

```json
{
  "proposalId": "<proposal-id>",
  "reviewToken": "<token-from-readback>",
  "action": "apply",
  "fields": ["version", "whatsNew"]
}
```

Pass this to `app_import_review`. REST equivalents are `GET /api/apps/imports/<id>` and `POST /api/apps/imports/<id>/review` (REST uses `reviewToken`, `action`, `fields`). A changed catalog row or expired proposal is rejected; fetch and review a fresh proposal. Publication and legal URLs are never imported, and promotional media stays editorial. Applying reviewed changes to a published app queues a rebuild; there is no admin-screen dependency.

## Isolated evidence and review access

- Real-content private preview: `http://127.0.0.1:4410/apps`.
- Synthetic media gallery: `http://127.0.0.1:4412/apps`. This separate local build has two explicitly named QA apps, a landscape MP4 with an audio track, and a portrait GIF with a still poster. It is not a proposed product catalog.
- `scripts/create-media-fixture.mts` uses the actual MCP handlers, validated input schemas and an in-memory database to create media entries, edit their promotional fields, read an Apple-shaped proposal and apply only its version change. It asserts that promotional and unrelated metadata survive. Output: `.preview/media-fixture/authoring-verification.json`.
- The fixture server starts with `python3 scripts/preview-readonly.py --port 4412 --offline --media-fixture --dist .preview/media-fixture/dist`. The default server never injects fixture data.

No production catalog entry has been assigned a fabricated promotion. Real videos/GIFs and their app mapping still need editorial selection; fallback screenshots remain for existing unassigned apps.
