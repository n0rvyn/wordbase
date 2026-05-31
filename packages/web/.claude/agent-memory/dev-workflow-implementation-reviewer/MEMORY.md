# Implementation-reviewer project memory index

- [Featured/archive split gap](project_featured-archive-split-gap.md) — list-level metrics computed over all `posts` mis-apply to `posts.slice(1)` archive; verify against built dist/*.html
- [Astro inline-CSS grep trap](project_astro-inline-css-grep-trap.md) — Astro inlines small CSS as <style> in HTML, not always /_astro/*.css; grep dist/*.html directly to confirm a rule shipped
