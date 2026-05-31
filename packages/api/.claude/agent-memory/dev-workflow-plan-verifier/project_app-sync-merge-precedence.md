---
name: app-sync-merge-precedence
description: app-sync.service.ts merge precedence per field — which source wins, where ASC contributions get discarded
metadata:
  type: project
---

`packages/api/src/services/app-sync.service.ts` merges ASC + iTunes into the `apps` table. Per-field precedence (verified 2026-05-31):

- `category`/`version`: ASC-first → iTunes → cur (line 61-62). ASC category resolves to `null` in practice because `asc.service.ts:165` reads only `attributes.name` and the real `appCategories` token has no name attribute. So category effectively comes from iTunes `primaryGenreName` (`appstore-lookup.service.ts:59`).
- `description`: iTunes-only (`itunes?.description ?? cur`, line 71). ASC's fetched description is DISCARDED by merge precedence — a plan claiming "description synced from ASC" would be wrong.
- `subtitle`/`whatsNew`: ASC-first (line 58-59). These are ASC's real contributions.
- `screenshots`: was `asc ?? itunes` (line 48) — empty ASC `[]` shadows iTunes. Phase 3.5 hardens to prefer ASC only when `.length > 0`.

**Why:** Phase 3.5 plan verification surfaced that ASC category/description never reach storage as ASC values despite the plan's framing.
**How to apply:** When verifying any plan touching app metadata sync, check the *destination merge line* not just the ASC fetch — a field can be correctly fetched from ASC yet discarded at merge. See [[itunes-category-value-unverified]].
