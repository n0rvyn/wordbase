---
name: web-reviewer-agents-not-apple
description: V7 review-checklist check — this project's frontend is Astro/web, not SwiftUI; apple-dev reviewer agents do not apply
metadata:
  type: project
---

The frontend redesign (packages/web) is Astro SSG, not SwiftUI.

**Why:** The verifier spec's V7 review-checklist rules name `apple-dev:ui-reviewer` / `design-reviewer` / `feature-reviewer` that auto-dispatch on SwiftUI file changes. There are no Swift/SwiftUI files in packages/web.

**How to apply:** When checking V7 review-checklist consistency for any wordbase frontend dev-guide, do NOT flag missing `apple-dev:ui-reviewer`. Generic `design-reviewer` / `feature-reviewer` / `implementation-reviewer` labels on web pages are correct. Only flag if a phase actually has SwiftUI scope.
