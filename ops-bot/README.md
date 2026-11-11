# 教父 IP 运营工具（运营 + 入口）

一个 Bot 同时承担四件事：

1. **访客入口**：`/start` 菜单（无年龄门）；
2. **X 新帖**：先审后发到预告频道；
3. **频道统计**：成员、进出、日报/周报；
4. **防丢频道公告**：运营者手动发三类公告。

前台 Bot 已于 2026-11-09 按需求删除，剩余入口功能合并到这里。

## 访客菜单

```text
/start
  ├─ 预告频道
  ├─ 防丢频道
  ├─ 海外订阅   → OnlyFans
  ├─ 联系客服   → 客服 Bot
  └─ 语言 / Language
```

- **没有年龄确认**，`/start` 直接出菜单；
- **没有本周内容**，也**没有会员购买**；
- 未配置的入口：预告/防丢禁用并提示「尚未开放」，海外订阅与联系客服整项隐藏；
- 中英双语，按 Telegram `language_code` 初始化，可手动切换并持久化；
- 只在私聊响应，群里 `/start` 静默。

## 运营功能

### X 新帖审核

```text
X 发帖 → 每 5 分钟轮询 → 私聊管理员预览
      → [✅ 发布] [⏭ 跳过] → 通过后发到预告频道
```

- 按推文 ID 去重，重启不重发；
- 24 小时未处理自动过期；
- 同一帖子两个管理员同时点，只发一次；
- 视频只发封面 + 原帖链接，不下载视频。

### 成员统计

- 每 5 分钟 `getChatMemberCount` 快照；
- `chat_member` 记录加入/退出与邀请链接来源；
- 每天 10:00 日报，每周一 10:00 周报，私聊所有管理员；
- 报表时间可配置，留空关闭。

### 防丢频道公告

`/announce` → 选模板 → 逐项输入 → 预览 → 确认发布。

三套模板：本周更新 / 入口变更 / 频道异常。入口地址必须是 HTTPS，单字段上限 500 字。

## 快速开始

```sh
cd ops-bot
npm ci
cp .env.example .env.local    # 填 token、ID、频道与入口链接
npm run doctor                # 自检配置 / 频道权限 / X 时间线
npm run dev
```

### 配置

| 变量 | 必填 | 说明 |
|---|---|---|
| `OPS_BOT_TOKEN` | 是 | Bot token |
| `OWNER_ID` | 是 | 你的数字 ID |
| `ADMIN_IDS` | 否 | 逗号分隔；owner 自动并入 |
| `PREVIEW_CHANNEL_ID` | 是 | 预告频道 `-100...` 或 `@username`，用于发帖与统计 |
| `PREVIEW_CHANNEL_URL` | 否 | 访客菜单里的预告频道链接 |
| `BACKUP_CHANNEL_ID` | 否 | 防丢频道 ID，`/announce` 用 |
| `BACKUP_CHANNEL_URL` | 否 | 访客菜单里的防丢频道链接 |
| `ONLYFANS_URL` | 否 | 海外订阅链接；未填时菜单隐藏该项 |
| `CONTACT_BOT_URL` | 否 | 客服 Bot 链接；未填时菜单隐藏该项 |
| `X_ENABLED` | 否 | 默认 1；X 未充值或暂不测试时设 0 |
| `X_BEARER_TOKEN` | `X_ENABLED=1` 时必填 | X API v2 Bearer Token |
| `X_USERNAME` | `X_ENABLED=1` 时必填 | 不带 `@` |
| `POLL_MINUTES` | 否 | 默认 5，最小 2 |
| `APPROVAL_TTL_HOURS` | 否 | 默认 24 |
| `BACKFILL_COUNT` | 否 | 默认 0，最多 20 |
| `REPORT_DAILY` | 否 | 默认 `10:00`，留空关闭 |
| `REPORT_WEEKLY` | 否 | 默认 `MON 10:00`，留空关闭 |
| `DATABASE_PATH` | 否 | 默认 `./data/ops-bot.sqlite` |
| `TIMEZONE` | 否 | 默认 `Asia/Shanghai` |

`.env.local` 权限 0600，不进仓库。

## 命令

### 所有人

| 命令 | 作用 |
|---|---|
| `/start` | 入口菜单 |

### 管理员

| 命令 | 作用 |
|---|---|
| `/pending` | 最近 10 条待审 |
| `/stats` | 成员数、今日进出、帖子状态 |
| `/report` | 手动发日报；`/report weekly` 发周报 |
| `/announce` | 发防丢频道公告 |
| `/cancel` | 取消公告输入 |
| `/whoami` | 自己的用户 ID |

非管理员发管理命令或点审核/公告按钮：没有任何回复。

## 消息格式

```text
🎬 新作 · 系列 03

GF-A01-001 · 主角档案 · 复古风格

🕘 2026-11-08 21:00
🔞 仅限成年人 · 完整版尚未开放
```

- 正文去掉 `t.co`，最多 300 字；
- 单图 photo + caption；多图 media group；视频只发封面；
- 纯文字关闭链接预览；
- 按钮固定为「在 X 查看原帖」。

## 代码结构

```
ops-bot/
├── src/
│   ├── config.ts        环境变量
│   ├── db.ts            SQLite 迁移
│   ├── store.ts         数据访问
│   ├── x-client.ts      X API
│   ├── format.ts        帖子排版
│   ├── i18n.ts          访客菜单文案
│   ├── views.ts         访客菜单视图
│   ├── announcements.ts 防丢公告模板
│   ├── telegram.ts      预览 / 发布 / 状态回写
│   ├── poller.ts        X 轮询与审核入队
│   ├── scheduler.ts     成员快照、日报/周报
│   ├── reports.ts       报表汇总与发送
│   ├── bot.ts           菜单、命令、审核、公告
│   ├── doctor.ts        启动自检
│   └── index.ts         入口
└── test/                57 项测试
```

## 验证

```sh
npm run check   # typecheck + 57 项测试
```

测试不访问真实 Telegram 或 X：假 Bot API + 假 X API，直接喂 update 再断言消息、频道和键盘。

## 已知边界

- **单帖浏览量拿不到**：Telegram Bot API 不提供历史 views；
- **编辑/删除不同步**：X 上改文案或删帖，频道不会自动跟着变；
- **视频只有封面**：Telegram 不能直接抓 X 的 m3u8；
- **公开频道内容风险**：审核由人把关，但 Telegram 对公开频道的成人内容有限制；
- **成员进出依赖 `chat_member`**：Bot 必须是频道管理员，否则停记；
- **公告需要 Bot 是防丢频道管理员**，且配置 `BACKUP_CHANNEL_ID`。

## 部署（待做）

独立目录 `/opt/gf-ops-bot`、独立 systemd 单元、长轮询不开端口、每日 SQLite 备份。

## 教父品牌基线

预览：教父的战利品日记；防丢：西西里安全屋；双向联系：西西里线人；会员购买：🗝️ 缄默法则通行证；资源存储：💎 军火走私船；会员：缄默法则之下。`ops-bot` 保留为自建后台与入口工具，与三个专用机器人分别管理。未核实的外链留空；显示名不意味着已经注册对应用户名。本轮更新菜单与工程名，不执行 Telegram 账号改名或消息推送；正在运行的旧进程需在正式切换时重启。
