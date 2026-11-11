# 频道运营 Bot 需求（v0.5）

起草日期：2026-11-09
修订：v0.2（2026-11-09）——确认视频只发封面+链接、同步全部原创帖、不回填历史、待审 24 小时过期。
修订：v0.3（2026-11-09）——P0 落地到 `ops-bot/`，39 项测试通过。
修订：v0.4（2026-11-09）——P1 完成：成员快照、`chat_member` 进出、日报/周报、48 项测试。
修订：v0.5（2026-11-09）——前台 Bot 删除，访客菜单合并；移除年龄门、本周内容、会员购买；新增海外订阅与防丢公告；57 项测试通过。
状态：**P0、P1 与访客菜单已实现（2026-11-09）**，代码见 `ops-bot/`；P2（邀请链接归因、`/retry`、审计导出）待做。
关系：本文档取代 `06-Telegram-Bot开发需求.md` 中「个人 Bot」的定位；前台 Bot 已于 2026-11-09 删除，入口功能合并到本 Bot。

---

品牌更新（2026-11-10）：个人 IP 为教父；预览“教父的战利品日记”、会员“缄默法则之下”、防丢“西西里安全屋”、资源“💎 军火走私船”、付费“🗝️ 缄默法则通行证”、双向“西西里线人”。自建运营工具保持内部角色，与三个专用机器人区分；真实用户名待核实，历史测试账号不代表新品牌已完成外部改名。

## 1. 定位

合并后的唯一自建 Bot，同时承担四件事：

1. 访客 `/start` 菜单；
2. 把 X 上的新帖**先审后发**到预告频道；
3. 统计预告频道的成员与增长，定期私聊报给管理员；
4. 运营者向防丢频道发公告。

它不碰钱、不碰会员权限、不私聊陌生人、不发群发。

```text
访客：/start → 预告频道 / 防丢频道 / 海外订阅 / 联系客服 / 语言

内部：X 账号发帖
    → 运营 Bot 轮询 X API
    → 私聊管理员预览（发布 / 跳过）
    → 通过后发到预告频道
    → 记录发帖与成员变化
    → 日报 / 周报私聊管理员
```

## 2. Bot 与 Web 的分工

| 角色 | 账号 | 权限 | 职责 |
|---|---|---|---|
| Web 只读 Bot | `@TestWebAndXbot` | 频道成员 | 仅 `getChatMemberCount`，供网页显示人数 |
| 运营 + 入口 Bot | `@cdcnewceshibot` | 预告频道管理员、防丢频道管理员 | 访客菜单、X 审核发布、统计报表、防丢公告 |
| 付款 Bot | `🗝️ 缄默法则通行证（用户名待核实）`（外部克隆） | 会员频道 | 收款、入群审批、到期移出；运营 Bot 只跳转 |
| 客服 Bot | `西西里线人（用户名待核实）`（外部克隆） | — | 双向客服；运营 Bot 只跳转 |

运营 Bot 不复用 Web 只读 Bot 的 token：Web 服务器不应持有能发帖的凭据。

## 3. 范围

### R1 频道人数 → Web

**结论：不开发。**

- Web 已有 `getChatMemberCount` 读取与 300 秒缓存（见 `docs/Web-数据接入-X与Telegram.md`）。
- 当前 Web 使用 `@TestWebAndXbot`，已配置 `TELEGRAM_PREVIEW_CHAT` 并显示预告频道人数。
- 防丢频道尚未配置 `TELEGRAM_ANTI_LOSS_CHAT`；补齐后网页会多一行。
- 待办是配置，不是代码：把 Bot 加进对应频道，取频道 ID 或 `@username` 填入 `web/.env.local`，重启站点。
- 历史曲线、增长趋势不在本期；如果以后要，由运营 Bot 推送，不改变本文档其余部分。

### R2 X 新帖 → 预告频道

- 轮询 X API v2 用户时间线，`exclude=retweets,replies`；
- **同步范围：全部原创帖，含纯文字帖**（已定）；因为有人工审核，不会直接发出去；
- 按推文 ID 去重，重启不重发；
- 新帖先私聊所有管理员，附预览与 `[发布] [跳过]` 按钮；
- 任一管理员可操作；先点的人生效，后点的人看到「已处理」；
- 通过后发到预告频道；跳过只记录，不发；
- **首次启动只处理启动之后的新帖，不回填历史**（已定，`BACKFILL_COUNT=0`）；
- **待审 24 小时过期**（已定），过期只进报表，不自动发；
- 编辑与删除不同步：X 上改文案或删帖，频道里不会自动跟着变，需人工处理。

**依赖：X API 当前不可用。**

实测 `GET /2/users/by/username/...` 返回 403 `client-not-enrolled`，原因是开发者 App 没有挂到 Project 上。修复：

1. 打开 https://developer.x.com ，进入 Developer Portal；
2. 新建一个 Project（Free 档即可先试），把现有 App 挂进去；
3. 在 Keys and tokens 里重新生成 Bearer Token；
4. 替换 `web/.env.local` 的 `X_BEARER_TOKEN`，再跑一次 `npm run integrations:check`；
5. 若仍读不到时间线，说明当前档位不支持，需升级或改走 RSS 服务（见第 10 节）。

### R3 消息格式

默认模板：

```text
🎬 新作 · 系列 03

GF-A01-001 · 主角档案 · 复古风格

<正文，去掉 t.co，最多 300 字>

🕘 2026-11-08 21:00
🔞 仅限成年人 · 完整版尚未开放

[ 在 X 查看原帖 ]
```

规则：

- 正文去掉 `https://t.co/...`，压缩空白，超长截断并加省略号；
- 单图：photo + caption（caption 上限 1024 字符）；
- 多图：media group，最多 9 张，caption 只挂在第一张；
- 无图：纯文字，关闭链接预览，避免预览卡片带出露骨缩略图；
- 视频：只发封面图 + 原帖链接，不下载、不上传视频文件（已定；Telegram 不能直接抓 X 的 m3u8）；
- 系列号从文案里提取 `系列 03` / `Series 03`，提取不到就省略该行；
- 时间统一显示北京时间，格式 `YYYY-MM-DD HH:mm`；
- 所有文案走 HTML 转义，避免 `&`、`<` 破坏消息。

### R4 预告频道统计 → 管理员

能统计：

| 指标 | 来源 |
|---|---|
| 当前成员数 | `getChatMemberCount` |
| 每日新增 / 退出 / 净增 | `chat_member` 更新（Bot 须为管理员） |
| 7 日趋势 | 每日快照 |
| 发帖数、待审数、跳过数、失败数 | 自己的数据库 |
| 入群来源 | 不同邀请链接归因（`chat_member` 事件里的 `invite_link`） |

不能统计（Telegram Bot API 限制，已确认接受）：

- 单条帖子的浏览量；
- 频道内按钮或链接的点击；
- 成员的在线、地区、设备。

报表形式（可调）：

| 形式 | 默认时间 | 内容 |
|---|---|---|
| 日报 | 每日 10:00 | 昨日新增/退出/净增、当前总数、昨日发布数、待审数、同步失败数 |
| 周报 | 每周一 10:00 | 7 日趋势、来源分布、发布/跳过比、异常汇总 |
| 即时告警 | 事件触发 | X 403/429、Telegram 发送失败、Bot 失去管理员权限 |
| 手动 | 随时 | `/stats [7d]`、`/pending`、`/report daily\|weekly` |

- 所有 `ADMIN_IDS` 都收到；owner 额外能改配置、加删管理员（v1 先只支持环境变量）。
- 时间和开关做成配置，可单独关闭日报或周报。

### R5 访客菜单（合并前台 Bot）

- `/start` 直接出菜单，**没有年龄确认**；
- 按钮：预告频道、防丢频道、海外订阅（OnlyFans）、联系客服、语言；
- **没有本周内容，没有会员购买**；
- 未配置：预告/防丢禁用并提示「尚未开放」；海外订阅、联系客服整项隐藏；
- 中英双语，按 `language_code` 初始化，手动切换后持久化；
- 只在私聊响应，群里 `/start` 静默；
- 联系客服只发说明 + 跳转，不接收、不转发、不落库留言。

## 4. 状态机

```text
新推文 ──轮询──▶ pending ──管理员[发布]──▶ published
                    │
                    ├──管理员[跳过]──▶ skipped
                    ├──超过 TTL────▶ expired
                    └──发送失败────▶ failed（可重试）
```

- TTL 默认 24 小时，过期只标记，不自动发；
- `failed` 保留失败原因，管理员可 `/retry <id>`；
- 频道消息 ID 落库，便于以后删除或对账。

## 5. 权限

| 角色 | 权限 |
|---|---|
| owner（`OWNER_ID`） | 全部；改配置、加删管理员、重试、查看审计 |
| admin（`ADMIN_IDS`） | 收预览、发布/跳过、看统计、看待审 |
| 其他人 | 发任何命令**没有回复**，不是「无权限」提示 |

- 鉴权只认数字 ID，不看用户名；
- 管理员之间的操作记审计：谁、何时、对哪条推文、做了什么。

## 6. 数据模型（SQLite，WAL）

```text
users
  id INTEGER PRIMARY KEY            -- Telegram user id
  lang TEXT NOT NULL                -- 'zh' | 'en'
  created_at INTEGER NOT NULL
  last_seen_at INTEGER NOT NULL

posts
  tweet_id TEXT PRIMARY KEY
  status TEXT NOT NULL            -- pending | published | skipped | expired | failed
  message_id INTEGER NULL         -- 频道消息 ID
  decided_by INTEGER NULL
  decided_at INTEGER NULL
  error TEXT NULL
  created_at INTEGER NOT NULL

member_daily
  day TEXT PRIMARY KEY            -- 北京时间 YYYY-MM-DD
  members INTEGER NOT NULL
  joins INTEGER NOT NULL
  leaves INTEGER NOT NULL

invite_sources
  day TEXT NOT NULL
  link TEXT NOT NULL
  joins INTEGER NOT NULL
  PRIMARY KEY (day, link)

audit_log
  id INTEGER PRIMARY KEY AUTOINCREMENT
  actor_id INTEGER NOT NULL
  action TEXT NOT NULL
  target TEXT NULL
  created_at INTEGER NOT NULL
```

隐私：

- `chat_member` 事件**只累加计数**，不保存用户 ID、用户名；
- 不保存消息正文；
- `audit_log` 保留 180 天，`member_daily` 长期保留。

## 7. 配置

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `OPS_BOT_TOKEN` | 是 | — | 运营 Bot token |
| `OWNER_ID` | 是 | — | owner 的数字 ID |
| `ADMIN_IDS` | 否 | — | 逗号分隔；owner 自动并入 |
| `PREVIEW_CHANNEL_ID` | 是 | — | 预告频道 `-100...` 或 `@name`，发帖与统计用 |
| `PREVIEW_CHANNEL_URL` | 否 | — | 访客菜单的预告频道链接；未填时按钮禁用 |
| `BACKUP_CHANNEL_ID` | 否 | — | 防丢频道 ID，公告用；未填时 `/announce` 不可用 |
| `BACKUP_CHANNEL_URL` | 否 | — | 访客菜单的防丢频道链接；未填时按钮禁用 |
| `ONLYFANS_URL` | 否 | — | 海外订阅链接；未填时菜单隐藏 |
| `CONTACT_BOT_URL` | 否 | — | 客服 Bot 链接；未填时菜单隐藏 |
| `X_ENABLED` | 否 | `1` | 设为 `0` 时暂停 X 轮询（未充值或联调 Telegram 时用） |
| `X_BEARER_TOKEN` | R2 必填 | — | 复用 Web 的 token 或单独申请 |
| `X_USERNAME` | R2 必填 | — | 不带 `@` |
| `POLL_MINUTES` | 否 | 5 | 轮询间隔，最小 2 |
| `APPROVAL_TTL_HOURS` | 否 | 24 | 待审过期 |
| `BACKFILL_COUNT` | 否 | 0 | 首次启动回填条数，0 为不回填 |
| `REPORT_DAILY` | 否 | `10:00` | 空字符串关闭 |
| `REPORT_WEEKLY` | 否 | `MON 10:00` | 空字符串关闭 |
| `TIMEZONE` | 否 | `Asia/Shanghai` | 切日与报表时区 |
| `DATABASE_PATH` | 否 | `./data/ops-bot.sqlite` | SQLite 路径 |

## 8. 异常与降级

| 场景 | 行为 |
|---|---|
| X 403（档位/Project） | 私聊 owner 一次，指数退避，不刷屏 |
| X 429 | 按 `x-rate-limit-reset` 退避 |
| X 超时/5xx | 下个周期重试，连续 3 次告警 |
| Bot 不是频道管理员 | 启动自检失败，私聊 owner，暂停发帖 |
| 频道发送失败 | 标记 `failed`，保留原因，可 `/retry` |
| 管理员点了两次 | 第二次提示「已处理」，不重复发 |
| 数据库写失败 | 不发送成功态，告警 |
| 管理员全部离线 | 帖子停在 pending，过期后进报表 |
| 公告未配置防丢频道 | `/announce` 提示未配置，不进入输入流程 |
| 公告发送失败 | 提示确认 Bot 是防丢频道管理员，保留会话可重试 |

## 9. 待确认

| # | 事项 | 现状 | 影响 |
|---|---|---|---|
| 1 | 公开频道媒体尺度 | 已允许图片视频，但与 Telegram 规则及 05 文档冲突 | 运营规范，不影响代码 |
| 2 | 报表指标 | 已按 R4 实现（日报/周报/手动） | 可按阶段调整 |
| 3 | 邀请链接归因 | 是否为 X / 导航页 / 频道置顶分别建邀请链接 | 影响来源统计，需要你提供链接或由 Bot 创建 |
| 4 | 管理员增删 | v1 只支持环境变量 | 若要 Bot 内加删，需要额外命令与审计 |

其余已定：视频只发封面+链接、同步全部原创帖、不回填历史、待审 24 小时过期。

## 10. 备选：如果 X API 读不了时间线

按稳定性排序：

1. 升级 X API 档位（最稳，有月费）；
2. 第三方 RSS 服务（RSS.app / FetchRSS），Bot 解析 feed；
3. 自建 RSSHub（需服务器与 cookie，X 改版就断）；
4. 公共 Nitter 实例（多数已关停，不建议）。

无论走哪条，审核、去重、排版、统计都不变，只替换「取帖」这一层。

## 11. 前台 Bot 已删除

2026-11-09 按需求删除 `bot/`；访客菜单功能合并到本 Bot：

- 访客：`/start` → 预告频道 / 防丢频道 / 海外订阅 / 联系客服 / 语言；
- 运营：待审、统计、报表、防丢公告；
- 旧文档 `docs/前台Bot-开发规格.md` 仅作历史参考，不再维护。

## 12. 验收

1. X 发一条新帖，5 分钟内管理员收到预览。
2. 点「发布」后，频道消息与预览逐字一致。
3. 点「跳过」后，频道没有消息。
4. 同一推文轮询多次，不重复预览、不重复发帖。
5. 两个管理员同时点，只发一次。
6. X 返回 403/429 时，只告警一次并退避。
7. 重启后不重发已发布的推文。
8. 非管理员发 `/stats`、`/pending`，没有任何回复。
9. `/stats` 的成员数与 Telegram 客户端一致。
10. 日报在 10:00 送达所有 `ADMIN_IDS`。
11. 频道消息里不出现 `t.co` 短链。
12. 数据库里没有用户名、消息正文、成员用户 ID。
13. 访客 `/start` 直接出菜单，没有年龄门、本周内容、会员购买。
14. 未配置的入口按规则禁用或隐藏。
15. 语言切换后菜单切换，重启后保持。
16. 管理员 `/announce` 预览并确认后才发到防丢频道。
17. 非管理员发 `/announce` 或点公告按钮，没有任何回复。

## 13. 实施顺序

技术选型沿用现有项目：Node 24 + TypeScript + grammY + SQLite（WAL）+ 长轮询，独立目录与独立 systemd 单元，不新增公网端口。

| 阶段 | 内容 | 前置 |
|---|---|---|
| P0 ✅ | 配置与校验、SQLite、X 客户端、去重、预览卡片、发布/跳过、频道发送、失败告警（39 项测试通过） | X API 可用 |
| P1 ✅ | 成员统计（`getChatMemberCount` + `chat_member`）、日报/周报、异常告警（48 项测试通过） | Bot 为频道管理员 |
| P2 | 邀请链接归因、`/retry`、审计导出 | P0、P1 稳定 |

当前阻塞：

1. X API 403 `client-not-enrolled` —— 需在 developer.x.com 建 Project 并挂 App；
2. 预告频道 chat ID 未配置，`@ceshitongji123bot` 尚未加入频道；
3. 运营 Bot 的新 token、`OWNER_ID`、`ADMIN_IDS` 尚未提供。

这三项不影响先写代码与测试（测试用假 X API 与假 Telegram API），只影响真机联调。
