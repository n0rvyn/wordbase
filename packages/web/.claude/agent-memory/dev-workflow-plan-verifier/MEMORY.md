# Plan Verifier Memory Index

- [Astro define:vars CSS variable naming](feedback-define-vars-naming.md) — Astro `define:vars` emits key verbatim as `--key`; hyphenated CSS var names require quoted JS keys or inline style
- [API pagination default limit](project-api-pagination.md) — `app.service.ts` default limit=20; SSG getStaticPaths must add `limit:10000`
- [releaseDate unix seconds](project-timestamps.md) — App `releaseDate`/`currentVersionReleaseDate` stored in seconds (not ms), appstore-lookup converts ISO→floor(ms/1000)
