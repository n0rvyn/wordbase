---
type: plan
status: active
contract_version: 2
tags: [apps, app-store-connect, itunes-lookup, sync, jwt, drizzle, vitest]
refs: [docs/design/app-sync-decision.md]
---

# App Metadata Sync (iTunes Lookup + App Store Connect) Implementation Plan

**Goal:** 让 WordBase 的 iOS App 元数据能自动从 App Store 同步进 `apps` 表（公开数据走 iTunes Lookup，管理文案走 App Store Connect API），替代手填，供后续统一前端的 App 区/详情页消费。

**Architecture:** 在 `apps` 表上加真实列（category/version/releaseDate/currentVersionReleaseDate/minimumOsVersion/subtitle/whatsNew/featured/lastSyncedAt），因为 `db/index.ts` 只有 `CREATE TABLE IF NOT EXISTS`、无迁移机制，加列用幂等 `pragma table_info` + `ALTER TABLE ADD COLUMN`。新增三个 service：`appstore-lookup`（公开 iTunes Lookup，按 appStoreId）、`asc`（ASC API，jose 签 ES256 JWT，读 env 凭证）、`app-sync`（合并二者，**评分恒取 iTunes**，managed 文案取 ASC，写回 + lastSyncedAt）。刷新双轨（[DP-002]）：**ASC webhook 接收端点**（验签；App 版本状态变化事件 → 重同步该 App，低延迟刷新版本/更新说明/截图）+ **每日 cron**（外部触发 `POST /api/apps/sync` 兜住评分漂移，评分无 webhook）。另留 auth 手动同步端点 + MCP 工具。

**Tech Stack:** TypeScript, Drizzle ORM (better-sqlite3), Hono, jose (新增), nanoid, vitest, `@modelcontextprotocol`。

**Design doc:** not applicable（数据集成，非视觉）

**Design analysis:** not applicable

**Crystal file:** not applicable

**Bug diagnosis:** not applicable

**Threat model:** included（关键词：token, credential, secret, validate — ASC 私钥 + 外部 JSON 入库）

**Pre-flight risks:**
- `apps` 表已在生产存在（空）；新列必须走幂等 ALTER，不能只改 `CREATE TABLE`（否则已存在的表不会得到新列）。`db/index.ts:178-202`。
- 无 JWT 库（`package.json` deps 无 jsonwebtoken/jose）→ ASC 签名需新依赖或手写，见 [DP-001]。
- 无 scheduler/cron（grep `src` 无 setInterval/cron）→ 刷新调度需决策，见 [DP-002]。
- ASC 凭证（.p8/Key ID/Issuer ID）用户尚未提供：ASC service 可建+单测（mock + 测试用 EC 密钥），但 live 验证标注 ⚠️ 需凭证。
- ASC 各资源字段路径（apps→appInfos→primaryCategory、appStoreVersions→appStoreVersionLocalizations 的 whatsNew、appInfoLocalizations 的 subtitle/name）由 JS 渲染文档无法离线确认，impl 时需对真实 ASC 响应核对（有真实账号）。
- 既有 `apps` 字段 `rating`/`ratingCount`/`price`/`screenshots`/`icon` 复用，不新增重复列。

---

## Impact Map

**User path:** 无直接 UI（前端在等设计）。同步后 `apps` 行带上真实分类/版本/评分/截图/日期，供日后统一前端消费。新增 auth 端点 `POST /api/apps/:id/sync`、`POST /api/apps/sync`，公开验签端点 `POST /api/apps/asc-webhook`。
**Data path:** iTunes Lookup JSON + ASC API JSON → `app-sync` 合并 → `apps` 表（新列 + lastSyncedAt）。触发：ASC webhook（版本事件）/ 每日 cron（评分）/ auth 端点 / MCP 工具。
**Shared surfaces:** `db/schema.ts`、`db/index.ts`（加列 + ALTER）、`routes/apps.ts`（加 sync + webhook 路由）、`mcp/tools.ts`（加 sync 工具）、`package.json`（jose + 依据 DP-001）、`.env.example`（ASC 凭证 + webhook secret）。
**Existing consumers:** `app.service.ts`（createApp/updateApp/listApps）保持不变；`apps` 现有列语义不变。前面已建的 podcast/posts 流程不触碰。
**Must remain unchanged:** `apps` 现有列与 CRUD 行为；其它表与路由；默认 DB 路径 `./data/blog.db`；现有 MCP 工具；route 错误形状 `{ error: { code, message } }`。
**Regression checks:** `tsc --noEmit` clean；`vitest run` 既有 42 测试仍绿；无凭证启动 API 仍正常（ASC 缺失不崩，sync 退化为仅 iTunes）；`apps` CRUD 路由不变。

---

## Threat Model

**Attack surface:**
- ASC 私钥（.p8）= 高价值密钥。来源：env（`ASC_PRIVATE_KEY` PEM 或 `ASC_PRIVATE_KEY_PATH`）。风险：日志泄露、入库泄露。缓解：只从 env/文件读，**绝不写日志、绝不入 content DB**（见 [DP-003] 选 env）。
- 外部 JSON（iTunes Lookup / ASC 响应）入库 → 类型混入 / 超长字段。缓解：每个字段显式类型强制（数字 `Number()` + 有限性检查、日期 `Date.parse` 失败→null、字符串截断或原样存 TEXT），未知字段丢弃。
- 出站 fetch URL：iTunes Lookup 用固定 host + 仅注入数字 `appStoreId`（`encodeURIComponent` + 正则 `^\d+$` 校验）；ASC 用固定 base + 数字 id。防 SSRF/注入。
- **Webhook 端点 `POST /api/apps/asc-webhook` 是公开的（无 authMiddleware）**→ 伪造/重放。缓解：用 `ASC_WEBHOOK_SECRET` 验签（HMAC，签名方案 impl 时对 Apple 文档/真实通知核对）；验签失败→401 且不触发任何同步；端点副作用仅限“重同步已存在的 App”（不创建/删除），即使绕过签名最坏只是触发一次幂等同步；可加按 appStoreId 的简单节流。

**Failure modes:**
- ASC 凭证缺失/无效 → `asc.service` 抛明确 `ASC_NOT_CONFIGURED`；`app-sync` 捕获后**退化为仅 iTunes**（评分/截图/分类仍可得），不崩、不静默全失败。
- iTunes Lookup `resultCount=0`（下架/错误 id）→ 返回 null；`syncApp` 记录“未找到”，不清空已有数据。
- JWT 签名失败 → 抛错并被 `syncAllApps` 单条捕获，不影响其它 App。

**Resource lifecycle:**
- 无临时文件/子进程/socket 常驻。fetch 用一次性请求；token 在内存缓存（带 exp，无需清理）。`.p8` 若用 `ASC_PRIVATE_KEY_PATH` 仅读不写。

**Input validation requirements:**
- `appStoreId`：入站校验 `^\d+$`，否则 400/抛错（防 URL 注入）。
- JWT claims：`exp` ≤ now+1200s（20 分钟硬上限，aud=`appstoreconnect-v1`）。
- 外部日期：ISO8601 → `Math.floor(Date.parse(x)/1000)`，NaN→null。
- 数值：`averageUserRating`/`userRatingCount` → `Number`，非有限→null。

---

## Decisions

### [DP-001] ASC ES256 JWT 的签名方式（recommended）

**Context:** ASC API 要求 ES256 JWT（.p8 EC P-256 私钥）。代码库无 JWT 库（`package.json` deps 无 jsonwebtoken/jose）。
**Options:**
- A: 加 `jose` 依赖（`importPKCS8` + `SignJWT`，原生支持 ES256 + PKCS8）。— 多一个依赖；签名/密钥导入有成熟实现。
- B: 用 node:crypto 手写（`createSign('SHA256')` + EC key）。— 零依赖；但 node 默认产 DER 签名，ES256 JWT 要 raw r‖s，需手动 DER→JOSE 转换，易错。
**Recommendation:** A（jose）— 手写 DER→JOSE 是已知易错点；`jose` 是 ESM-first、被广泛使用，与本项目 `"type":"module"` 契合。
**Chosen:** A（jose）— 用户确认 2026-05-30。

### [DP-002] 同步刷新的调度方式（recommended）

**Context:** App 元数据需周期刷新。ASC 提供 webhook（WWDC25），事件含「App 版本状态变化」，但**评分/评分数无 webhook**（持续漂移、非事件）。代码库无 in-process scheduler。
**Options:**
- A: 仅 auth 端点 + 外部 cron 全轮询。— 简单；新版本上架要等下次 cron 才刷新。
- B: 仅 webhook。— 事件驱动；但评分无 webhook，会过期。
- C: webhook（版本事件→重同步版本/文案/截图）+ 每日 cron（拉评分）。— 版本类低延迟、评分不过期；需在 ASC 后台配 webhook URL+secret，并写验签接收端点。
**Recommendation:** C — webhook 覆盖事件型字段、cron 兜住无事件的评分，二者互补；契合现有“被触发”架构（`build.service.ts` 同模式）。
**Chosen:** C（webhook + 每日 cron 评分）— 用户确认 2026-05-30。

### [DP-003] ASC 凭证存放（recommended）

**Context:** 需存 Key ID / Issuer ID / .p8 私钥 + webhook secret。
**Options:**
- A: env 变量（`ASC_KEY_ID`/`ASC_ISSUER_ID`/`ASC_PRIVATE_KEY` 或 `_PATH` + `ASC_WEBHOOK_SECRET`），写入 `.env.example` 文档化。— 密钥不入库；与现有 `WORDBASE_DB_PATH`/`SITE_URL` env 模式一致。
- B: 存 `settings` 表。— 可经 API 改；但私钥进 content DB（备份/泄露面扩大）。
**Recommendation:** A — `settings` 表服务于站点内容配置，私钥属机密，应留在 env；`db/index.ts:5` 已确立 env 配置先例。
**Chosen:** A（env）— 用户确认 2026-05-30。

---

<!-- section: task-1 keywords: schema, db-index, apps, alter-column -->
### Task 1: Schema — 给 `apps` 加同步列（幂等 ALTER）

⚠️ No test: 纯 schema/DDL；由 boot + `pragma table_info` 验证，非单元逻辑。

**Maps to Impact Map:** Data path, Shared surfaces（db/schema.ts, db/index.ts）

**Files:**
- Modify: `packages/api/src/db/schema.ts`
- Modify: `packages/api/src/db/index.ts`

**Expected outcome:** 重启 API 后，`apps` 表（无论新建还是已存在的空表）都拥有新列；Drizzle `App`/`NewApp` 类型含新字段。

**Non-goals:** 不动其它表；不引入 drizzle-kit 迁移；不删除/改名现有 `apps` 列。

**Touched surface:** `db/schema.ts` apps 定义；`db/index.ts` apps CREATE + 新增 ALTER 块。

**Regression shield:** 现有 14 张表 DDL 不变；现有 apps 列不变；`ALTER` 仅在列缺失时执行（幂等）。

**Task Contract:**
- Expected behavior: 系统能为每个 App 记录额外保存分类、版本、首发/更新日期、最低系统、副标题、更新说明、是否主推、上次同步时间；用户暂时看不到变化。
- Automated verify: `cd packages/api && npx tsc --noEmit` clean；`WORDBASE_DB_PATH=/tmp/t.db node -e "..."` 后 `pragma table_info(apps)` 含全部新列（命令见 Verify）。
- Real path verify: 启动 API（默认 DB），`sqlite3 ./data/blog.db "pragma table_info(apps)"` 列出新列。
- Manual/device verify: none.

**Steps:**
1. `schema.ts` 的 `apps` 定义追加：`category: text('category')`、`version: text('version')`、`releaseDate: integer('release_date')`、`currentVersionReleaseDate: integer('current_version_release_date')`、`minimumOsVersion: text('minimum_os_version')`、`subtitle: text('subtitle')`、`whatsNew: text('whats_new')`、`featured: integer('featured').notNull().default(0)`、`lastSyncedAt: integer('last_synced_at')`。`App`/`NewApp` 类型自动带上。
2. `db/index.ts`：在 `CREATE TABLE IF NOT EXISTS apps (...)` 内补同样的列（供全新 DB），含 `featured INTEGER NOT NULL DEFAULT 0` 等。
3. `db/index.ts` 的 `initializeDatabase()` 里、在建表的 `sqlite.exec(\`...\`)` 调用**之后**（函数体内，不在那段模板字符串里）追加**幂等 ALTER 块**（处理已存在的表；顺序必须在 CREATE TABLE apps 之后）：
   ```ts
   const appCols = new Set(
     (sqlite.prepare("PRAGMA table_info(apps)").all() as { name: string }[]).map(c => c.name)
   );
   const addCol = (name: string, ddl: string) => {
     if (!appCols.has(name)) sqlite.exec(`ALTER TABLE apps ADD COLUMN ${ddl};`);
   };
   addCol('category', 'category TEXT');
   addCol('version', 'version TEXT');
   addCol('release_date', 'release_date INTEGER');
   addCol('current_version_release_date', 'current_version_release_date INTEGER');
   addCol('minimum_os_version', 'minimum_os_version TEXT');
   addCol('subtitle', 'subtitle TEXT');
   addCol('whats_new', 'whats_new TEXT');
   addCol('featured', "featured INTEGER NOT NULL DEFAULT 0");
   addCol('last_synced_at', 'last_synced_at INTEGER');
   ```
   （SQLite 的 `ADD COLUMN` 支持 `NOT NULL DEFAULT 常量`。）

**Verify:**
Run: `cd packages/api && npx tsc --noEmit && WORDBASE_DB_PATH=/tmp/apps_t.db node --input-type=module -e "import('./src/db/index.ts').catch(()=>{})" 2>/dev/null; rm -f /tmp/apps_t.db; echo ok`
说明：tsc 必须 0；初始化逻辑由 Task 2-tests 的 in-memory boot 真正断言列存在（sanity 已建表机制）。
<!-- /section -->

<!-- section: task-2-tests keywords: appstore-lookup, itunes, mapping, vitest -->
### Task 2-tests: iTunes Lookup service（tests）

**Maps to Impact Map:** Data path, Attack surface（外部 JSON、appStoreId 校验）

**Files:**
- Create: `packages/api/src/__tests__/appstore-lookup.service.test.ts`

**Expected outcome:** 失败测试钉住映射与边界：字段映射、`resultCount=0`→null、非法 id 抛错、日期/数值强制。

**Task Contract:**
- Expected behavior: 给一个 App Store 数字 ID，能拿到归一化的分类/版本/评分/截图/首发&更新日期/最低系统；下架或错误 ID 返回空而非崩溃。
- Automated verify: `npx vitest run src/__tests__/appstore-lookup.service.test.ts` 在 2-impl 前 FAIL（`lookupApp is not a function`）。
- Real path verify: n/a（mock fetch）。
- Manual/device verify: none.

**Steps:**
1. `vi.stubGlobal('fetch', vi.fn(...))` 返回一段真实形状的 Lookup JSON（参考实测 Numbers：`primaryGenreName`/`version`/`releaseDate`/`currentVersionReleaseDate`/`averageUserRating`/`userRatingCount`/`minimumOsVersion`/`artworkUrl512`/`screenshotUrls`/`formattedPrice`）。
2. 断言 `lookupApp('361304891')` 映射：`category==='Productivity'`、`releaseDate` 为 unix 秒（数字）、`rating` 为数字、`screenshots` 为数组、`icon===artworkUrl512`。
3. 断言 `resultCount:0` → `null`。
4. 断言 `lookupApp('abc')`（非数字）抛错（不发起 fetch）。
5. 断言坏日期 → 该字段 null（不抛）。

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/appstore-lookup.service.test.ts`
Expected: FAIL（service 未实现）。
<!-- /section -->

<!-- section: task-2-impl keywords: appstore-lookup, itunes, fetch -->
### Task 2-impl: iTunes Lookup service（impl）

**Depends on:** Task 2-tests

**Files:**
- Create: `packages/api/src/services/appstore-lookup.service.ts`

**Expected outcome:** `lookupApp(appStoreId, country='cn')` 返回归一化对象或 null。

**Regression shield:** 不改 Task 2-tests 文件。纯函数 + 一次 fetch。

**Task Contract:**
- Expected behavior: 同 Task 2-tests。
- Automated verify: `npx vitest run src/__tests__/appstore-lookup.service.test.ts` PASS；`tsc --noEmit` 0。
- Real path verify: `node -e` 真打 `https://itunes.apple.com/lookup?id=361304891&country=cn`，打印 category/rating（⚠️ 需网络）。
- Manual/device verify: none.

**Steps:**
1. 校验 `^\d+$`，否则 `throw new Error('invalid appStoreId')`。
2. `fetch(\`https://itunes.apple.com/lookup?id=${id}&country=${encodeURIComponent(country)}\`)`，非 ok 抛错。
3. `resultCount<1` → return null。
4. 映射 `results[0]` → `{ category, version, releaseDate, currentVersionReleaseDate, minimumOsVersion, rating, ratingCount, price, icon, screenshots, description }`，含 `toTs`(ISO→秒,NaN→null)、`toNum`(有限→数字,否则 null)。
5. 导出 `lookupApp` 与归一化类型 `ItunesAppMeta`。

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/appstore-lookup.service.test.ts && npx tsc --noEmit`
Expected: 绿；tsc 0。
<!-- /section -->

<!-- section: task-3-tests keywords: asc, jwt, es256, vitest -->
### Task 3-tests: App Store Connect service（tests）

**Depends on:** [DP-001] 已定（jose）

**Maps to Impact Map:** Attack surface（私钥、JWT exp）, Data path

**Files:**
- Create: `packages/api/src/__tests__/asc.service.test.ts`

**Expected outcome:** 失败测试钉住：JWT header `alg=ES256`+`kid`、payload `aud=appstoreconnect-v1`+`exp≤now+1200`+`iss`；凭证缺失抛 `ASC_NOT_CONFIGURED`；mock 响应映射。

**Task Contract:**
- Expected behavior: 配好 ASC 凭证时能取到你管理的 App 文案（副标题/更新说明/分类/版本/截图）；没配凭证时给出明确“未配置”错误。
- Automated verify: `npx vitest run src/__tests__/asc.service.test.ts` 在 3-impl 前 FAIL。
- Real path verify: n/a（mock）+ 真账号 live（⚠️ 需 .p8）。
- Manual/device verify: none.

**Steps:**
1. 测试内用 `node:crypto generateKeyPairSync('ec',{namedCurve:'P-256'})` 导出 PKCS8 PEM 当假 `.p8`，set `ASC_KEY_ID/ISSUER_ID/PRIVATE_KEY` env。
2. 断言 `getAscToken()` 产出的 JWT：用 jose `decodeProtectedHeader` 得 `alg==='ES256'`、`kid===keyId`；解 payload `aud==='appstoreconnect-v1'`、`iss===issuerId`、`exp-iat<=1200`。
3. 断言缺 env → `fetchAppMetadata` 抛 `ASC_NOT_CONFIGURED`。
4. mock `fetch` 返回 apps/appInfos/appStoreVersions 形状，断言映射出 `{category, version, subtitle, whatsNew, screenshots}`（字段路径以 impl 注释为准）。

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/asc.service.test.ts`
Expected: FAIL。
<!-- /section -->

<!-- section: task-3-impl keywords: asc, jose, jwt, app-store-connect -->
### Task 3-impl: App Store Connect service（impl）

**Depends on:** Task 3-tests

**Files:**
- Modify: `packages/api/package.json`（加 `jose` 依赖，[DP-001]）
- Create: `packages/api/src/services/asc.service.ts`
- Modify: `packages/api/.env.example`（ASC 凭证，[DP-003]）

**Expected outcome:** `getAscToken()`（ES256 JWT，≤20min，内存缓存）、`fetchAppMetadata(appStoreId)`（取 managed 文案）、`isAscConfigured()`。

**Regression shield:** 不改 Task 3-tests 文件。凭证只从 env 读，绝不 log。

**Task Contract:**
- Expected behavior: 同 Task 3-tests。
- Automated verify: `npx vitest run src/__tests__/asc.service.test.ts` PASS；`tsc --noEmit` 0。
- Real path verify: ⚠️ 需 .p8 — `ASC_*` 配好后 `node -e` 调 `fetchAppMetadata('<你的appId>')` 打印 category/whatsNew。
- Manual/device verify: none.

**Steps:**
1. `pnpm add jose`（在 packages/api）。
2. 读 env：`ASC_KEY_ID`、`ASC_ISSUER_ID`、`ASC_PRIVATE_KEY`（PEM）或 `ASC_PRIVATE_KEY_PATH`（读文件）。`isAscConfigured()` = 三者齐全。**注意**：从 env 读的 `ASC_PRIVATE_KEY` 常含字面 `\n`，传给 `importPKCS8` 前必须 `.replace(/\\n/g, '\n')` 规范化（否则解析失败）；`.env.example` 注明优先用 `ASC_PRIVATE_KEY_PATH` 指向 `.p8` 文件以规避此坑。
3. `getAscToken()`：`importPKCS8(pem,'ES256')` → `new SignJWT({}).setProtectedHeader({alg:'ES256',kid:keyId,typ:'JWT'}).setIssuedAt().setIssuer(issuerId).setAudience('appstoreconnect-v1').setExpirationTime('19m').sign(key)`；缓存 token 至 exp 前 60s。
4. `fetchAppMetadata(appStoreId)`：`Bearer` token 调 ASC（base `https://api.appstoreconnect.apple.com`）：`/v1/apps/{id}?include=appInfos` 取分类、`/v1/apps/{id}/appStoreVersions?limit=1` 取最新 versionString + 其 `appStoreVersionLocalizations`（whatsNew/description/promotionalText）、`appInfoLocalizations`（subtitle/name）。⚠️ 字段/关系路径 impl 时对真实响应核对后定稿（见 Pre-flight）。映射 `{category, version, subtitle, whatsNew, description, screenshots}`，缺失项 null。
5. 凭证缺失路径抛 `Error('ASC_NOT_CONFIGURED')`。
6. `.env.example` 加注释 + 三个 `ASC_*` 占位。

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/asc.service.test.ts && npx tsc --noEmit`
Expected: 绿；tsc 0。
<!-- /section -->

<!-- section: task-4-tests keywords: app-sync, merge, precedence, vitest -->
### Task 4-tests: 合并同步 service（tests）

**Maps to Impact Map:** Data path, Must remain unchanged, Regression checks

**Files:**
- Create: `packages/api/src/__tests__/app-sync.service.test.ts`

**Expected outcome:** 失败测试钉住合并优先级与写回：**评分恒取 iTunes**（即使 ASC 在场）；subtitle/whatsNew 取 ASC；category/version/screenshots 优先 ASC、缺则 iTunes；写 `lastSyncedAt`；无 `appStoreId` 的 App 报错/跳过；ASC 未配置时退化为仅 iTunes。

**Task Contract:**
- Expected behavior: 一次同步后，该 App 的评分来自公开商店、管理文案来自 ASC，其余取到的就填上，并记录同步时间；没配 ASC 也能只靠 iTunes 完成。
- Automated verify: `npx vitest run src/__tests__/app-sync.service.test.ts` 在 4-impl 前 FAIL。
- Real path verify: n/a（mock 两 service）。
- Manual/device verify: none.

**Steps:**
1. `beforeEach` 重置 apps 表（复用 `helpers.resetNewTables` 或直接 delete）；插一条带 `appStoreId` 的 app。
2. `vi.mock` `appstore-lookup.service`（返回含 rating=4.7 + category='X-itunes'）与 `asc.service`（`isAscConfigured`→true，返回 subtitle + category='X-asc'）。
3. 断言同步后行：`rating===4.7`（iTunes）、`subtitle` 来自 ASC、`category==='X-asc'`（ASC 优先）、`lastSyncedAt` 非空。
4. ASC `isAscConfigured`→false：断言 `category==='X-itunes'`、`subtitle` 不变（不被清空）、不抛。
5. 无 `appStoreId` 的 app：`syncApp` 抛/返回错误对象（不写脏数据）。

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/app-sync.service.test.ts`
Expected: FAIL。
<!-- /section -->

<!-- section: task-4-impl keywords: app-sync, merge, lastsynced -->
### Task 4-impl: 合并同步 service（impl）

**Depends on:** Task 4-tests, Task 2-impl, Task 3-impl

**Files:**
- Create: `packages/api/src/services/app-sync.service.ts`

**Expected outcome:** `syncApp(appId)`（合并写回 + lastSyncedAt）、`syncAllApps()`（遍历有 appStoreId 的 app，单条 try/catch，回 `{synced, failed[]}`）。

**Regression shield:** 不改 Task 4-tests；不改 `app.service.ts` 现有函数；rating/ratingCount 永远来自 iTunes。

**Task Contract:**
- Expected behavior: 同 Task 4-tests。
- Automated verify: `npx vitest run src/__tests__/app-sync.service.test.ts` PASS；`tsc --noEmit` 0。
- Real path verify: Task 5 端点 live。
- Manual/device verify: none.

**Steps:**
1. 载入 app（`app.service.getApp` 或直接查），无则返回 not-found；无 `appStoreId` → 抛/错误对象。
2. `const itunes = await lookupApp(app.appStoreId)`；`const asc = isAscConfigured() ? await fetchAppMetadata(app.appStoreId).catch(()=>null) : null`。
3. 合并（先 `const cur = app`，每个字段都以 `cur.{field}` 兜底，避免清空手填）：`rating/ratingCount` ← itunes（恒）；`subtitle/whatsNew` ← asc；`category/version/screenshots` ← asc 优先；其余 ← itunes。具体表达式如：
   ```ts
   const set = {
     rating: itunes?.rating ?? cur.rating,
     ratingCount: itunes?.ratingCount ?? cur.ratingCount,
     category: asc?.category ?? itunes?.category ?? cur.category,
     version: asc?.version ?? itunes?.version ?? cur.version,
     screenshots: asc?.screenshots ?? itunes?.screenshots ?? cur.screenshots, // 存 JSON 字符串
     subtitle: asc?.subtitle ?? cur.subtitle,
     whatsNew: asc?.whatsNew ?? cur.whatsNew,
     releaseDate: itunes?.releaseDate ?? cur.releaseDate,
     currentVersionReleaseDate: itunes?.currentVersionReleaseDate ?? cur.currentVersionReleaseDate,
     minimumOsVersion: itunes?.minimumOsVersion ?? cur.minimumOsVersion,
     price: itunes?.price ?? cur.price,
     icon: itunes?.icon ?? cur.icon,
     description: itunes?.description ?? cur.description,
     lastSyncedAt: now, updatedAt: now,
   };
   ```
   （`??` 只在源为 null/undefined 时回退到当前值，取到的新值会覆盖。）
4. `db.update(apps).set({...merged, lastSyncedAt: now, updatedAt: now}).where(eq(apps.id, app.id))`。
5. `syncAllApps()`：列出 `appStoreId IS NOT NULL` 的 app，逐条 `syncApp` try/catch 收集。

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/app-sync.service.test.ts && npx tsc --noEmit`
Expected: 绿；tsc 0。
<!-- /section -->

<!-- section: task-5-tests keywords: routes, mcp, sync, vitest -->
### Task 5-tests: sync 路由 + MCP 工具（tests）

**Maps to Impact Map:** User path, Shared surfaces（routes/apps.ts, mcp/tools.ts）, Regression checks

**Files:**
- Create: `packages/api/src/__tests__/routes.app-sync.test.ts`

**Expected outcome:** 失败测试钉住：`POST /api/apps/:id/sync` 与 `POST /api/apps/sync` 需 auth、调用 `app-sync`（mock）、返回 200；`registerTools` 注册 `app_sync`/`app_sync_all` 且保留既有工具。

**Task Contract:**
- Expected behavior: 管理员能手动触发单个/全部 App 同步；MCP 客户端能看到 app_sync 工具。
- Automated verify: `npx vitest run src/__tests__/routes.app-sync.test.ts` 在 5-impl 前 FAIL。
- Real path verify: 5-impl 的 live curl。
- Manual/device verify: none.

**Steps:**
1. `vi.mock('../services/app-sync.service.js')`，spy `syncApp`/`syncAllApps`。
2. 复用既有 route 测试的 Bearer 鉴权播种法（`api_keys` + bcrypt，参考 `routes.podcast-apps.test.ts`）。
3. 断言：无 auth → 401；带 auth `POST /api/apps/:id/sync` → 200 且 spy 调用；`POST /api/apps/sync` → 200 且 `syncAllApps` 调用。
4. fake server 调 `registerTools`，断言工具名含 `app_sync`、`app_sync_all`，且仍含 `app_create`、`blog_create_post`。

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/routes.app-sync.test.ts`
Expected: FAIL。
<!-- /section -->

<!-- section: task-5-impl keywords: routes-apps, mcp-tools, sync, build-trigger -->
### Task 5-impl: sync 路由 + MCP 工具（impl）

**Depends on:** Task 5-tests, Task 4-impl

**Files:**
- Modify: `packages/api/src/routes/apps.ts`
- Modify: `packages/api/src/mcp/tools.ts`

**Expected outcome:** auth `POST /:id/sync`、`POST /sync`（注意路由顺序：`/sync` 须在 `/:slug` GET 之外、且不与 `:id` 冲突——用 POST 方法区分；`/sync` 字面量放在 `POST /:id/sync` 之前注册以免被当作 id）；MCP `app_sync`、`app_sync_all`。同步成功后对 published app `triggerBuild()`（fire-and-forget）。

**Regression shield:** 不改 Task 5-tests；不动既有 apps GET/POST/PUT/DELETE/publish 行为与既有 MCP 工具。

**Task Contract:**
- Expected behavior: 同 Task 5-tests；live 可验。
- Automated verify: `npx vitest run src/__tests__/routes.app-sync.test.ts` PASS；`tsc --noEmit` 0。
- Real path verify: dev server 起 + `KEY` 设好后 curl（见 Verify）。
- Manual/device verify: none.

**Steps:**
1. `routes/apps.ts`：`appsRouter.post('/sync', authMiddleware, ...)` → `syncAllApps()`；`appsRouter.post('/:id/sync', authMiddleware, ...)` → `syncApp(id)`。两者放在文件内 auth 段；`/sync` 字面量路由先于 `/:id/sync` 注册。成功后若该 app `status==='published'` 调 `triggerBuild()`。
2. `mcp/tools.ts`：加 `app_sync`（参数 id）与 `app_sync_all`（无参），自然语言描述（如 “Sync an app's metadata from the App Store (rating/category/version/screenshots)”），调 `appSyncService`。
3. 标准错误形状 `{ error: { code, message } }`。

**Verify:**
Run（dev server 起、`KEY` 设好、库里有一条带 appStoreId 的 published app）:
```
curl -s -XPOST localhost:4100/api/apps/sync -H "Authorization: Bearer $KEY" | head -c 200
```
Expected: 200 JSON（`{synced:...}`）；无 auth 返回 401。
<!-- /section -->

<!-- section: task-6-tests keywords: webhook, asc, signature, vitest -->
### Task 6-tests: ASC webhook 接收端点（tests）

**Depends on:** [DP-002] 已定（webhook + cron）

**Maps to Impact Map:** User path, Attack surface（公开端点验签）, Data path

**Files:**
- Create: `packages/api/src/__tests__/routes.asc-webhook.test.ts`

**Expected outcome:** 失败测试钉住：验签通过且事件为「App 版本状态变化」时，按 payload 的 app id 解析到本地 app（by appStoreId）并调 `syncApp`（mock）；验签失败→401 且不调 sync；未知/无关事件→200 但不调 sync；找不到对应 app→200 且不抛。

**Task Contract:**
- Expected behavior: 你在 ASC 发新版本上架后，WordBase 收到通知就自动刷新那个 App 的元数据；伪造的通知被拒。
- Automated verify: `npx vitest run src/__tests__/routes.asc-webhook.test.ts` 在 6-impl 前 FAIL。
- Real path verify: 6-impl 的 live（⚠️ 需在 ASC 后台配 webhook + 真实通知）。
- Manual/device verify: none.

**Steps:**
1. `vi.mock('../services/app-sync.service.js')` spy `syncApp`。
2. 用 `ASC_WEBHOOK_SECRET` 对一段「版本状态变化」样例 body 算出签名，构造合法请求；断言 → 200 + `syncApp` 以解析出的 app 调用。
3. 篡改签名/缺签名 → 401，`syncApp` 不被调。
4. 库里无匹配 appStoreId 的 app → 200，不抛，不调 sync。
5. 无关事件类型 → 200，不调 sync。
   注：签名头名与算法以 Apple `configuring-webhook-notifications` 文档/真实通知为准（impl 时核对），测试用 impl 暴露的 `verifyAscSignature(body, sig, secret)` 纯函数对齐。

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/routes.asc-webhook.test.ts`
Expected: FAIL。
<!-- /section -->

<!-- section: task-6-impl keywords: webhook, asc, hmac, routes-apps -->
### Task 6-impl: ASC webhook 接收端点（impl）

**Depends on:** Task 6-tests, Task 4-impl, Task 5-impl

**Files:**
- Modify: `packages/api/src/routes/apps.ts`
- Modify: `packages/api/src/.env.example`（加 `ASC_WEBHOOK_SECRET` + 配置说明）
- Create: `packages/api/docs/asc-webhook-setup.md`（用户在 ASC 后台配 webhook URL/secret 的步骤；含每日 cron 拉评分的 crontab 示例 `curl -XPOST .../api/apps/sync -H "Authorization: Bearer $KEY"`）

**Expected outcome:** 公开 `POST /api/apps/asc-webhook`：读原始 body 验签（`ASC_WEBHOOK_SECRET`，HMAC，方案对 Apple 文档核对）；失败 401；通过后解析事件，「App 版本状态变化」→ 按 payload app id 查 `apps`（by appStoreId）→ `syncApp`（fire-and-forget）+ published 则 `triggerBuild()`；其它事件/无匹配 → 200 no-op。

**Regression shield:** 不改 Task 6-tests；webhook 端点不加 `authMiddleware`（靠验签）；副作用仅“重同步已存在 App”，不创建/删除。

**Task Contract:**
- Expected behavior: 同 Task 6-tests。
- Automated verify: `npx vitest run src/__tests__/routes.asc-webhook.test.ts` PASS；`tsc --noEmit` 0。
- Real path verify: ⚠️ 需 ASC 后台配 webhook 指向本端点 + 真实新版本事件；或本地用正确签名 curl 一段样例 body 看 200 + 日志触发 sync。
- Manual/device verify: none.

**Steps:**
1. `routes/apps.ts` 加 `appsRouter.post('/asc-webhook', async (c) => {...})`（无 authMiddleware）。用 `await c.req.text()` 取原始 body 算签名，再 `JSON.parse`（验签基于原始字节）。
2. 导出/实现纯函数 `verifyAscSignature(rawBody, signatureHeader, secret)`（便于 Task 6-tests），签名方案以 `configuring-webhook-notifications` 为准；缺 `ASC_WEBHOOK_SECRET` env → 一律 401（未配置即拒）。
3. 验签失败 → `c.json({error:{code:'UNAUTHORIZED',message:'bad signature'}},401)`。
4. 解析事件类型；非「App 版本状态变化」→ `return c.json({ok:true})` no-op。
5. 取 payload 中的 app（Apple）id → `db.select apps where appStoreId = id`；无 → 200 no-op；有 → `void appSyncService.syncApp(app.id)`（不 await），`status==='published'` 则 `triggerBuild()`；`return c.json({ok:true})`。
6. `.env.example` 加 `ASC_WEBHOOK_SECRET=`；写 `docs/asc-webhook-setup.md`。

**Verify:**
Run: `cd packages/api && npx vitest run src/__tests__/routes.asc-webhook.test.ts && npx tsc --noEmit`
Expected: 绿；tsc 0。
<!-- /section -->

---
## Verification
- **Verdict:** Approved
- **Date:** 2026-05-30
- **Verifier:** dev-workflow:plan-verifier (Opus). 3 should-fix 已应用（ALTER 顺序显式化、merge 用 `cur.{field}` 兜底防清空、ASC_PRIVATE_KEY `\n` 规范化）；0 must-fix。Report: .claude/reviews/plan-verifier-2026-05-30-163742.md
