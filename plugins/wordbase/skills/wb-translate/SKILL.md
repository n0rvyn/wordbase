---
name: wb-translate
model: sonnet
description: Fill in English translations for WordBase content (blog posts, companion pages, app landing tagline/features) by reconciling the i18n translation-memory cache. Use when the user wants to translate content, fill English versions, refresh the bilingual cache, or says "translate the site", "补英文", "translate content", "对账译文", "run wb-translate". NOT for podcast episodes (out of scope) and NEVER touches App Store-synced fields (description/screenshots/icon).
---

# WordBase content translation (wb-translate)

Reconcile the WordBase **content-bilingual translation memory** via the `wordbase` MCP server: find which source blocks have no English rendition yet, translate them, write them back, then rebuild so the `/en/` pages go live.

Source content stays single-language (Chinese is the source of truth). Translations are a content-addressed cache keyed by a per-block hash — translating the same block twice is free (cache hit), and editing one paragraph only re-translates that paragraph.

## Workflow

1. **Pull the pending work.** Call `i18n_pending` with `lang: "en"`. It returns the source blocks that have no `en` rendition yet — each as `{ hash, text, ref }`, where `ref` identifies the origin (`post:<id>:content`, `page:<id>:content`, `app:<id>:tagline`, `app:<id>:features.title`, `app:<id>:features.blurb`).
2. **If the list is empty, stop.** Report "Nothing pending — English cache is complete." Do **not** trigger a rebuild for an empty run.
3. **Translate zh → en, block by block.** For each pending block, produce a faithful English translation that:
   - preserves Markdown structure exactly — headings stay headings, list markers, blockquotes, tables, and link syntax are kept; only the natural-language text is translated;
   - leaves fenced code blocks (```…```) and inline code verbatim — never translate code, identifiers, or output;
   - keeps the author's voice; translate meaning, not word-for-word; keep proper nouns / product names as-is unless an established English name exists;
   - for `app:*:tagline` and `app:*:features.*` units, the text is a whole short string (not Markdown) — translate the whole string.
   - Work in reasonable batches. If one block fails to translate, skip it and keep going — never let one failure drop the others.
4. **Write the translations back.** Call `i18n_put_cache` with `entries` as a JSON string array:
   `[{ "sourceHash": "<hash>", "lang": "en", "text": "<translation>", "model": "<your model id>", "humanEdited": false }, …]`.
   The server keeps human-edited renditions safe: if a block already has a `humanEdited` translation, an AI write does **not** overwrite it — the response flags it as kept. Collect every such kept-human block and **list them in your summary for a person to reconcile** — do not try to force them.
5. **Trigger the rebuild — only after the cache is filled.** The `/en/` pages are static Astro output baked at build time from this cache, so new translations are invisible until the site rebuilds. Call `blog_trigger_build`, then poll `blog_build_status` until `status` is `success` (or `failed`). Filling the cache *before* building is deliberate: it guarantees the build does pure cache lookups (any still-missing block falls back to Chinese — translation never blocks publishing).
6. **Summarize.** Report: how many blocks translated, their distribution by `ref` type (posts / pages / app fields), any blocks skipped because a human had edited them (needs manual reconcile), any blocks that failed to translate, and that the rebuild completed.

## Scope & limits

- **Podcast is out of scope.** Do not translate episode summaries / show notes / transcripts.
- **App Store-synced fields are never translated.** `app_sync` owns an app's `description`, `screenshots`, and `icon`; an AI translation there would be reverted on the next sync. These fields are filtered out **upstream** — `i18n_pending` never returns them — so you will only ever see app `tagline` and `features` text. Do not attempt to translate the synced fields by any other route.
- **Progressive, never blocking.** A source block with no English yet renders Chinese on `/en/` pages (per-block fallback). Partial coverage is fine and expected; ship what you have.
- **Human-edited translations win.** When someone has hand-polished a translation (`humanEdited: true`), the source later changing does not let an AI write clobber it — those blocks surface in your summary for a human to decide.
- **Translation quality is human-verified.** Output is AI-generated and goes public; after a run, the operator should spot-check key pages and hand-edit anything off (a human edit re-saved with `humanEdited: true` is then protected).

## Notes

- **Trigger / scheduling.** Unlike the deterministic site rebuild (which a systemd path unit can auto-run off a `.rebuild-request` marker), translation needs Claude, so it cannot be auto-run by a file watcher. Run `/wb-translate` manually after publishing new content, or schedule it with the `schedule` skill. This skill fills the cache and then triggers the rebuild directly via `blog_trigger_build` — it does not rely on a separate `.translate-request` marker.
- **Scope required.** The MCP key must hold `i18n:read` (pending/render), `i18n:write` (put cache), `build:trigger` (rebuild), and `build:read` (poll build status). A missing scope returns a permission error from the tool — report it plainly rather than retrying.
- **Only `en` for now.** Other target languages (e.g. `ja`) are a future extension; this skill reconciles `lang: "en"`.
- **Model.** This skill is pinned to `sonnet` (frontmatter `model: sonnet`) — translation quality is fine on Sonnet and it is far cheaper than Opus for bulk text. The override lasts only this turn; the session model resumes afterward.
- **Scale — shard and fan out for large batches.** Inline translation runs in a single context. For an incremental top-up (a handful of new/edited posts → a few dozen pending blocks) just translate inline. But when `i18n_pending` returns a large set (hundreds+ of blocks, e.g. a first full-site pass ≈ 2000 blocks / ~140K source tokens), do NOT try to translate them all in one context — it risks the context window and is slow. Instead: fetch pending, split the blocks into shards balanced by character count (~50K chars each), and dispatch one Sonnet sub-agent per shard (via the Agent tool, `model: sonnet`); each shard translates its blocks and writes them back. Because `i18n_pending` only returns still-missing blocks and `i18n_put_cache` upserts, the whole job is idempotent and re-runnable — re-fetch pending and re-dispatch the remainder until it reaches zero, then trigger one rebuild. Watch for: a safety filter occasionally killing a whole shard's output (`new_sensitive`) → re-shard that piece smaller; agents skipping no-op blocks (pure code / image markdown / already-English) → instruct them to pass such blocks through VERBATIM (en rendition = source), never skip.
</content>
