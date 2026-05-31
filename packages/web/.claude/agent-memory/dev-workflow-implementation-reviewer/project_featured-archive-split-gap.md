---
name: featured-archive-split-gap
description: WordBase frontend redesign — featured post is sliced out of the archive, so any list-level metric computed over ALL posts mis-applies to the archive subset
metadata:
  type: project
---

In the WordBase frontend redesign (Home, /writing, future phases), the page pattern is `featured = posts[0]; archive = posts.slice(1)`. The featured post is rendered separately and excluded from the archive list.

**Bug class to check:** any helper that derives a list-level property (year tiering, "newest N years", counts, grouping) must be fed the **archive** subset, not the full `posts` array — otherwise the featured post's year/category silently consumes a slot the archive never uses.

**Concrete instance (Phase 3, /writing):** `selectFullYears(posts, 2)` was computed over all posts → `[2025, 2024]`, but the sole 2025 post is the featured one, so the archive (2024←) only rendered ONE full-density year instead of the two crystal [D-003] specified. Fix: `selectFullYears(archive, 2)`.

**Why:** the featured/archive split is a deliberate UX pattern (crystal [D-004]) that's easy to get right for rendering but easy to get wrong for derived metrics.

**How to apply:** when reviewing any redesign page that splits featured from archive, grep the frontmatter for helpers taking the full `posts` array and confirm whether the metric should key off `archive`/`posts.slice(1)` instead. Verify against built `dist/*.html`, not just source — the count-based greps (row totals) won't surface a tiering mismatch.
