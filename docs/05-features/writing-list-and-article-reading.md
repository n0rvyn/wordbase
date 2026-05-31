---
type: feature-spec
status: active
tags: [writing, article, blog, filter, toc, scroll-spy, typography]
refs:
  - docs/design/reference/norvyn.com - Writing.html
  - docs/design/reference/norvyn.com - Article.html
  - docs/06-plans/2026-05-30-frontend-redesign-dev-guide.md
  - docs/11-crystals/2026-05-31-phase-3-visual-crystal.md
---

# Writing List & Article Reading (blog frontend)

> /writing index with topic-filter chips + year-grouped archive, and /posts/[slug] long-form reading view with TOC scroll-spy, progress bar, prose typography, and comments. Replaces the old serif layout for all 126 published posts.

**Design sources:**
- `docs/design/reference/norvyn.com - Writing.html` — hero, chips, featured post, archive list (all sections)
- `docs/design/reference/norvyn.com - Article.html` — nav progress bar, left rail (meta/TOC/share), prose body, pull-quote, figure, endmark, author card, prev/next nav
- `docs/06-plans/2026-05-30-frontend-redesign-dev-guide.md` Phase 3
- `docs/11-crystals/2026-05-31-phase-3-visual-crystal.md` D-001 through D-010

---

## User Stories

**Journey: browse-and-filter writing**

- 用户可以进入 /writing 页面，看到页面标题「写作」和对博客写作方向的一句话介绍 → `writing/index.astro:60-83` ✅
- 用户可以看到最多 6 个高频分类的筛选药丸（「全部」默认选中），以及一个「全部分类 →」链接跳到 /categories → `writing/index.astro:75-79` ✅ (crystal D-001: top-6 real cats; see Deviation Record #1)
- 用户可以点击筛选药丸，只显示属于该分类的文章行；年份标题在该分组无可见行时自动隐藏 → `writing/index.astro:169-190` ✅
- 用户可以看到 25 篇多分类文章在筛选时按任一所属分类正确显示（多 slug 匹配，不被错误隐藏） → `writing/index.astro:130-134` ✅ (`data-cats` 空格分隔全部 slug，crystal D-002)
- 用户可以看到「最新一篇」featured 卡，包含「最新 · Featured」标签、发布日期、标题、摘要、分类+阅读时长 meta，以及「继续阅读」链接 → `writing/index.astro:86-108` ✅
- 用户可以在 featured 卡片下方看到按年份倒序分组的文章归档 → `writing/index.astro:111-163` ✅
- 用户可以看到最近 2 年（2025、2024）的文章行显示完整信息（日期 + 标题 + 摘要 + 阅读时长 + 分类），更早年份显示精简行（日期 + 标题 + 分类，无摘要） → `writing/index.astro:136-158` ✅ (crystal D-003: year-axis density; see Deviation Record #2)
- 用户可以点击任意文章行跳转到对应的 /posts/[slug] 页面 → `writing/index.astro:131-135` ✅

**Journey: read an article**

- 用户可以看到文章顶部的阅读进度条，随滚动实时更新宽度 → `posts/[slug].astro:51,554-562` ✅ (crystal D-007: page-owned, not in nav; see Deviation Record #3)
- 用户可以在左侧 rail 看到文章元数据：发表时间（mono 格式）、分类、阅读时长 → `posts/[slug].astro:56-74` ✅
- 用户可以在左侧 rail 看到目录（TOC），条目仅含 H2/H3 级标题，H4+ 不列入 → `posts/[slug].astro:76-89` ✅ (`article.ts:injectHeadingIds` crystal D-008 索引式 id)
- 用户可以随页面滚动看到 TOC 当前可见条目高亮（accent 色左边线） → `posts/[slug].astro:565-576` ✅
- 用户可以点击 TOC 条目平滑滚动到对应标题 → `posts/[slug].astro:579-585` ✅
- 用户可以在左侧 rail 看到分享按钮（圆形 hairline 样式）并使用：Twitter 分享、微信扫码分享、复制链接 → `components/ShareButtons.astro:11-29` ✅ (crystal D-005: 3 existing buttons retained; see Deviation Record #4)
- 用户可以在文章正文区看到分类标签、大标题、摘要（dek）、byline（头像 + 作者名 + 日期） → `posts/[slug].astro:98-107` ✅
- 用户可以阅读排版完整的正文：段落、H2/H3、有序/无序列表、blockquote（accent 左边线）、inline code、pre code 块、链接、strong、img、hr → `posts/[slug].astro:449-550 (is:global prose)` ✅
- 用户可以在正文末尾看到 ◆ 结尾标记（accent 色） → `posts/[slug].astro:109` ✅
- 用户可以在文章正文中看到 pull-quote（大字引用块，独立排版区别于 blockquote） → ❌ 未实现（见 Deviation Record #5）
- 用户可以在文章正文中看到带说明文字的 figure 图片区域（`.cover` + `.figcap`） → ❌ 未实现（见 Deviation Record #6）
- 用户可以在正文结束后看到作者卡片（头像 + 名字 + 简介） → `posts/[slug].astro:111-117` ✅
- 用户可以在作者卡片后看到上一篇/下一篇导航，两侧各一个带标题文字的卡片 → `posts/[slug].astro:119-134` ✅
- 用户可以在文章底部提交评论（姓名/邮箱/网站/内容表单），并查看已审核通过的评论 → `components/CommentSection.astro:10-42,179-283` ✅ (DP-002=A: 保留评论，重做为 token 样式; crystal D-006)
- 用户可以在移动端（≤880px）看到 rail 收起（TOC 和分隔线隐藏），元数据横向排列 → `posts/[slug].astro:419-444` ✅

---

## Expected Behavior

### Scenario 1: 浏览写作列表，按分类筛选

用户进入 `/writing`，页面显示：
- 页头「写作」，eyebrow「Essays · 自 2008」，一段 lede 文案。
- 紧接着是一排药丸按钮：「全部」（默认选中，accent 填充）+ 最多 6 个高频分类（Linux/Essay/Python/Shell/MacOS & Apple & PC/Other），末尾「全部分类 →」跳转 `/categories`。
- 「01 Latest」区：最新一篇 featured 卡，包含 accent 色「最新 · Featured」标签、mono 格式日期、大标题、摘要段落、「分类 · N min」meta 行、「继续阅读 →」链接（hover 时箭头右移）。
- 「02 Archive」区：文章按年份倒序分组，2025 和 2024 为 full 密度（日期 + 标题 + 摘要 + meta），2023 及更早为 compact 密度（日期 + 标题 + 分类，无摘要，三列 grid）。年份标题本身用 mono 小写字母显示。
- 点击非「全部」chip 后：该 chip 变 accent 填充；不含该分类的文章行 `display:none`；若某年份组内无可见行，该年份标题也隐藏。多分类文章在任一所属分类的 chip 下均可见。

### Scenario 2: 阅读一篇文章

用户从列表或首页点入 `/posts/[slug]`，页面显示：
- 顶部 2px accent 色进度条（`position:fixed; top:0`），随滚动实时填充。
- 左侧 sticky rail（桌面端）包含：元数据区（发表于 / 分类 / 阅读时长）、hairline 分隔、目录（H2/H3 条目，左边线高亮当前区块为 accent）、hairline 分隔、分享按钮组（Twitter / 微信 / 复制链接，圆形 hairline 按钮）。
- 正文区：上方分类标签（accent mono）+ 大标题 + dek 段落 + byline（36px 圆形头像 + 作者名 + 日期）。正文由 Markdown 渲染为带 prose 样式的 HTML（字体 Noto Sans SC/Geist，18px，行高 1.95）。
- 正文末尾 ◆（accent 色，22px）。
- 作者卡片（54px 头像 + 名字 + 简介，hairline 顶部边线）。
- 上一篇/下一篇卡片（hairline border，hover 上浮 2px，标题 hover 变 accent）。
- 页面底部评论区：已审核评论列表 + 提交表单（姓名必填、邮箱选填、网站选填、评论必填）。

---

## Key Files

| File | Responsibility |
|------|----------------|
| `packages/web/src/pages/writing/index.astro` | /writing 页面全部逻辑：数据拉取、分类计数、chip 渲染、featured/archive 布局、client-side 筛选脚本 |
| `packages/web/src/pages/posts/[slug].astro` | /posts/[slug] 文章页：getStaticPaths、Markdown 解析、TOC 注入、rail/prose/progress/share/comments 布局 |
| `packages/web/src/lib/writing.ts` | `selectTopCategories` / `groupByYear` / `selectFullYears` / `densityForYear` 纯函数 |
| `packages/web/src/lib/article.ts` | `injectHeadingIds`（索引式 id，CJK 兼容）/ `selectAdjacent`（上下篇查找） |
| `packages/web/src/components/ShareButtons.astro` | Twitter / 微信 QR / 复制链接三按钮，圆形 hairline 样式 |
| `packages/web/src/components/CommentSection.astro` | 评论列表（client-side fetch approved）+ 提交表单（token 样式）|
| `packages/web/src/lib/writing.test.ts` | 4 个函数的单元测试（selectTopCategories/groupByYear/selectFullYears/densityForYear）|
| `packages/web/src/lib/article.test.ts` | 2 个函数的单元测试（injectHeadingIds/selectAdjacent）|

---

## Boundary Conditions / Constraints

- featured post 在可筛选列表之外（无 `data-cats`，筛选不影响它），与 Home 的 featured/rest 拆分一致（crystal D-004）。
- 分类名含 HTML 实体（`&amp;` 等），chip 显示前须经 `decodeEntities` 处理（`writing.ts:36`）。
- 文章 `publishedAt` 为 null 时归入 year 0 组，显示「未知」，排在所有年份之后（`writing.ts:62-66`）。
- TOC 仅对 H2/H3 生成条目；H4+ 不注入 id 也不出现在目录；中文标题用索引式 id（`h-0`/`h-1`/…）避免空锚点（crystal D-008）。
- prose 样式必须用 `is:global`，因为正文经 `set:html` 注入，Astro scoped 样式对运行时注入的 DOM 不生效（crystal D-009）。
- `/categories`、`/archives`、`/tags`、`/page/[page]` 属于 Phase 7，本期不动（crystal Scope Boundaries）。
- 分享按钮和评论区必须保留（DP-002=A，crystal D-005/D-006），只允许改样式，不得删除功能。
- 旧 /posts/[slug] 衬线版式（Cormorant / `#c23a22` / 朱红）完全替换（crystal D-010）。

---

## Deviation Record

| # | Type | Design Intent | Current Implementation | Source |
|---|------|---------------|----------------------|--------|
| 1 | 变更 | Writing.html 设计稿的 4 个固定主题药丸：设计/工程/随笔/复盘（生活方式博客语境） | 实现使用真实数据库中发布篇数 ≥1 的前 6 个分类（Linux/Essay/Python/Shell/MacOS & Apple & PC/Other），从 API `getCategories` 动态获取 | crystal D-001；dev-guide Phase 3；用户 2026-05-30 确认 |
| 2 | 变更 | Writing.html 所有归档行均为 full 密度（日期+标题+摘要），无分层 | 实现按年份轴分两层：最近 2 年 full 密度，更早年份 compact 密度（无摘要）；由 `selectFullYears(posts, 2)` + `densityForYear()` 驱动 | crystal D-003；16 年跨度数据（2008-2025）按距今月数分层会塌缩为 125 条纯标题，用户 2026-05-30 确认 |
| 3 | 变更 | Article.html 的进度条（`.progress`）是 nav 内部的子元素，相对定位在 nav 底边（`position:absolute; bottom:-1px`），随 nav 一起 sticky | 实现为页面顶层 `position:fixed; top:0` 的独立元素（`[slug].astro:51,148-157`），始终贴窗口顶端，不属于 nav；经 crystal D-007 授权：「进度条由文章页自身渲染，不塞进 BaseLayout 的 nav」 | crystal D-007；`posts/[slug].astro:51,148-157` vs Article.html `.nav` 内 `.progress` |
| 4 | 变更 | Article.html 的 share 区只有 2 个按钮：复制链接 + 通用分享（share 图标），无 Twitter/微信 | 实现有 3 个按钮：Twitter + 微信 QR + 复制链接；比设计稿多一个，经 crystal D-005 授权：「保留现有三个按钮，重做成设计里的圆形 hairline 样式」（DP-002=A） | crystal D-005；`components/ShareButtons.astro:11-29`；scope-guard：设计未画 ≠ 删除，用户 2026-05-30 确认 |
| 5 | 推迟 | Article.html 有 `.pullquote` 样式类（大字引用，区别于 blockquote），设计稿正文中有实例：`<p class="pullquote">…</p>` | `.prose` 全局样式中无 `.pullquote` 规则；Markdown 渲染的内容中不会自动生成 pullquote 类 | Article.html `.pullquote` CSS 及正文示例；`posts/[slug].astro:449-550` |
| 6 | 推迟 | Article.html 有 `figure.figure > div.cover + p.figcap` 结构（16:9 占位 + 图注），用于文章配图说明 | `.prose` 全局样式中无 `figure`/`.cover`/`.figcap` 规则；Markdown 中的 `<figure>` 不会匹配任何设计样式 | Article.html `.cover`/`.figcap` CSS 及正文示例；`posts/[slug].astro:449-550` |
| 7 | 变更 | Article.html 的分类标签渲染为「{分类} · Essay」，其中「Essay」是设计稿生活方式博客的固定类型标签（语境：设计/工程/随笔类文章） | 实现硬编码 `{firstCat} · Essay`（`[slug].astro:98`），在 17 年技术博客上会渲染出「Linux · Essay」「Python · Essay」等语义上不准确的标签 | `posts/[slug].astro:98` vs Article.html `.reading .cat`；真实数据为 Linux/Python/Shell 等技术分类，与「Essay」类型标签不匹配 |

---

## Decisions

### [DP-003] pull-quote 和 figure/figcap 样式的补全方式 (recommended)

**Context:** 设计稿 Article.html 有 `.pullquote` 大字引用和 `figure.figure > .cover + .figcap` 图注两种 prose 内部样式（Deviation #5/#6），当前实现缺失。现有 17 年内容以纯 Markdown 编写，标准 Markdown 无 `pullquote` / `figure` 语义；要渲染需要在 Markdown 中嵌入原始 HTML，或通过 custom renderer 扩展 `marked`。
**Options:**
- A: 补全 CSS（在 `is:global` prose 块内添加 `.pullquote` 和 `figure .figcap` 规则），不改 Markdown；现有文章中若有手写 HTML 块则生效，否则对当前内容无视觉影响，向前兼容新文章手写 HTML 片段。— 成本极低（仅加 CSS）；现有 126 篇文章无此标记，短期内不可见。
- B: 补全 CSS + 扩展 `marked` custom renderer，将 `> ` 引用中以特定格式开头的文本渲染为 `pullquote`。— 向下兼容旧文章；但约定式转换有歧义风险，且需改 `marked` pipeline。
- C: 本期不处理，列为 Phase 7 / 内容工具改进项。— 最省；设计完整性有缺口。
**Recommendation:** Option A — `posts/[slug].astro:449` 的 `is:global` prose 块已有完整结构，只需追加两个 CSS 规则，零风险零 scope 扩大；不改 Markdown pipeline 则不引入 Phase 3 回归风险。`[slug].astro:449-550` 中所有 prose 规则均为纯 CSS 追加，该模式已验证可行。

### [DP-004] 分类标签硬编码「· Essay」后缀的处理方式 (recommended)

**Context:** `[slug].astro:98` 硬编码 `{firstCat} · Essay`，在技术博客中会渲染「Linux · Essay」「Python · Essay」，语义不准确（Deviation #7）。设计稿使用「Essay」是因其生活方式博客语境中所有内容均属 essay 体裁；真实 17 年技术博客的文章类型与分类（category）重合，不需要额外体裁标签。
**Options:**
- A: 删除 `· Essay` 后缀，只显示 `{firstCat}`。— 语义准确；单行改动（`[slug].astro:98`）；影响 126 篇已发布文章的 cat 标签区。
- B: 将「Essay」改为可配的 `postType` 字段，从 post.meta 读取（默认空）。— 更灵活；增加了未被现有设计/数据模型支持的字段复杂度。
- C: 保持现状，接受「Python · Essay」等标签。— 零改动；语义持续错位。
**Recommendation:** Option A — `posts/[slug].astro:98` 只需将 `{firstCat} · Essay` 改为 `{firstCat}`，单行修改，无任何 scope 扩大；设计稿中「· Essay」来自 lifestyle 博客语境，不适用于技术分类，这是设计源到真实数据的映射问题，与 chip 分类药丸的 D-001 处理原则一致（用真实数据替代 lifestyle 默认值）。

---

## Change History

| Date | Change |
|------|--------|
| 2026-05-31 | Initial spec (generated by /write-feature-spec) |
