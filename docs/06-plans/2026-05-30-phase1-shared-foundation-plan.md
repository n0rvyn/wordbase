---
type: plan
status: active
contract_version: 2
tags: [frontend, astro, design-system, baselayout, tokens, api-client]
refs: [docs/06-plans/2026-05-30-frontend-redesign-dev-guide.md, docs/design/reference/colors_and_type.css]
---

# Phase 1: Shared Foundation (tokens · BaseLayout · API client) Implementation Plan

**Goal:** 建立新设计系统的共享层——全局 token 样式表、新 BaseLayout(导航+页脚+spine 网格+明暗/accent 持久化,字体固定 Geist,无 edit-mode)、扩展 API client——作为后续每个页面阶段的依赖。站点仍能构建。

**Architecture:** 把 `docs/design/reference/colors_and_type.css` 作为单一真相源 lift 成 `src/styles/tokens.css`(全局 import)。新建 `BaseLayout.astro` 替换旧衬线版:sticky 模糊导航(brand+dot、Apps/Writing/Podcast/About、月亮/太阳明暗切换)、spine 网格工具类、页脚、head 内联 bootstrap 脚本(从 `localStorage['norvyn-v2']` 读 theme+accent,防 FOUC)。**关键约束**:旧 6 个页面(index/posts/[slug]/archives/categories/tags/page)目前都 import 旧 BaseLayout 并传它的 props——全面替换会让它们在各自阶段迁移前过渡性失配,处理方式见 [DP-001]。api.ts 沿用 `fetchApi` 模式加 4 个 getter。

**Tech Stack:** Astro 4 (SSG), TypeScript, 构建期 top-level await fetch, Google Fonts (Geist/Geist Mono/Noto Sans SC/Newsreader)。

**Design doc:** docs/design/reference/DESIGN-SYSTEM.md + colors_and_type.css(token 合约)

**Design analysis:** none

**Crystal file:** none

**Bug diagnosis:** not applicable

**Threat model:** not applicable（前端展示层,无新鉴权/密钥/外部输入入库;数据来自已就绪只读 API）

**Pre-flight risks:**
- 旧 `BaseLayout.astro`(衬线+朱红 #c23a22 + Cormorant)被 **10 个**现有非 admin 页共用(grep 实证:`index.astro`、`404.astro`、`archives.astro`、`page/[page].astro`、`posts/[slug].astro`、`[slug].astro`、`tags/index.astro`、`tags/[slug].astro`、`categories/index.astro`、`categories/[slug].astro` 都 `import BaseLayout`)。全面替换其内容会立即影响全部 10 页 → 见 [DP-001](视觉/props)与 [DP-002](nav 可达性)。
- `estimateReadTime` 已存在 `api.ts:195` 且被现有页使用——**不是新建**,后续阶段复用,本阶段不动。
- `api.ts` 已有 `fetchApi`(L63)、`API_URL`(L1)、`getPost` 返回 null 容错模式(L91)——新 getter 沿用同模式,不重写。
- `AdminLayout.astro` 是独立的 admin 布局(Tailwind),不在本次范围,不动。
- 新 BaseLayout props 形状若与旧不同(旧:`{title, description?, ogImage?}`),迁移期调用方会类型不符 → [DP-001] 决定如何过渡。

---

## Impact Map

**User path:** 站点外壳(导航栏含明暗切换、页脚)变成新设计;主题/accent 选择持久化跨页跨刷新。内容页本阶段不重写(后续阶段)。
**Data path:** `localStorage['norvyn-v2']`(theme+accent)→ head bootstrap 脚本 → `[data-theme]` + `--accent`。API:新 getter 读 /api/apps、/api/apps/:slug、/api/podcasts、/api/podcasts/:slug/episodes(只读,构建期)。
**Shared surfaces:** 新 `src/styles/tokens.css`、`src/layouts/BaseLayout.astro`(替换)、`src/lib/api.ts`(加 getter + 类型)。
**Existing consumers:** 6 个页 import BaseLayout(见 [DP-001]);api.ts 现有 getter 不变。
**Must remain unchanged:** api.ts 现有导出(getPosts/getPost/getCategories/.../estimateReadTime/formatDate/stripMarkdown)签名与行为;AdminLayout;后端;现有文章数据。
**Regression checks:** `pnpm build` 成功;`localStorage` 持久化跨页;无 `__edit_mode_*`/`EDITMODE`/`#tweaks`/字体切换残留(grep);api.ts 现有 getter 签名不变(grep 调用方);默认 accent `#3457B6`。

---

## Decisions

### [DP-001] 全面替换旧 BaseLayout 期间,6 个现有页怎么过渡? (blocking)

**Context:** dev-guide 定了"全新设计全面替换、不并存",但 **10 个**现有页(index/404/archives/page/posts/[slug]/tags(index+[slug])/categories(index+[slug]))现在都 import 旧 BaseLayout 并传 `{title, description?, ogImage?}`(实际只 posts/[slug] 传全三个,categories/[slug] 传 title+description,其余只传 title)。本阶段只建共享层,这些页的真正迁移分散在 Phase 2/3/7。若 Phase 1 就把 `BaseLayout.astro` 整个换成新设计,这 10 页会立刻套新外壳但内容还是旧排版,过渡期视觉失配/可能 props 不符。注:verifier 实证新 layout 保留同名三 props 后 10 页**均不会因 prop 形状报错**。过渡期现有页内联 `<style>` 引用的 legacy 变量(`--color-vermillion`/`--font-display:Cormorant` 等)会随旧 token 消失而降级——由 Task 2 的过渡别名兜住(见 Task 2 Step 8)。
**Options:**
- A: Phase 1 新建 `BaseLayout.astro`(新设计)直接替换旧文件;新 layout 兼容旧 props(`title/description?/ogImage?` 仍接受),6 个旧页立即套新外壳(导航/页脚/字体变新,各页主体内容仍是旧 markup),后续阶段逐页重写主体。— 立即全站统一外壳;过渡期内容区与新外壳风格混搭(可接受,因为最终都会重写),无报错(props 兼容)。
- B: Phase 1 把新设计写成 `BaseLayout.astro`,旧的另存为 `LegacyLayout.astro`,6 个未迁移页临时改 import LegacyLayout,随各自阶段切回 BaseLayout。— 过渡期每页风格自洽(旧页全旧、新页全新);需改 6 处 import + 末尾再清掉 LegacyLayout(短暂"并存"违背"不并存",但仅过渡期内部文件,用户不可见两套)。
- C: Phase 1 不碰 `BaseLayout.astro`,新设计的壳只随 Phase 2(Home)落地;共享 layout 在 Phase 2 才替换。— 最小过渡期失配;但"共享层"这个 Phase 就名不副实(BaseLayout 推迟到 Phase 2),且 Home 与其它旧页仍混搭。
**Recommendation:** A — dev-guide 明确"全面替换不并存",且最终每页都会重写主体;A 让外壳一次到位、零 import 改动、props 兼容不报错,过渡期"新壳+旧内容"是无害中间态。B 引入临时第二 layout(与"不并存"精神相悖且要二次清理),C 让 Phase 1 失去"共享层"意义。`BaseLayout.astro:8` 现有 props 简单,新 layout 保留同名 props 即可兼容。
**Chosen:** A(新壳立即替换、兼容旧 props、不搞临时 layout)— 用户确认 2026-05-30「没有过渡期,直接弄」。

### [DP-002] 过渡期现有页 nav 失去现有内容入口 + 含 404 链接,如何处理? (blocking)

**Context:** Task 2 新 nav = Apps→/#apps、Writing→/writing、Podcast→/podcast、About→/about。落地后 10 个现有页顶部 nav 不再含现有路由(`/`/`/categories`/`/tags`/`/archives`)任一入口,且 `/writing`/`/podcast`/`/about` 在 Phase 1 无对应路由(点击 404),直到后续阶段补齐。DP-001=A 只覆盖视觉中间态与 props,未覆盖 nav 可达性。
**Options:**
- A: 接受现状(Phase 1 即让现有内容失去 nav 入口 + 3 个 404)。— 与"全面替换"一致;但过渡期用户访问现有文章/分类页无法用 nav 导航且撞 404,体验破损。
- B: 过渡期 nav 链接指向已存在路由的映射(Writing→`/`(文章列表)等),各页阶段落地后切真实路由。— nav 始终可用、零 404;仅改 `BaseLayout.astro` navItems 一处,随阶段切换。
- C: 为 `/writing`/`/podcast`/`/about` 各建最小占位页。— 零 404、语义对;新增 3 个临时页需后续替换。
**Recommendation:** B — 改动最小(navItems 一处)、过渡期零破损、不引入需二次清理的占位页。
**Chosen:** B(过渡期 nav 指现有路由,随各阶段切真实路由)— auto mode 下按 UX 第一判据定;用户可改。

---

<!-- section: task-1 keywords: tokens, colors-type, global-css -->
### Task 1: 全局 token 样式表

⚠️ No test: 纯 CSS 资产(token 变量),由 build + grep 验证,无逻辑。

**Maps to Impact Map:** Data path, Shared surfaces（src/styles/tokens.css）

**Files:**
- Create: `packages/web/src/styles/tokens.css`

**Expected outcome:** `colors_and_type.css` 的全部 token(字体族/类型刻度/形状/间距/动效/accent/light+dark 主题/语义元素样式)成为站点单一真相源,默认 accent `#3457B6`。

**Non-goals:** 不引入第二套 token;不动 Tailwind(admin 用);不写组件样式。

**Touched surface:** 新建 `src/styles/tokens.css`。

**Regression shield:** 不动现有 BaseLayout 的旧 token(Task 2 才替换)。

**Task Contract:**
- Expected behavior: 站点有一份集中的设计变量,颜色/字体/间距统一来源;用户暂时看不到变化(还没接入)。
- Automated verify: 文件存在且含关键 token;`grep -E "--accent: #3457B6|data-theme=.dark.|--font-display" packages/web/src/styles/tokens.css` 命中。
- Real path verify: Task 2 import 后随 build 验证。
- Manual/device verify: none.

**Steps:**
1. 把 `docs/design/reference/colors_and_type.css` 内容复制到 `packages/web/src/styles/tokens.css`(token 合约:`:root` 字体/刻度/radius/spacing/motion/`--accent:#3457B6`;`[data-theme="light"]`/`[data-theme="dark"]` 两套;`body`/`.h1`/`.h2`/`.h3`/`.lede`/`.prose`/`.eyebrow`/`.mono-label`/`code`/`.hairline` 语义样式)。
2. 确认默认 accent `#3457B6`、dark `#7088FF`。

**Verify:**
Run: `grep -cE "--accent: #3457B6|#7088FF|data-theme=\"dark\"|--font-display" packages/web/src/styles/tokens.css`
Expected: ≥ 3 命中。
<!-- /section -->

<!-- section: task-2 keywords: baselayout, nav, footer, theme-toggle, spine -->
### Task 2: 新 BaseLayout(导航+页脚+spine+明暗切换,固定 Geist,无 edit-mode)

**Depends on:** Task 1, [DP-001]（按 Chosen 方案实现）

**Maps to Impact Map:** User path, Shared surfaces（BaseLayout.astro）, Existing consumers

**Files:**
- Modify: `packages/web/src/layouts/BaseLayout.astro`(全面替换内容,保留兼容 props)

**Expected outcome:** 新 sticky 模糊导航(brand+accent dot、Apps→/#apps、Writing→/writing、Podcast→/podcast、About→/about、月亮/太阳明暗按钮)、spine 网格工具类(`.wrap`/`.row2`/`.spine`/`.item` 行语言)、页脚(Navigate+Elsewhere 列、Built with Wordbase)、head 内联 bootstrap(读 `localStorage['norvyn-v2']` 的 theme+accent,防 FOUC,默认 theme=light/accent=#3457B6)。import `../styles/tokens.css`。字体仅加载 Geist/Geist Mono/Noto Sans SC/Newsreader。**保留旧 props `{title, description?, ogImage?}` 兼容**(per DP-001=A)。

**Non-goals:** 不写浮窗 Tweaks 面板;不写字体切换;不写任何 `__edit_mode_*`/`EDITMODE`;不重写 6 个页的主体内容(后续阶段)。

**Touched surface:** `BaseLayout.astro` 整体内容。

**Regression shield:** props 名与旧一致(`title`/`description`/`ogImage`),6 个现有页 import 不报错;不动 api.ts;不动 AdminLayout。

**Task Contract:**
- Expected behavior: 站点顶部是新导航(品牌+圆点、4 个链接、明暗切换),底部新页脚;切换明暗持久化、刷新与跨页保持;默认靛蓝 accent。
- Automated verify: `pnpm build` 成功;`grep -L "EDITMODE\|__edit_mode\|id=\"tweaks\"\|twFont\|data-v=\"serif\"" packages/web/src/layouts/BaseLayout.astro`(应无命中);`grep "norvyn-v2" BaseLayout.astro` 命中;`grep "tokens.css" BaseLayout.astro` 命中。
- Real path verify: `pnpm build` 后 dist/index.html 含新 nav class + bootstrap 脚本;打开站点切换明暗刷新保持(⚠️ 需浏览器:本地起 dev 或开 dist/index.html)。
- Manual/device verify: ⚠️ 需浏览器验证明暗切换交互 + localStorage 跨页持久(具体:开两个页 toggle 一个看另一个刷新是否保持)。

**Steps:**
1. 从 `docs/design/reference/norvyn.com - Home v2.html` lift nav/footer/spine 的 markup+CSS(去掉浮窗 `#tweaks`、字体栏、所有 `__edit_mode_*`/`EDITMODE` 块、`postMessage`)。
2. head:`<link>` 仅 Geist/Geist Mono/Noto Sans SC/Newsreader;`import '../styles/tokens.css'`;内联 `<script is:inline>` 在 body 渲染前读 `localStorage['norvyn-v2']`,set `data-theme` 与 `--accent`(默认 light/#3457B6),防 FOUC。
3. 明暗切换按钮(月亮/太阳)在 nav,点击切 `data-theme` 并写 localStorage(仅 theme+accent 两键)。
4. 保留 `{title, description?, ogImage?}` props + `<title>`/og meta(沿用旧 layout 的 head meta 结构)。
5. nav 链接(per DP-002=B 过渡期映射):navItems 数组集中定义,**过渡期指向已存在路由**——Apps→`/`(暂,Home 落地后切 `/#apps`)、Writing→`/`(文章列表,Phase 3 切 `/writing`)、Podcast→`/`(Phase 5 切 `/podcast`;或过渡期先不放 Podcast)、About→`/archives`(暂,或不放;Phase 6 切 `/about`)。每个链接旁注释标记其目标阶段(如 `// → /writing in Phase 3`),零 404。各阶段落地时改这一处映射。active 态用 currentPath.startsWith(对 Home 锚点不参与高亮,见 Step 9)。
   - 最小可行:过渡期 nav 只放确定可达的入口(文章列表/归档/分类/标签),Writing/Podcast/About 待其页落地再加入;避免任何指向不存在路由的链接。
6. footer:Navigate(作品/写作/播客/关于)+ Elsewhere(Email/RSS/Mastodon/GitHub,暂 `#`)+ © + Built with Wordbase。
7. 字体固定 Geist:不提供字体切换;`--font-display` 用 tokens.css 默认值。注:tokens.css 的 `--font-display` fallback 链含 Schibsted Grotesk 但不加载它——fallback 不命中即跳过,无害;不为它加 `<link>`(保持字体加载精简)。
8. **旧变量别名(防旧页掉色,should-fix #1)**:6 个现有页的 scoped `<style>` 仍引用旧变量名(`--color-ink`/`--color-ink-light`/`--color-ink-faint`/`--color-ink-ghost`/`--color-paper`/`--color-paper-warm`/`--color-paper-white`/`--color-vermillion`/`--color-vermillion-light`/`--color-rule`)。在新 BaseLayout 的 global style 里加一段**过渡别名**把它们映射到新 token(如 `--color-ink:var(--ink); --color-paper:var(--paper); --color-vermillion:var(--accent); --color-rule:var(--line)` 等),让未迁移页不掉色。每页迁移完成后由该阶段移除对应别名;Phase 7 收尾时删掉整段别名(届时无消费者)。加注释 `/* TRANSITION ALIASES — remove as pages migrate; delete in Phase 7 */`。
9. **nav active 规则(should-fix #4)**:Home 用锚点(`/#apps`),不是独立路由。active 判定:`/writing`、`/podcast`、`/about` 按 `currentPath.startsWith` 高亮;Home 锚点链接不参与 active 高亮(或仅当 `currentPath==='/'` 时品牌区视为 home)。不要用 startsWith 对 `/#apps` 判 active。
10. noise-overlay + favicon:旧 BaseLayout 的 noise-overlay div 设计要求 flat 背景→移除;favicon 保留 `/favicon.svg`(若存在)。

**Verify:**
Run: `cd packages/web && pnpm build 2>&1 | tail -5 && grep -c "norvyn-v2\|tokens.css" src/layouts/BaseLayout.astro && ! grep -q "EDITMODE\|__edit_mode\|twFont" src/layouts/BaseLayout.astro && echo "clean"`
Expected: build 成功;grep ≥2;输出 clean(无 edit-mode 残留)。
另核别名存在:`grep -c "TRANSITION ALIASES\|--color-vermillion" src/layouts/BaseLayout.astro` ≥1。
<!-- /section -->

<!-- section: task-3-tests keywords: api-client, apps, podcasts, getters, vitest -->
### Task 3-tests: api.ts 新 getter（tests）

**Maps to Impact Map:** Data path, Shared surfaces（api.ts）, Regression checks

**Files:**
- Create: `packages/web/src/lib/api.test.ts`

**Expected outcome:** 失败测试钉住 4 个新 getter 的契约:正确 URL/query、成功解析、错误处理(getApp/getPodcast 单条容错返回 null,列表抛错或空)。

**Non-goals:** 不测现有 getter(行为不变)。

**Task Contract:**
- Expected behavior: 前端能从 API 取 apps 列表/单个 app/podcasts 列表/某 show 的 episodes;单条取不到时优雅返回 null。
- Automated verify: `cd packages/web && npx vitest run src/lib/api.test.ts` 在 3-impl 前 FAIL(getApps is not a function 等)。
- Real path verify: n/a(mock fetch)。
- Manual/device verify: none.

**Steps:**
1. 确认/添加 web 包的 vitest(若无则 `pnpm add -D vitest` + `package.json` test 脚本;Astro 项目可用 vitest)。
2. `vi.stubGlobal('fetch', ...)` mock。
3. 测 `getApps({status:'published'})` → 请求 `/api/apps?status=published`,返回 `{data,total,...}` 形状。
4. 测 `getApp('slug')` → `/api/apps/slug`;404/抛错时返回 null(沿用 getPost 模式)。
5. 测 `getPodcasts({status})` 与 `getEpisodes('show-slug',{status})` → 正确 path/query。
6. 断言现有 `getPosts` 仍可调(回归:导出未破坏)。

**Verify:**
Run: `cd packages/web && npx vitest run src/lib/api.test.ts`
Expected: FAIL(getter 未实现)。
<!-- /section -->

<!-- section: task-3-impl keywords: api-client, apps, podcasts, episodes, fetchapi -->
### Task 3-impl: api.ts 新 getter（impl）

**Depends on:** Task 3-tests

**Maps to Impact Map:** Data path, Shared surfaces（api.ts）, Regression checks

**Files:**
- Modify: `packages/web/src/lib/api.ts`

**Expected outcome:** 新增 `getApps`/`getApp`/`getPodcasts`/`getEpisodes` + 对应 TS 接口(`App`/`Podcast`/`Episode`),沿用 `fetchApi`(L63)、`API_URL`(L1)、单条 null 容错(L91)模式。

**Regression shield:** 不改 Task 3-tests 文件;不改现有 getter 签名/行为;`estimateReadTime`(L195)等工具不动。

**Task Contract:**
- Expected behavior: 同 Task 3-tests。
- Automated verify: `npx vitest run src/lib/api.test.ts` PASS;`npx astro check` 或 `tsc --noEmit` clean。
- Real path verify: ⚠️ 需 dev API 起:`getApps({status:'published'})` 真打 `/api/apps`(当前返回空 data,正常)。
- Manual/device verify: none.

**Steps:**
1. 加接口 `App`(对齐后端 apps 列:id/slug/name/tagline/icon/description/appStoreUrl/category/version/rating/ratingCount/price/minimumOsVersion/releaseDate/currentVersionReleaseDate/screenshots/features/links/accentColor/status/sortOrder/featured/...)、`Podcast`、`Episode`。
2. `getApps(params:{status?,page?,limit?})` → `fetchApi('/api/apps'+query)`(URLSearchParams,同 getPosts)。
3. `getApp(idOrSlug)` → try `fetchApi('/api/apps/'+idOrSlug)` catch null。
4. `getPodcasts(params:{status?,page?,limit?})` → `/api/podcasts`+query。
5. `getEpisodes(slug, params:{status?,page?,limit?})` → `/api/podcasts/${slug}/episodes`+query。
6. JSON 字段(features/screenshots/links 后端存字符串)解析交给消费页(本阶段只返回原始),或在 getApp 里 `JSON.parse` 容错——本阶段返回原始字符串,后续 App Detail 阶段解析(避免提前定形)。

**Verify:**
Run: `cd packages/web && npx vitest run src/lib/api.test.ts && npx astro check 2>&1 | tail -5`
Expected: 测试绿;astro check 无新增 error。
<!-- /section -->

---
## Verification
- **Verdict:** Approved (revised)
- **Date:** 2026-05-30
- **Verifier:** dev-workflow:plan-verifier (Opus)。首轮 must-revise(3 must-fix);已修订:#1 Task 3-impl 补 Maps to Impact Map 字段;#2 DP-001/pre-flight "6 页"→"10 页"(含 404/tags/categories/index/[slug]/archives/page/posts);#3 dead-nav blocking DP-002 → Chosen B(过渡期 nav 指现有路由,各阶段切真路由)。另应用 should-fix 旧变量别名/nav active/字体 fallback。Report: .claude/reviews/plan-verifier-2026-05-30-185530.md
