---
name: review-patterns-wordbase-api
description: Recurring review checks for the wordbase packages/api backend (ASC sync, discover, regression-guard fixture ordering)
metadata:
  type: project
---

Review patterns specific to `packages/api` (wordbase backend).

**Regression-guard fixture ordering trap.** When a test asserts a deterministic selection (e.g. "zh-Hans verLoc preferred, en-US not used"), check the FIXTURE ARRAY ORDER. If the preferred entry is listed first, a revert to "pick-first" logic lands on the same entry and the guard passes silently — the guard does not discriminate. Fix: put the NON-preferred entry first so correct (preference) code and reverted (first) code diverge. Seen in `asc.service.test.ts` Task 4 guard (Phase 3.5).

**Why:** the whole point of a regression guard is to fail on the bad code; a fixture ordered to match the happy path neuters it.

**How to apply:** for any "deterministic selection" test, mentally run BOTH the correct and the naive logic against the fixture. If they produce the same fetched URL / value, the guard is non-discriminating — report as test-fidelity gap.

**apps.appStoreId has no unique index** (`schema.ts:191`, plain nullable text). Any check-then-insert keyed on appStoreId (e.g. `discoverApps`) has a concurrent-insert dup-row race. Idempotency tests usually cover serial only. Flag concurrent race as low-sev; recommend partial uniqueIndex (precedent: `ux_episode_external` at schema.ts:178).

**app-sync merge precedence:** `description` is sourced from iTunes only (`app-sync.service.ts:74`); ASC description is fetched but discarded — this is documented (plan/header comment), not a gap. Don't over-flag.

**Backend files were left untracked by a prior session** (75 tests green, unpushed). `git status ??` on service files means no committed baseline exists — "this-session vs pre-existing" classification cannot rest on `git diff`. State that explicitly; don't claim git-diff evidence.
