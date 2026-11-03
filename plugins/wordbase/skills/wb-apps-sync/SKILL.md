---
name: wb-apps-sync
model: haiku
description: Prepare reviewed Apple metadata imports for WordBase's curated app catalog. Use when the user asks to refresh app metadata, discover new apps, or sync apps. Fetching never changes the public catalog.
---

# Curated WordBase apps

The catalog is editorially maintained. Apple is an optional import source, never an automatic publisher.

1. Discover new apps with `app_discover` if requested. Discovery creates drafts only; do not publish them without the owner's decision.
2. Call `app_sync` (`id` for one app; omit for all). It now **prepares stored proposals only**, and always reports `rebuildTriggered: false`. Existing display content and timestamps stay unchanged. Webhooks and legacy scheduled syncs follow this same rule.
3. Read each returned `proposalId` through `app_import_list`. Show the owner the `changes` before/after values, noting CN/US storefront, localization, pricing, copy and artwork differences. Missing storefront results mean only that the queried storefronts did not answer; they do not prove global unavailability. Do not unpublish on that basis.
4. Wait for a decision on the displayed differences. Apply only explicitly approved changed field names via `app_import_review` with `proposalId`, its exact `reviewToken`, `action: apply`, and `fields: [...]`. Use `action: reject` to dismiss. Never fabricate a token, use apply-all by default, or apply an unreviewed suggestion merely because the user asked to sync.
5. A stale, expired or already-reviewed proposal fails. Fetch a fresh proposal and show the new diff; never force an old review over newer edits. A proposal expires after seven days.
6. Applying to a published app triggers a rebuild; poll `build_status` to success/failure and verify the public page. Applying to a draft does not publish it. `app_publish` remains a separate explicit action.
7. Report proposals prepared, fields approved/applied, proposals rejected/pending, and any errors. Distinguish fetched suggestions from published changes.

## Manual editing

`app_update` accepts curated description, icon and screenshot URLs as well as name, tagline, features, display metadata, links and ordering. It no longer loses these edits on sync. Run `build_trigger` after approved manual changes.

Preserve existing slugs and support/privacy/terms URLs. ASC Support/Privacy URLs must remain the root `https://norvyn.com/<slug>` for every locale, without `/en/`. Do not write to ASC. Imports cannot change slugs, publication, legal links, App Store ID or bundle ID.

Apple sources are the official App Store Connect API and Apple's public iTunes Lookup. Credentials are needed only for ASC discovery/metadata, not normal rendering or manual catalog maintenance. Apple responses can lag, and absent fields preserve existing values. Imported English copy is reviewed separately (`englishCopy`) and does not replace unrelated metadata/languages.
