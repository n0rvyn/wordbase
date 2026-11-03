# Public-template corrections and page-by-page audit

Review: **http://127.0.0.1:4413/__review** on the Mac. No production or Sites deployment was performed. Existing working changes and the seven pre-existing content-update files remain intact.

## Reported defects and actual causes

| Page / report | Cause | Correction |
| --- | --- | --- |
| Article contents/share and empty area before comments; owner screenshot `libfile_3cd10933386c8191baf1f1f125d83852` | A former sticky sidebar was changed into a details element, then visually reordered with flex. Old grid bottom padding (60px) and a separate comments margin (40px) accumulated into a 100px gap. Sidebar mobile CSS still hid the contents list. | Replaced the obsolete grid/sidebar structure with one reading flow, in actual DOM order: article, expandable tools, comments. Removed the inherited spacer containers and sidebar CSS. The measured gap is now 24px in every checked combination. Metadata and sharing use an explicitly spaced tools body. Mobile contents are visible; native anchors retain fragments and position headings with scroll-margin. |
| Footer groups stretched across the screen; screenshot `libfile_b42be1ccaed88191b47174b956c7eb80` | Fractional tracks `1fr 1.5fr 1fr` distributed the groups across the entire content width. | Left-aligned intrinsic / bounded / intrinsic columns with 40–80px gaps. At 1280px the three groups start at x=64,243,637; at 320px all start at x=20. No centering or full-width distribution. |
| Cashie screenshots appeared as oversized pasted images | Full-column `width:100%` plates made portrait screenshots about 736px tall in the hero and 697px in the gallery, and tablet screenshots about 676px tall. The old right-hand background bled across the page rather than framing the composition. | Rebuilt the shared app-detail hero with a bounded two-image composition for phone art and single-image composition for wide art. Added device-grouped native-scroll galleries and full-resolution dialogs. Desktop hero images are capped at 420px/330px; gallery images at 320px. Mobile adapts the composition and image limits. Cashie's screenshots section fell from about 3232px to 1223px tall while retaining all ten screenshots and intrinsic proportions. Product text, store links, metadata, release notes and related apps remain. |
| Search differed from the approved study | The implementation retained the earlier spine/header and article-only search. The approved study uses a compact modal searching writing, apps and podcasts. | Added one shared native-dialog search UI with the study's 720px panel, close control, focused input, type-labelled hairline results, initial suggestions, `/` shortcut, Escape and focus restoration. `/search` and `/en/search` retain direct links and render the same compact panel without the oversized hero. A generated index covers all published writing/apps/episodes; the existing full-text API remains in use. Title/media results remain usable when an offline preview lacks a captured full-text response. |
| Archive first screen dominated by one word; screenshot `libfile_4edb26981e308191a129a08c4c6d6e3c` | Two large spine sections, a 76px hero and stacked section padding delayed useful content. | Compact 28–38px heading, real post count, title filter, year jump links and a two-column desktop index / one-column mobile index. Mobile years scroll in one row. All 141 article links remain. At a 900px viewport height, 14 links appear on the desktop first screen and five at 320px. |
| Lucent privacy font size/color and other companion pages | Oversized title/separate spine bands; Tailwind Typography's light-only heading, code and table roles remained active in dark mode. Long table cells also exceeded mobile intrinsic width; assigning overflow to the table itself did not constrain it. | Centered 760px document, 26–36px title, 16px body with 1.85 leading, explicit live-theme prose roles, darker light-mode links and lighter dark-mode links. Tables have real labelled, focusable scroll containers; no cells or wording are removed. The shared prose-role correction also fixes dark article headings. |

## Verification

- Web tests: **316 passed**, 19 files. Astro check: **0 errors, 0 warnings, 6 hints**. Final build: **872 pages**.
- Saved public baseline: **829 URLs**, **60 legal/support/terms pages**, **two feeds**, **zero failures**. No production baseline was recaptured.
- **264** recorded responsive/theme/language browser checks: 72 app-detail checks, 16 article checks, 56 utility/footer checks and 120 legal checks. They cover real Chinese and English routes, light and dark, and actual 1280px/320px viewports. Cashie was also visually inspected at 390px and the wide desktop viewport.
- All nine published app details were checked in both languages/themes at desktop and mobile. No page overflow or distorted loaded images was found. Hero/gallery expansion, Escape and return focus work. Phone, tablet, desktop and missing-media cases retain their own proportions/fallbacks.
- The article example retains **3,173 text characters** in both routes. A second article with four headings verifies mobile contents. Clicking a contents link reaches `#h-0` with the heading about 92px from the viewport top. Contents and comments share the reading width; the tools-to-comments gap is 24px in all 16 checks.
- The cached article comments show the real empty state. A form check received the local preview's `This preview cannot change data.` rejection and created no comment. An uncaptured older article shows the honest load-error state in the offline snapshot. Share target URLs and copy-button feedback were checked; the browser tool's clipboard readback returned empty, so a physical clipboard readback is not claimed. No external share was submitted.
- Search: initial suggestions include four writing items, all nine published apps and five episodes. `Cashie` returns its app. `AI` returns 45 combined/deduplicated full-text and title/media matches. Clearing restores 18 suggestions. The close button, `/`, Escape and focus restoration were checked. The generated index has **210 published entries**: 141 posts, nine apps, 60 episodes.
- Every one of the 60 protected companion routes was browser-checked at 320px in both themes after correcting table overflow. All pass; body and heading contrast is about **14.19:1 light / 14.66:1 dark**. Link contrast is **5.71:1 / 9.84:1**. Tables scroll locally and remain keyboard-focusable.
- Before/after text/link signatures were compared for **358 rendered prose pages**. No authored text or link changes were found. One legacy post has malformed markup that makes the old extractor spill into surrounding UI; its comparison excludes only the newly added search-panel label outside the authored body, and its links remain identical. The independent protected-page baseline has no such exceptions.

Evidence is under ignored `.preview/article-fix/`: the three owner screenshots, `build.log`, `check.log`, `tests.log`, `route-check.log`, `body-comparison.json` and `browser-results.json`.

## Design-source coverage

The live approved study was inspected directly, including its real search dialog. The older local Geist reference is not treated as the approved source.

| Wordbase surface | Corresponding live study | Audit result |
| --- | --- | --- |
| Home | `#home` | Shared shell and study composition retained; real content/assets remain. |
| Writing | `#blog` | Journal hierarchy and real full index retained. |
| Article | `#article-ai-error-book` | Study reading hierarchy plus full authored body; tools/comments now form a coherent continuation. |
| Apps index | `#apps` | Shared catalogue grammar; current publication state remains nine apps, rather than silently adding prototype-only catalogue entries. |
| Podcast show | `#podcast` | Shared shell, actual cover/player and compact linked episode shelf retained. |
| Search | Native search dialog | Previously missed structural transfer corrected, including cross-space results and keyboard behavior. |
| App detail | None; study links to existing product pages | New shared composition implements the owner's explicit redesign request; pixel parity is not claimed for an absent view. |
| Archive | None; study has a journal selection/index | New dense archive implements the owner's explicit redesign request. |
| Legal/support/terms | Protected-link inventory only | Readability redesign implements the owner's explicit request; exact body/link contracts are preserved. |
| About | External original-site link only | Shared-theme/responsive audit; no absent prototype is presented as a matching view. |
| Category/tag indexes and detail, pagination, episode detail, 404 | No dedicated corresponding design views | Shared-system/route/responsive audit. Category/tag indexes, pagination and real 404 were included in the 56 utility checks; no invented pixel-parity claim. |

No model/effort change, simulator, ASC interface, DNS/subdomain change, source publication or production deployment was used. External-project media copies remain excluded. Review remains local and read-only; the detached server launcher is `python3 scripts/start-private-preview.py`.


## Follow-up: Categories and footer (owner review, November 3)

The owner approved the other pages and requested changes only to Categories and the shared footer. Inspected the exact supplied screenshot `libfile_7006cdbd870c81918fc873fff9d5fa99` and the actual local `/categories` page. This follow-up supersedes the earlier footer layout described above.

- **Categories:** removed the two numbered spine sections and their oversized vertical padding. The first category previously began at about 489px on the wide desktop view; it now begins at 233px at 1280px width. A compact title/count introduction leads directly into a two-column desktop index, becoming one column below 760px. All 11 category names, descriptions, counts, ordering and locale-prefixed destinations remain. All 11 categories fit in the 900px desktop first screen; eight fit on mobile. No new category filtering or content changes were introduced.
- **Footer:** placed the brand, tagline and existing English line in one identity group. Added clearly labelled Explore and Connect navigation groups, retaining all existing destinations and exposing the previously collapsed category/tag/archive/GitHub links. Writing/apps/podcast destinations are also directly available. The layout uses bounded columns and fixed gaps with left alignment, rather than distributing groups across the full page. At 1280px the three group origins are 64, 408 and 612px. Mobile puts identity above two left-aligned link columns; links have about 40px vertical hit spacing. Copyright remains below. Theme colors use the existing system tokens.
- **Scope:** only `CategoriesIndexBody.astro`, the footer markup in `BaseLayout.astro`, and footer rules in `design-study.css` were changed in this follow-up. Other page designs remain as reviewed.
- **Verification:** final static build passed (872 pages); `git diff --check` passed. Sixteen Categories checks cover 1280/768/390/320px, Chinese/English, and light/dark. Sixteen additional shared-footer checks cover home in both languages, Cashie and English Lucent privacy, at 1280/320px in both themes. No page overflow, hidden footer links or missing category destinations were found. Saved-baseline checks passed for 829 sitemap URLs, 60 protected pages and two feeds with zero failures. This reversible presentation change did not require new unit tests.
- **Evidence:** ignored `.preview/categories-fix/` contains the supplied screenshot, desktop/mobile full-page screenshots, `browser-results.json`, `build.log` and `route-check.log`. Review at `http://127.0.0.1:4413/categories` or `/en/categories`. The existing detached read-only preview remains running. No production deployment or source publication was performed.


## Site-wide heading audit and restrained footer (November 3 owner follow-up)

The owner requested a systematic audit after finding the same oversized hero on Tags. The supplied Apple screenshot `libfile_a27142ec58508191b244d994919bd73e` was inspected for structural ideas: compact supporting navigation, separation of secondary information, a clear final copyright row. Its branding, color palette and literal styling were not copied.

### Heading audit outcome

Audited all 17 public template families, with Chinese/English where both exist, at 1280px desktop and 320px mobile. The podcast show and episode templates have no English route twin; both were checked directly. The initial 60 bilingual observations are in `.preview/template-audit/headers-before.json`.

| Template | Outcome |
| --- | --- |
| Tags index | Replaced the numbered hero and second introductory section with shared `IndexHeader`; all 178 tags retain names, order and destinations. Tag text keeps its actual casing and has a readable 13px size. |
| Tag detail and category detail | Same shared compact header and direct result-list continuation; preserved every title, excerpt, date, duration and destination. Category descriptions remain. |
| Paginated writing | Same shared header; existing page indicator and newer/older/home destinations remain. |
| Categories index | Uses the same shared component, retaining the already accepted compact category grid. |
| About | Found an additional mobile issue: its decorative monogram and header occupied about 607px before the story. Header now occupies about 235px at 320px; the monogram is a 64px supporting detail beside the title. Introduction and story sections remain. |
| Home, writing landing, apps index, app detail, article, archive, search, legal/support, podcast show/episode, 404 | Reviewed and retained. Their meaningful editorial/product titles, reading structure or recovery action do not use the obsolete low-value utility-title shell. No uniform global h1 shrink was applied. |

Shared index titles are now 38px desktop / 28px mobile. Tags begins at about 247px desktop / 288px mobile rather than the old desktop 489px. Tag result and pagination lists begin around 225px desktop / 266px mobile. These measurements include the existing site navigation. Old 76px utility hero definitions and the doubled section bands are removed from all remaining affected templates.

### Footer outcome

The footer now has a compact identity line, four short directory groups (Explore, Writing index, Connect, Resources), and a thin divider above the final copyright/supporting line. It retains norvyn's DM Sans/Noto Sans typography, warm light/dark tokens and orange accent. All existing footer destinations remain; actual RSS and sitemap routes are additionally visible. App-specific legal/support links and authored policies remain intact; no generic policy or legal promise was fabricated. Four bounded desktop columns begin at x=64/244/424/604 at 1280px, keeping the directory left aligned. Mobile uses two columns, visible links and comfortable vertical hit spacing. Desktop footer height is about 264px, mobile about 477px including all 12 links and bottom text.

### Verification and review

- Final static build: 872 pages, passed. `git diff --check`: passed.
- 92 saved final browser observations: 60 across all bilingual templates in dark mode, 24 additional light-mode observations of every updated template, and eight podcast show/episode observations across both sizes/themes. No horizontal overflow was found. Additional visual inspection used 390px mobile.
- Every main-content link on all 871 built HTML pages compares exactly to the pre-change contract, in order. Result lists and pagination links remain intact.
- Saved public baseline: 829 sitemap URLs, 60 protected pages and two feeds; zero failures. Exact protected body/link contracts remain unchanged.
- Evidence under ignored `.preview/template-audit/`: before/after measurements, light/podcast checks, link comparison, build and route-check logs, Tags desktop/mobile and footer desktop/mobile screenshots. The supplied Apple image retains its Library identity in `.preview/categories-fix/apple-footer.png`.
- Review: `http://127.0.0.1:4413/tags`, `/en/tags`, `/tags/ai`, `/categories/essay`, `/page/2` and `/about`; full navigation remains available at `/__review`.

No implementation blocker remains. The existing detached private review server remains the delivery route; no production deployment, source publication, ASC change or unrelated project access occurred.
