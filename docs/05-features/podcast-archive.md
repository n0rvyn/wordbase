---
type: feature-spec
status: active
tags: [podcast, audio, rss, archive, empty-safe]
refs:
  - docs/06-plans/2026-05-30-frontend-redesign-dev-guide.md
---

# Podcast Archive

> A single-show podcast archive page at /podcast — hero with show info + RSS subscribe, featured (latest) episode with native audio, full episode list each with native audio, two-tier empty-safe rendering.

**Design sources:**
- `docs/06-plans/2026-05-30-frontend-redesign-dev-guide.md` Phase 5 — Goal, Scope, 用户可见的变化, Architecture decisions (DP-5.1 through DP-5.7)
- `docs/06-plans/2026-05-30-frontend-redesign-dev-guide.md` Phase 2 — Architecture decisions [D-D] (native audio), [D-C] (featured episode selection), Podcast section scope
- Pattern origin: Home v2 podcast block in `packages/web/src/pages/index.astro` `.feat-ep`/`.ep` markup (Podcast.html reference absent per dev-guide; Home v2 was the authoritative pattern source)

---

## User Stories

- 用户可以访问 /podcast 并看到播客节目的标题、简介和主播名 → `src/pages/podcast.astro:23,46-51` ✅
- 用户可以通过「订阅 · RSS ↗」按钮获取播客的 RSS Feed → `src/pages/podcast.astro:24,52-54` ✅
- 用户可以在页面顶部直接播放最新一期，无需跳转 → `src/pages/podcast.astro:106` ✅
- 用户可以在单集列表中逐集播放全部历史单集 → `src/pages/podcast.astro:127` ✅
- 用户可以看到每集的元信息：期号 / 日期 / 时长 → `src/lib/podcast.ts:38-47` ✅
- 用户可以在没有已发布播客时看到友好的空态提示（而非报错或假数据）→ `src/pages/podcast.astro:64-68` ✅
- 用户可以在播客存在但尚无单集时看到「暂无单集」提示 → `src/pages/podcast.astro:71-83` ✅
- 用户可以点击「在播客客户端收听」链接在外部客户端中打开节目（当 `podcast.link` 有值时）→ `src/pages/podcast.astro:55-58` ✅ (see DP-5-POST-001 — addition not in design scope, pending sign-off)

**Journey entry points (Phase 2 / cross-feature, not Phase 5 scope):** Home 页 hero CTA「订阅播客」（`index.astro:71`）和「全部单集」链接（`index.astro:229`）是当前到达 /podcast 的两个入口；导航/页脚接入属于 Phase 7 范围。

---

## Expected Behavior

### Scenario A: 无已发布播客

/podcast 渲染固定标题「播客」+ 脊柱序号 00 + lede「一档慢节奏的播客。」。Hero 下方显示一行 `播客即将上线，敬请期待。`。无 RSS 链接，无 `<audio>` 元素，无单集列表。

### Scenario B: 播客存在，无已发布单集

/podcast 使用真实节目标题、简介（截断 160 字符）和主播名渲染 Hero。「订阅 · RSS ↗」按钮可见，链接至 `/api/podcasts/:slug/feed.xml`（同源相对路径，经 Caddy 代理）。下方显示 `暂无单集。`。无 `<audio>` 元素。

### Scenario C: 播客存在且有已发布单集（正常状态）

- **Hero（序号 00）：** 节目标题（H1）+ eyebrow `Podcast · 主播 {author}`（优先 `podcast.author`，无则 `podcast.ownerName`）+ lede（简介截断 160 字符）+ 脊柱内 note（简介截断 40 字符）+ 「订阅 · RSS ↗」按钮。
- **Section 01 Latest：** `featuredEp` = episodeNumber 最大的单集（同 episodeNumber 取 createdAt 最大）。封面图 104×104px（优先节目封面，无则取单集封面，均无则显示节目名首字）。badge `EP.{N} · 最新一期`（若 episodeNumber 为 null 则仅「最新一期」）。`<audio controls preload="metadata" src={audioUrl}>`，宽度最大 420px。
- **Section 02 Episodes（归档列表）：** 包含除 featuredEp 之外的全部已发布单集，按 episodeNumber 降序（nulls last），同 episodeNumber 按 createdAt 降序。每行：标题 + meta 字符串（`EP.{N} · YYYY · MM · DD · NN min`，缺字段自动省略）+ `<audio controls preload="none" src={audioUrl}>`。
- **Meta 格式规则（`episodeMeta`）：** EP.{n} 仅在 episodeNumber != null 时出现；duration=0 或 null 时省略时长段；各段用 ` · ` 连接。
- **单节目选取（`selectShow`）：** 从已发布播客列表中选 sortOrder 最小的节目；sortOrder 相同（含均为 null）时取 createdAt 最早的；null sortOrder 排在数字之后。单一节目时确定性不变。

### 数据安全

`getEpisodes` 使用 `limit: 10000` 拉取全部已发布单集。`featuredEp` 与 archive 两个集合互斥（archive 过滤掉 featuredEp.id），不重复显示。

---

## Key Files

| File | Responsibility |
|------|----------------|
| `packages/web/src/pages/podcast.astro` | 页面模板；三种渲染态（A/B/C）；Hero、Section 01、Section 02 结构；页面内 CSS |
| `packages/web/src/lib/podcast.ts` | `selectShow`（单节目选取）、`sortEpisodes`（期号降序排列）、`episodeMeta`（元信息字符串构建） |
| `packages/web/src/lib/podcast.test.ts` | 以上三个函数的单元测试（23 个用例，vitest 113/113 全过） |
| `packages/web/src/lib/home.ts` | `selectFeaturedEpisode`（复用自 Phase 2）、`formatDuration`、`formatMonoDate`、`decodeEntities` |
| `packages/web/src/lib/api.ts` | `getPodcasts`、`getEpisodes`、`stripMarkdown`；`Podcast`/`Episode` 类型定义 |
| `packages/web/src/pages/index.astro` | Home 页播客区块（Section 03）：装饰性 `.mini` SVG play 图标 + 最近 5 集列表 + 「全部单集」链接（Phase 2 scope） |

---

## Boundary Conditions / Constraints

- `/podcast` 当前**未链接**至全站导航/页脚 chrome。导航/页脚链接接入属于 Phase 7 范围。当前到达路径：Home 页「订阅播客」CTA（`index.astro:71`）和「全部单集」链接（`index.astro:229`）。
- RSS Feed 链接使用相对路径 `/api/podcasts/:slug/feed.xml`（同源），在生产环境经 Caddy SNI 代理正确解析。
- 每页只选取单一节目（`selectShow` 返回首个）；多节目场景的列表视图属于已推迟的多节目扩展，当前不在范围内（DP-5.1）。
- 单集列表无分页；使用 `limit: 10000` 一次拉取全部已发布单集（当前数据量小，已知无性能问题）。
- 播客器件（audio element）使用浏览器原生控件，无自定义 JavaScript 播放器（DP-5.2，Phase 2 [D-D]）。
- `episodeMeta` 的日期来源于 `episode.createdAt`（Unix 时间戳，UTC），而非发布日期字段。
- `sortEpisodes` 不修改原数组（纯函数，返回新数组）。
- 封面图 alt 文本固定为节目标题（`showTitle`）。

---

## Deviation Record

None.

---

## Prototype-Only Flourishes Not Built

Phase 2 的 Home v2 原型在 `.ep` 行中使用了装饰性圆形 `.mini` SVG play 图标（`index.astro:220-226`）作为进入 /podcast 的视觉提示。该图标不是真实播放控件——它是静态 SVG，点击整行链接至 /podcast。

在 /podcast 的单集列表中，此装饰性 play 图标被替换为每行一个原生 `<audio controls preload="none">`（DP-5.2）。这不是功能缺失，而是设计决策的有意实现：faux JS player → native audio（Phase 2 [D-D]，DP-5.2）。

---

## Decisions

### [DP-5-POST-001] 「在播客客户端收听」按钮 (recommended)

**Context:** `podcast.astro:55-58` 在 `podcast.link` 非空时渲染一个额外的 `.btn-2` 按钮「在播客客户端收听」，链接至 `podcast.link`（外部客户端页面）。Phase 5 Scope 只规定了「Subscribe/RSS link」一个订阅入口，该按钮是实现中额外增加的行为，需要确认是否接受为有意增强。

**Options:**
- A: 保留该按钮，确认为有意增强 — `podcast.link` 字段已存在于数据模型（`src/lib/api.ts` 中的 `Podcast` 类型），按钮仅在该字段有值时才渲染，Scenario A/B 不受影响；对用户提供了额外的客户端跳转路径
- B: 移除该按钮，与 Phase 5 Scope 保持严格一致 — 减少未经设计审查的 UI 元素；若后续需要可在 Phase 6/7 中正式引入

**Recommendation:** Option A — `podcast.astro:55-58` 的条件渲染（`podcast.link &&`）与 `Podcast` 类型中已有的 `link` 字段自然对齐，行为有界，空态不受影响。

---

## Change History

| Date | Change |
|------|--------|
| 2026-05-31 | Initial spec (generated by /write-feature-spec) |
