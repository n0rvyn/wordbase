# App 数据同步 — 决策记录

_定于 2026-05-30_

## 决策

- **设计**：沿用 `norvyn.com - Home v2.html` 设计系统。首页已交付；**App 详情/宣传页模板**由用户在 Claude Design 追加（提示词见 `app-detail-page-prompt.md`）。
- **App 元数据同步源 = ASC API + iTunes Lookup 结合**。
  - **iTunes Lookup**（公开，无密钥，按 `appStoreId` 查 `https://itunes.apple.com/lookup?id=<id>&country=cn`）：
    `averageUserRating`、`userRatingCount`、`releaseDate`、`currentVersionReleaseDate`、
    `minimumOsVersion`、`artworkUrl512`(图标)、`screenshotUrls`、`formattedPrice`、
    `primaryGenreName`(分类)、`version`、`description`。**已实测可用**（Numbers id=361304891）。
  - **App Store Connect API**（`.p8` + Key ID + Issuer ID，ES256 JWT，≤20min，aud=`appstoreconnect-v1`）：
    拿用户管理的文案——副标题、版本更新说明(whatsNew)、宣传文案、本地化描述、按版本/机型的截图。
  - **评分（★ + 评分数）破例只走 iTunes Lookup**（ASC 不返回聚合星级，只有单条 customerReviews）。

## 替代「Year」的字段（加真实列到 `apps`）

设计原本的手填 "Year" 用同步字段替代：

| 新列 | 来源 | 设计用途 |
|---|---|---|
| `category` | iTunes `primaryGenreName` / ASC 分类 | 「Productivity」 |
| `version` | iTunes/ASC `version` | 「v15.2」 |
| `releaseDate` (int ts) | iTunes `releaseDate` | 「自 2024」 |
| `currentVersionReleaseDate` (int ts) | iTunes | 「最近更新 …」 |
| `minimumOsVersion` | iTunes | 「iOS 18+」 |
| `featured` (int 0/1) | 手动 | 首页「主推」那一款 |
| `lastSyncedAt` (int ts) | 同步任务 | 记录上次同步 |
| `subtitle` / `whatsNew` (可选) | ASC | 详情页副标题/更新说明 |

已有可复用列：`appStoreId`、`rating`、`ratingCount`、`price`、`screenshots`、`icon`、`tagline`、`description`、`features`、`links`、`accentColor`。

## 待办（推荐顺序，未开工）

1. **首页落地**（Astro，接 `/api/apps`·`/api/posts`·`/api/podcasts` 真数据 + 暗色模式）— 后端已就绪，无外部阻塞。
2. **App 同步后端** — 加上表新列 + iTunes Lookup service + ASC(.p8) service + MCP/定时刷新。（需用户提供 `.p8`/Key ID/Issuer ID）
3. **App 详情页落地** — 待 Claude Design 详情页设计回来 + 步骤 2 的数据。
4. **Adam 每日自动发播客** — 接「自动」触发链路（Q2 缺的那一环）。
