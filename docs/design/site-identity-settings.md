# Editable site identity

The existing protected `/admin/settings` console edits the header/site name and homepage/footer presentation copy. This extends the existing settings store; it adds no editor, credentials, roles, routes, migrations or media uploads.

## Fields

- **Header / site name** uses existing `site.title`, including its existing feed/JSON-LD uses.
- **Homepage**: eyebrow, first headline line, second-line prefix and emphasis, Chinese/English introductions. Introduction newlines render as line breaks; HTML is not accepted.
- **Footer**: Chinese/English slogan and the closing line.
- **Homepage sharing**: separate Chinese/English titles and subtitles. Page-specific article/app titles and summaries stay page-specific. Current artwork, image URLs and actual canonical domain remain unchanged.
- The older site description, author and contact settings remain available with their existing meanings.

Presentation values are stored under the explicit `site.copy.*` whitelist. Empty/whitespace copy resolves to the current default. API and build defaults/limits are checked for parity. The public `/api/settings/site` returns resolved published identity fields only, never raw settings or private keys.

## Saving and publishing

The console loads through `settings:read` and saves changed fields through `settings:write`, using the existing authenticated API. It refuses to save when loading failed. Server validation checks the entire request before writing, and persists the batch in one transaction; copy must be plain text within its field limit. Templates escape authored text and retain both language spans.

A successful save persists settings, then requests the existing static-site rebuild. The public output changes when that build succeeds. If the request marker cannot be written, the API reports that settings were saved but publishing was not queued. Build status remains in the existing Observability panel; the existing protected build API provides operator retries. A later build failure leaves the prior public build intact. No new build-status permission is required by this form.

The generic settings API keeps its existing map response shape. The MCP identity tool retains its existing five-field contract; generic settings updates receive the same validation.

## Verification

Protected route tests cover authenticated persistence and the anonymous resolved view, unauthenticated denial, invalid/unknown/oversized/non-text input without partial changes, empty-value defaults, exclusion of private settings, and a publishing-request failure. An isolated SQLite/API roundtrip feeds a full Astro build to verify changed header, bilingual introduction/footer and exact separate share title/subtitle in generated pages. Default builds and existing site tests check regressions. Operational test fixtures and deployment evidence live privately under `.preview/`.
