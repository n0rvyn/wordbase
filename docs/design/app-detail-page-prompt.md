# Claude Design 追加提示词 — App 详情/宣传页

> 把下面 `---` 之间的整段，粘进你那个已有的 Claude Design 项目（里面已有 `norvyn.com - Home v2.html`）。
> 目的：在**同一套设计语言**下，追加一个 **App 详情/宣传页模板**（5 个 App 共用一套，换数据即可）。

---

继续 norvyn.com 这个项目。项目里已经有一份首页设计 `norvyn.com - Home v2.html`，
现在请基于**完全相同的设计系统**，新增一个页面：**单个 iOS App 的详情/宣传页**（App Detail / Landing）。
文件名：`norvyn.com - App Detail.html`。这是一个**模板**——我有 5+ 个 App，全都用这一套版式，只换内容。

## 必须沿用首页的设计语言（不要另起一套）
- 同一套 CSS 变量 token：`--accent:#2C4EE0`、light/dark 双主题（`:root[data-theme]`）、
  字体 `--font-display:Geist`、`--font-ui:Geist`、`--font-read:Noto Sans SC`、`--font-mono:Geist Mono`。
- 同样的「hairline，不是盒子」语言：分隔用 1px `--line`，不要卡片阴影堆叠。
- 同样的左侧 index 脊柱（spine：大号序号 + mono 小标签 + note），编排式留白、克制。
- **颜色只来自 App 图标 + 截图 + 一个 accent**，chrome 保持近单色暖白/纯黑。
- 顶部 nav 与 footer 与首页一致（nav 左 `norvyn ·`，右 Apps/Writing/Podcast + 主题切换；可加一个返回首页/返回作品的入口）。
- 暗色模式、响应式（≤880px 脊柱转横排、双栏塌成单栏）、`prefers-reduced-motion` 都要照顾，和首页同款。
- 右下角 Tweaks 面板（主题/accent/字体）可选，保留与否都行。

## 页面结构（从上到下）
1. **Hero**
   - 左 spine：序号（如 `▸` 或 App 首字母）+ 标签 `APP` + note（一句话定位）。
   - 主区：大号 **App 图标**（圆角方形，~96–120px）、**App 名称**（display 大字）、**一句话 tagline**。
   - meta 行（mono，hairline 分隔）：`分类` · `版本` · `★评分 (评分数)` · `价格` · `iOS 最低版本`。
   - 主 CTA 按钮：**App Store ↗**（accent 实心）；次 CTA：可选「了解更多 / 看截图」。
   - 右侧/下方：一个 **iPhone 机模** 或**首张主截图**（参考首页 .phone 机模样式）。
2. **Features**：一组「图标 + 标题 + 一句话」的特性，用首页那套 `.item` hairline 行语言竖排（3–6 条）。
3. **Screenshots 画廊**：横向滚动的截图条（圆角，等高），手机截图为主。
4. **About / 长描述**：正文用 `--font-read`，max-width ~60ch，编排式排版。
5. **小字 meta**：`自 {首发年份}` · `最近更新 {日期}` · `开发者 norvyn`。
6. **更多作品**：底部用 hairline 行列出其它 App（图标 + 名 + 分类），点进各自详情页。
7. **Footer**：与首页完全一致。

## 数据字段契约（请只用这些字段，别发明填不出来的字段）
每个 App 的可用数据（部分会从 App Store 自动同步）：
- `name` 名称、`tagline` 一句话、`icon` 图标 URL、`description` 长描述
- `category` 分类（如 Productivity）、`version` 版本号、`price` 价格
- `rating` 平均分、`ratingCount` 评分数、`minimumOsVersion` 最低 iOS
- `releaseDate` 首发日期、`currentVersionReleaseDate` 最近更新日期
- `appStoreUrl` 商店链接
- `features` 特性数组：`[{icon, title, blurb}]`
- `screenshots` 截图 URL 数组
- `accentColor` 该 App 的可选强调色（默认用站点 accent）
- `links` 额外链接对象（官网/支持/隐私）

用一个 Tidemark 的示例数据把模板填满，让我能直接看效果。

---

## 备注
- 如果之后还要 **博客列表页** / **播客归档页**，可以用同样方式追加：「基于同一设计系统，新增 Writing Index / Podcast Archive 页」。
- 这个模板对应后端 `apps` 表 + iTunes Lookup 同步（见 `docs/design/` 决策记录）。
