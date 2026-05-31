# Decision Crystal: Phase 3 Visual Expectations (Writing + Article)

Date: 2026-05-31

## Initial Idea
重做 `/writing` 列表页与 `/posts/[slug]` 文章阅读页，套用 Writing.html / Article.html 设计。
设计稿是「生活方式博客」语气（5 个干净主题药丸、近期文章），但真实数据是 17 年的技术博客
（126 篇已发布，2008–2025，最后一篇 2025-06；12 个分类，分布极不均；25/126 多分类）。

## Discussion Points
- 设计稿 5 主题（设计/工程/随笔/复盘）在真实数据里不存在 → 改用真实分类。
- 用户提议「高频做药丸，其余在『全部』sub-page 展开」+「近期详细、超半年缩略、超一年只标题」。
- 实测日期分布：<6mo=0，6–12mo=1，>1yr=125 → 按「距今月数」分层会塌缩成全是标题。
  用户认可改用**年份轴**重新表达「近期详细、旧的精简」的原意。

## Rejected Alternatives
- 按距今 6mo/1yr 分层 — 数据跨 17 年、最后一篇约 1 年前，会塌缩为「125 条纯标题」。
- GitHub 式 slug 生成标题 id — 中文标题会产生空/冲突 id，破坏 TOC 锚点与滚动高亮。
- `/writing` 分页 — 与客户端药丸筛选互斥（筛选要求全部行在 DOM）；分页归档归 Phase 7。
- 把分享精简成设计稿的 2 个按钮 — scope-guard：设计未画 ≠ 删除现有功能。

## Decisions (machine-readable)
- [D-001] `/writing` 筛选药丸 = 高频分类（Linux/Essay/Python/Shell/MacOS & Apple & PC/Other，即已发布 ≥10 篇的 6 个）做客户端筛选 chip + 一个「全部」默认 chip；长尾分类经「全部分类 →」链接到现有 `/categories`（Phase 7 再重做样式）。chip 的 `data-cat` = 分类 slug。
- [D-002] 文章行的 `data-cats` = 空格分隔的全部分类 slug（25/126 篇多分类，单 slug 会错误隐藏）；筛选时按列表匹配。
- [D-003] `/writing` 归档按**年份分组**（年份标题倒序）；密度**逐年递减**：2025 与 2024 用完整行（日期+标题+摘要+meta），2023 及更早用精简行（日期+标题+分类，无摘要）。筛选时年份标题在该组无可见行时自动隐藏。
- [D-004] `/writing` featured = 单篇最新已发布文章（2025-06），完整 featured 卡；位于可筛选列表之外（无 data-cat，筛选时固定不动），与 Home 的 featured/rest 拆分一致。
- [D-005] Article 分享 = 保留现有三个按钮（Twitter / 微信 / 复制链接），重做成设计里的圆形 hairline 样式，放进左栏 `.rail`。
- [D-006] Article 评论 = 保留（DP-002=A），去掉 Tailwind class、改用新 token + hairline 样式、文案中文克制风，放在正文列下方。
- [D-007] Article 的 TOC / 滚动高亮 / 顶部阅读进度条 = 原生客户端脚本（无 Preact island，全站一致）；进度条由文章页自身渲染，不塞进 BaseLayout 的 nav。
- [D-008] 标题 id 构建时注入，采用**索引式 id**（`h-0`/`h-1`…）以兼容中文标题；TOC 锚点与注入 id 精确一致。
- [D-009] 正文经 `set:html` 注入 → prose 样式必须用 `:global()`（或 `is:global`），否则 Astro scoped 样式作用不到运行时注入的 DOM，正文静默无样式。
- [D-010] 旧 `/posts/[slug]` 衬线版式完全替换，文章页不再出现 Cormorant / 朱红。

## Constraints
- 分享、评论是现有功能，必须保留（DP-002=A），只重做样式 + 安置，不得删除。
- `/categories`、`/archives`、`/tags`、`/page/[page]` 的重做属于 Phase 7，本期不动（过渡期保持旧样式）。
- 分类名含 HTML 实体（`&amp;`）→ 复用 `decodeEntities`。

## Scope Boundaries
- IN: `/writing`（chips + featured + 年份分组归档 + 客户端筛选）；`/posts/[slug]` 新 Article 模板（rail/TOC/进度条/prose/作者卡/上下篇）；重做 ShareButtons + CommentSection 样式。
- OUT（Phase 7）: `/categories` 重做、`/archives`、`/tags`、`/page/[page]` 分页。

## Source Context
- Design doc: docs/design/reference/norvyn.com - Writing.html, norvyn.com - Article.html
- Dev-guide: docs/06-plans/2026-05-30-frontend-redesign-dev-guide.md Phase 3
- Data probe (2026-05-31): 126 published posts, 2008–2025; cats Linux 53/Essay 38/Python 18/Shell 13/MacOS 11/Other 11/HP-UX 4/AIX 4/Docker 3/EMC 3/Solaris 3/Uncat 0; 25 multi-category; recency <6mo=0/6-12mo=1/>1yr=125; marked@12.0.2 emits headings with no id.
