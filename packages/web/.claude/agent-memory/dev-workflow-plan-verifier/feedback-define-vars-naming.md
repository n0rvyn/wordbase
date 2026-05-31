---
name: feedback-define-vars-naming
description: Astro define:vars emits JS object key verbatim as CSS var name; hyphenated names like --app-2 need quoted keys or inline style
metadata:
  type: feedback
---

Astro `<style define:vars={{ app: val, app2: val2 }}>` emits `--app` and `--app2` (no hyphen). If the ported CSS references `var(--app-2)`, it silently gets nothing.

**Why:** Found in Phase 4 plan verification — `tokens.css:77` documents `--app-2` (hyphenated) but plan used unquoted JS key `app2`.

**How to apply:** When a plan uses `define:vars` to set CSS custom properties with hyphens in the name, verify the JS object key is quoted (`'app-2': val`) or use inline style attribute: `<element style={`--app-2:${val}`}>`. The inline style approach is simpler and avoids the quoting footgun. Also watch for circular self-referencing remaps inside the `<style>` block like `--app: var(--app)` which are infinite loops in CSS.
