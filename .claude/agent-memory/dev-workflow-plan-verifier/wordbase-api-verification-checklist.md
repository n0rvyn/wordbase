---
name: wordbase-api-verification-checklist
description: Recurring verification gaps for wordbase packages/api plans — auth header scheme, dual-schema DDL parity, raw-SQL table creation, RSS/XML escaping
metadata:
  type: project
---

When verifying plans that touch `packages/api`, check these known-risky areas. (Verify against live code each time — these reflect repo state as of 2026-05-30.)

**Auth header scheme.** Authenticated routes use `authMiddleware` (`src/middleware/auth.ts`) which ONLY accepts `Authorization: Bearer <token>`. It does NOT read `x-api-key`. A plan's route tests/curl that use `x-api-key` will 401. Test seeding contract: `keyPrefix = rawKey.slice(0,8)`, `keyHash = bcrypt.hash(rawKey, 10)`, `rawKey.length >= 8` (auth.ts rejects shorter), `permissions` = JSON-array string. Key creation reference: `src/cli/keys.ts`.

**Dual-schema DDL parity.** Tables are declared in TWO places that must stay in sync: `src/db/schema.ts` (Drizzle) and `src/db/index.ts` (raw `CREATE TABLE IF NOT EXISTS`). Tables are created by raw SQL on boot via `initializeDatabase()`, NOT by drizzle migrations (design docs may say `pnpm db:generate` — that's wrong for this repo; the raw-SQL path is authoritative). Drizzle `.default()` compiles into DDL, not injected at insert time — so when a service omits a column, SQLite fills it from the RAW CREATE TABLE default. If a plan hand-writes new-table DDL, verify every `NOT NULL` + `DEFAULT` from the Drizzle def is reproduced column-for-column. No existing service relies on DDL default for a NOT NULL column (they set defaults explicitly, e.g. `post.service.ts` `status: data.status || 'draft'`).

When triaging a DDL-parity enumeration gap, apply the three-clause test — block ONLY if a column is (1) missing from the enumeration AND (2) NOT NULL without a DDL default AND (3) not service-set. The dangerous (silent-NULL) class is columns WITH a DEFAULT: dropping the default makes an omitted insert go NULL. NOT-NULL-*without*-default identity columns (`slug`, `title`) fail loudly (constraint error), and services always set them, so an omission there is **advisory** (latent dual-schema drift), not blocking. Real 2026-05-30 instance: podcast-apps plan Task 1 enumerated all default-bearing podcasts columns correctly but omitted `slug`/`title` NOT NULL from the podcasts sub-bullet while listing them for apps/episodes — flagged advisory, not must-revise.

**RSS/XML escaping.** No XML library; feeds built by hand-string. `xmlEscape` must cover `& < > " '`. CDATA-wrapped content (show notes) does NOT neutralize `]]>` — that sequence must be split as `]]]]><![CDATA[>` or the field re-escaped. A Threat Model claiming "in CDATA = safe" is false without `]]>` handling.

**Conventions:** nanoid text PKs; timestamps in SECONDS (`Math.floor(Date.now()/1000)`); status default `'draft'`; Hono router error shape `{ error: { code, message } }`; MCP `server.tool(name, desc, schema, handler)`; route mounts must precede `app.use('*', redirectMiddleware)` in `app.ts` or GETs get caught by redirect middleware.

**Test infra:** repo had no test runner before vitest plans. vitest default = per-file worker; a `:memory:` singleton DB is per-file; seed api_keys survives a `resetNewTables` that only clears feature tables.
