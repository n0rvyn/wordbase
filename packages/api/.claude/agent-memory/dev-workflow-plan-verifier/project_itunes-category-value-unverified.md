---
name: itunes-category-value-unverified
description: iTunes primaryGenreName value for app 6756039348 is asserted as 'Productivity' but not live-verified; may be localized
metadata:
  type: project
---

The Phase 3.5 plan's DP-3.5-2 asserts iTunes returns category `'Productivity'` for app `6756039348`, and Task 6 asserts `category === 'Productivity'`. But the plan's "Live-verified facts" section only verified iTunes screenshots=0 and rating=0 for this app — NOT the category string.

`appstore-lookup.service.ts:59` maps category from `r.primaryGenreName`. iTunes `primaryGenreName` can be localized by storefront/country, so a CN lookup might return `'效率'` rather than `'Productivity'`.

**Why:** advisor flagged that item #2's final stored value is an assertion, not a live-verified fact; structural wiring is sound but the literal value is unconfirmed.
**How to apply:** This is a Task-6 empirical risk, not a plan-internal contradiction — don't block on it, but flag any `category === 'Productivity'` hard assertion as needing real-path confirmation (the genre may be localized). See [[app-sync-merge-precedence]].
