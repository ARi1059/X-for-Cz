# 顾清棠 Web 工程

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
| `/api/lab/story` | Story Lab 的 X / Telegram 数据（无凭证时返回示例数据） |

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

可选：`LOCAL_DRAFT_PREVIEW`；`X_BEARER_TOKEN` / `X_USERNAME`（X 粉丝数与最新帖）；`TELEGRAM_BOT_TOKEN` / `TELEGRAM_ANTI_LOSS_CHAT` / `TELEGRAM_PREVIEW_CHAT`（频道人数）。未配置时 `/api/lab/story` 返回示例数据并标注“示例”。

## 验证

```sh
npm run check      # typecheck + 契约检查 + 44 项单元测试
npm run build      # 生产构建
npm run test:e2e   # 6 项浏览器回归（独立 3103 端口 + 临时数据库）
```

浏览器测试会在 `localhost:3103` 启动独立 dev 服务，使用临时数据库与媒体目录，不读写本机 `var/`。2026-11-06 重构后的结果：typecheck 通过、44/44 单元测试、6/6 浏览器测试、生产构建通过。

## 运行数据与回退

`var/` 保存数据库、媒体、备份与本机凭据，不纳入版本控制。回退代码用 git 历史；数据库与媒体需要单独备份（运行中可热备份 SQLite 或用 `sqlite3 .backup`）。上线前仍需补齐真实入口目标、联系邮箱与中性离开地址，并执行正常发布。
