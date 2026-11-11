# 教父 Web 工程

公开页只有一套视觉：**Story Lab 滚动叙事**。年龄确认后进入五段式故事页（相遇 → 简介 → 预告 → 会员 → 购买），桌面固定左栏 + 右侧人像背景随滚动交叉淡入，手机改为纵向堆叠。管理后台、SQLite 数据层、受控媒体与 23 个 HTTP 操作保持原样。

```
浏览器 ── 年龄门（无媒体） ── 确认 ── Story Lab
                                   └─ /admin 管理后台（独立会话）
```

## 页面与路由

| 路由 | 说明 |
|---|---|
| `/` | 年龄门 → Story Lab。确认前不返回头像、简介、入口或受控媒体 |
| `/admin` | 管理后台：草稿、预览、发布、媒体、统计 |
| `/go/[linkId]` | 入口跳转（校验版本与成年凭据后 302 到真实目标） |
| `/media/[mediaId]` | 受控媒体，需成年凭据与当前版本 |
| `/share/[mediaId]` | 中性分享图，仅限标记为公开的素材 |
| `/api/lab/story` | Story Lab 的 X / Telegram 公开数据；生产环境可用，服务端缓存，未配置时返回空态 |

后台仍保留**头像与照片条**编辑：头像用于公开页身份区；照片条数据继续保存在草稿/发布配置中，但当前 Story Lab 不渲染照片条，五张背景为 `web/public/lusion/01–05.jpg` 固定资源。

Story Lab 的五个章节定义在 `src/components/story-content.ts`，页面实现在 `src/components/story-lab.tsx`，共享样式在 `story-shell.css`，页内布局在 `story-lab.css`。

## 本地运行

Node.js 24.12+，依赖由 `package-lock.json` 锁定。首次：

```sh
npm ci
npm run setup          # 生成 .env.local 密钥、初始化数据库与管理员
npm run media:import   # 导入头像与照片（可选）
npm run dev
```

- 公开页：http://localhost:3000/
- 管理后台：http://localhost:3000/admin
- 管理员账号密码：`var/local-admin.json`（0600，勿提交）
- 忘记密码：`npm run setup -- --reset-admin`

`setup` 只补齐缺失内容，重复执行不会覆盖已有草稿、密钥或管理员。管理员密码使用带独立盐的 scrypt 摘要存储。

### 本机草稿预览

`.env.local` 中 `LOCAL_DRAFT_PREVIEW=1` 时，`/` 在成年确认后读取**最近保存的草稿**（`local-draft-{revision}`），后台保存后刷新即可查看。该开关只在 `NODE_ENV=development`、loopback HTTP 且使用非 Secure 开发 Cookie 时生效；生产、远程或 HTTPS 环境忽略它并读取已发布版本。设为 `0` 并重启开发服务即恢复发布内容。

## 数据流

- 公开页先取中性 metadata 与成年挑战，确认后按版本读取站点投影；受控媒体单独鉴权。
- 草稿按 revision 做 CAS 保存；发布在同一事务内校验配置与媒体、写入不可变快照、切换公开指针并记录审计。失败保留上一成功发布。
- 预览与保存不改变发布指针；后台“预览草稿”以全屏 Story Lab 呈现当前草稿，入口不执行外跳。
- 分享图必须单独上传并标记为中性素材，不会从头像或照片自动生成。

## 工程结构

| 路径 | 用途 |
|---|---|
| `src/app/` | 路由、`gate.css`（年龄门）、`globals.css`（后台与基础控件）、`public-tokens.css` |
| `src/components/story-lab.tsx`、`story-shell.css`、`story-lab.css` | Story Lab 页面与样式 |
| `src/components/gate-stage.tsx`、`public-app.tsx` | 年龄门、确认/重置/离开、入口解析与跳转 |
| `src/components/admin-app.tsx`、`media-image.tsx` | 后台、受控图片加载 |
| `src/components/open-cursor.tsx`、`intro-curtain.tsx` | 桌面光标、入场幕布 |
| `src/server/` | HTTP 操作、鉴权、媒体处理、运行时校验 |
| `src/storage/`、`migrations/` | SQLite WAL、迁移、草稿与发布 |
| `src/contracts/`、`contracts/` | 配置字段、发布校验、OpenAPI |
| `test/`、`e2e/` | 单元测试与真实浏览器回归 |

## 环境变量

必填：`APP_ORIGIN`（完整 origin）、`DATABASE_PATH`、`MEDIA_ROOT`、`AGE_SIGNING_SECRET`、`SESSION_HASH_SECRET`（各 ≥32 字符且不同）。

可选：`LOCAL_DRAFT_PREVIEW`；`X_BEARER_TOKEN` / `X_USERNAME`（X 粉丝数与最新帖）；`TELEGRAM_BOT_TOKEN` / `TELEGRAM_ANTI_LOSS_CHAT` / `TELEGRAM_PREVIEW_CHAT`（频道人数）；`STORY_FEED_TTL_SECONDS`（缓存秒数，默认 300）。

### Story Lab 数据接入

- 服务端调用 X API v2 与 Telegram Bot API（`getChatMemberCount`），token 不出现在响应、日志或前端。
- 未配置或请求失败时按来源降级：能读粉丝数就只显示粉丝数；帖子读不到时提示先进入预告频道；全部不可用时显示「实时数据暂不可用」。生产环境**不会**展示示例数字，示例数据只在开发环境且完全未配置时出现。
- 进程内缓存 5 分钟；X 返回 403 时冷却 30 分钟，429 时按 `x-rate-limit-reset` 冷却，避免耗尽读额度。
- 建议给网站单独建一个只加入频道的 Telegram Bot，不复用运营 Bot 的 token。X 免费套餐通常读不了时间线，只显示粉丝数属预期行为。
- 配置后运行 `npm run integrations:check` 验证；输出不含密钥。

## 验证

```sh
npm run check      # typecheck + 契约检查 + 53 项单元测试
npm run build      # 生产构建
npm run test:e2e   # 6 项浏览器回归（独立 3103 端口 + 临时数据库）
npm run integrations:check  # 可选：验证 X / Telegram 凭证（不打印密钥）
```

浏览器测试会在 `localhost:3103` 启动独立 dev 服务，使用临时数据库与媒体目录，不读写本机 `var/`。2026-11-06 数据接入后的结果：typecheck 通过、53/53 单元测试、生产构建通过。浏览器回归依赖 `../design-references/` 照片素材，当前本机缺失，未能执行。

## 运行数据与回退

`var/` 保存数据库、媒体、备份与本机凭据，不纳入版本控制。回退代码用 git 历史；数据库与媒体需要单独备份（运行中可热备份 SQLite 或用 `sqlite3 .backup`）。上线前仍需补齐真实入口目标、联系邮箱与中性离开地址，并执行正常发布。

## 常见问题：`next dev` 卡住、端口无响应

如果 `next dev` 一直不输出 Ready、`curl localhost:3000` 也连不上，先检查文件是否被 iCloud 驱逐：

```sh
ls -lO src/app/page.tsx var/site.sqlite node_modules/next/dist/server/next.js
```

出现 `compressed,dataless` 表示文件只在 iCloud 里，Next 读取时会阻塞。处理顺序：

1. `brctl download .`（iCloud 守护进程无响应时会立即返回但不下载）；
2. 逐文件触发下载：
   ```sh
   find . -path ./node_modules -prune -o -type f -flags +dataless -print0 \
     | xargs -0 -P 10 -n 1 sh -c 'cat "$1" > /dev/null' sh
   ```
3. 长期方案：把项目移出 `~/Documents`，或关闭「桌面与文档」iCloud 同步。否则文件会再次被驱逐，`node_modules` 与 `var/` 尤其容易触发。

## 教父品牌迁移

品牌基线见 `../docs/IP宇宙设定-v1.md`。网站字标为 THE GODFATHER / GF；主理人教父与多位成年女主各有角色。`config/content-base.json` 是初始文案基线，`src/brand.ts` 是前台固定品牌文字，运行内容仍由 SQLite 草稿/发布分别维护。

`npm run brand:migrate` 默认只预览；`npm run brand:migrate -- --apply` 先创建一致性数据库备份，再将草稿与当前公开配置分别迁移品牌与头像，保留两者内容差异、真实链接、媒体库与历史快照。备份路径可通过 `BRAND_BACKUP_PATH` 指定。历史版本按原有不可变约束保留，不作为现行设定。

五个入口保持原有 key：`x_profile` 为教父主号、`tg_personal` 为西西里安全屋、`tg_preview` 为教父的战利品日记、`onlyfans` 为独立外链、`membership` 为缄默法则通行证。`tg_personal` 目标必须实际指向防丢频道；双向联系应指向独立的西西里线人，不自动复用地址。真实用户名及外部账号更名由实际账号持有人另行配置。
