# 教父 IP 迁移：验证记录

日期：2026-11-10。下列运行日志为审计证据，迁移前文案只出现在历史输出/差异中，不作为现行设定。

## 执行环境与修改范围

- 私有原文件、SHA-256 manifest 与数据库备份：`/Users/macbook/.codex/backups/godfather-ip-20261110-175518`。
- 本次变更文件：61；通过测试的代码与项目当前源码哈希差异：0。
- macOS 云端占位导致原目录早期运行中断/等待，最终检查在本机独立目录按原锁文件离线安装相同依赖后完成。
- 依赖版本与 integrity 字段按迁移前锁文件保留，仅调整工程名称。

## 迁移前与迁移后检查

### modified-ops-bot-check.log

工作目录：`/Users/macbook/Documents/推特创作者计划/ops-bot`

命令：`npm run check`
退出状态：`137`

```text

> gf-ops-bot@0.1.0 check
> npm run typecheck && npm test


> gf-ops-bot@0.1.0 typecheck
> tsc --noEmit

sh: line 1: 21573 Killed: 9               npm run typecheck

```

### modified-web-check.log

工作目录：`/Users/macbook/Documents/推特创作者计划/web`

命令：`npm run check`
退出状态：`137`

```text

> godfather-web@0.3.0 check
> npm run typecheck && npm run contracts:check && npm test


> godfather-web@0.3.0 typecheck
> tsc --noEmit

sh: line 1: 21574 Killed: 9               npm run typecheck

```

### modified-web-check-serial.log

工作目录：`/Users/macbook/Documents/推特创作者计划/web`

命令：`npm run check`
退出状态：`124`

```text

> godfather-web@0.3.0 check
> npm run typecheck && npm run contracts:check && npm test


> godfather-web@0.3.0 typecheck
> tsc --noEmit


> godfather-web@0.3.0 contracts:check
> tsx scripts/contracts.ts --check

OPENAPI_OK: 23 operations; references resolved and schema validated
CONTENT_OK: content baseline matches generated schema/seed; five targets disabled; real publishing remains blocked
MEDIA_OK: 1 brand source listed for controlled import; bootstrap includes no media

> godfather-web@0.3.0 test
> tsx --test test/*.test.ts


```

### verified-web-check.log

工作目录：`/Users/macbook/.codex/backups/godfather-ip-20261110-175518/validation/web`

命令：`npm run check`
退出状态：`0`

```text

> godfather-web@0.3.0 check
> npm run typecheck && npm run contracts:check && npm test


> godfather-web@0.3.0 typecheck
> tsc --noEmit


> godfather-web@0.3.0 contracts:check
> tsx scripts/contracts.ts --check

OPENAPI_OK: 23 operations; references resolved and schema validated
CONTENT_OK: content baseline matches generated schema/seed; five targets disabled; real publishing remains blocked
MEDIA_OK: 1 brand source listed for controlled import; bootstrap includes no media

> godfather-web@0.3.0 test
> tsx --test test/*.test.ts

✔ actual gate and published projections conform to the API response schemas (183.877917ms)
✔ password API schemas preserve the runtime grapheme and UTF-8 byte policy (37.375667ms)
✔ age token is purpose bound, signature checked, fixed 30 days, and expires exactly (1.587667ms)
✔ CSRF challenge has a short independent purpose and expiry (0.093625ms)
✔ scrypt uses separate salts, rejects wrong passwords and malformed encodings (355.455333ms)
✔ production cookies use host prefix, secure httponly strict path and fixed age (0.407959ms)
✔ brand migration preserves unpublished work, immutable history, targets and validation; repeated application is a no-op (41.280625ms)
✔ configuration has exact independent entries and preserves unresolved values (8.165833ms)
✔ Unicode length uses graphemes, and placeholder text is rejected (1.294959ms)
✔ targets reject scripts, credentials, local hosts, templates and same-site navigation (6.107292ms)
✔ before confirmation the projection contains neither biography, entry list nor controlled media (0.527167ms)
✔ normal publication requires exit target, contact and active entry, then ready media (84.836416ms)
✔ source attribution never expands to arbitrary caller data (0.069917ms)
✔ optional blank values normalize to null without accepting missing required text (0.425ms)
✔ neutral public share assets and controlled portraits have separate purposes (0.505625ms)
✔ HTTP age gate reveals neutral data only, strict Origin/CSRF, fixed expiry, memory revocation (155.966125ms)
✔ HTTP admin sessions isolate drafts, compare revisions, publish atomically and revoke on password change (237.940042ms)
✔ HTTP media upload requires admin and purpose, hidden and draft images stay private, published images retain references (145.085333ms)
✔ HTTP login throttles, malformed credentials share one response, logout clears current session (562.169375ms)
✔ passwords with combining graphemes remain usable after a password change (418.433958ms)
✔ explicit local draft view keeps age and version checks while serving draft photos without publishing (67.768459ms)
✔ a fully closed site has no primary entry (0.800959ms)
✔ the emphasized available entry wins even when it is not first (0.092625ms)
✔ the first available entry takes over when no available entry is emphasized (0.05125ms)
✔ the first available entry wins when several are emphasized (0.042417ms)
✔ an emphasized but disabled entry never receives the accent (0.046ms)
✔ default public reads keep the published snapshot even during development (51.409917ms)
✔ explicit loopback development reads the current draft and versions every save without publishing (4.554875ms)
✔ production and nondevelopment environments always retain published reads with the preview flag set (2.3675ms)
✔ remote, malformed and HTTPS origins retain published reads even when marked as preview (13.041292ms)
✔ actual decode strips metadata, keeps aspect, generates private derivatives and path-free records (56.644583ms)
✔ display derivative uses the 2500px long edge for 4:5 images (143.235791ms)
✔ invalid, truncated, oversized, animated, over-dimension and wrong-purpose uploads leave no rows/files (89.599458ms)
✔ pagination and referenced deletion protect drafts and retained published versions (34.77425ms)
✔ transaction failure cleans newly written files; capacity check commits atomically (30.261833ms)
✔ media file symlinks and replaced directories are never followed (11.781292ms)
✔ migration and seed are idempotent; bootstrap is closed and creates no account (27.516791ms)
✔ applied migration checksums prevent silent schema-history changes (1.820167ms)
✔ CAS rejects stale saves and stale publishes without discarding current draft (4.198292ms)
✔ failed validation keeps old pointer; successful publication stores an immutable snapshot (5.991875ms)
✔ database failure inside publication rolls back snapshot, pointer and audit together (2.435917ms)
✔ media foreign keys protect drafts and all retained published versions (3.866541ms)
✔ not-ready media prevents publishing without losing the saved draft (3.00475ms)
✔ public share media and age-gated imagery stay separate at publication (3.891917ms)
✔ restart preserves draft, published pointer and only finite aggregate dimensions (7.526083ms)
[story] x posts unavailable: forbidden
[story] x posts unavailable: forbidden
[story] x posts unavailable: forbidden
[story] x profile unavailable: forbidden
✔ live X and Telegram values build a feed without demo data (100.586458ms)
✔ a timeline permission error keeps follower stats and marks only posts unavailable (1.36275ms)
✔ a posts-only cooldown does not hide followers on the next refresh (0.888042ms)
✔ a profile error degrades the X stat instead of failing the whole feed (0.318125ms)
✔ unconfigured production feed contains no sample numbers (0.105083ms)
✔ development without credentials keeps the marked sample feed (0.121083ms)
✔ readStoryConfig normalizes handles, chat links and TTL (0.222291ms)
✔ readStoryConfig reports malformed values without exposing secrets (0.110083ms)
✔ parseChat accepts handles, t.me links and numeric ids (0.103166ms)
ℹ tests 54
ℹ suites 0
ℹ pass 54
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2477.562041

```

### verified-ops-bot-check.log

工作目录：`/Users/macbook/.codex/backups/godfather-ip-20261110-175518/validation/ops-bot`

命令：`npm run check`
退出状态：`0`

```text

> godfather-ops-bot@0.1.0 check
> npm run typecheck && npm test


> godfather-ops-bot@0.1.0 typecheck
> tsc --noEmit


> godfather-ops-bot@0.1.0 test
> tsx --test test/*.test.ts

✔ 管理员点发布后发到频道并记录 message_id (125.349834ms)
✔ 第二个管理员再点不会重复发布 (18.289ms)
✔ 点跳过不会发到频道 (13.737459ms)
✔ 非管理员点按钮没有任何业务效果 (13.366459ms)
✔ 频道发送失败时标记 failed 并通知 owner (8.628208ms)
✔ 纯文字帖用 sendMessage 发布 (8.324ms)
✔ 多图帖用 media group 发布 (9.143208ms)
✔ 非管理员发命令完全静默 (38.981166ms)
✔ 管理员 /stats 返回成员与帖子统计 (69.475209ms)
✔ /report 手动触发日报 (8.230459ms)
✔ /pending 空队列与有待审两种文案 (18.924458ms)
✔ /whoami 返回用户与会话 ID (7.949375ms)
✔ 管理员发普通文本只得到操作提示 (2.534ms)
✔ 非管理员发普通文本没有回复 (3.820042ms)
✔ 解析必填项与默认值，owner 自动并入管理员 (43.829375ms)
✔ ADMIN_IDS 为空时只剩 owner (0.174875ms)
✔ 缺少必填项时一次报出全部问题 (0.317708ms)
✔ 频道 ID 必须是 @username 或负数 (5.541084ms)
✔ 轮询间隔与 TTL 越界会报错 (0.20175ms)
✔ X_ENABLED=0 时允许不填 X 凭据 (0.1005ms)
✔ 访客菜单链接必须是 https，防丢频道 ID 必须是负数 (0.272333ms)
✔ 管理员列表里的非法 ID 会报错 (0.297291ms)
✔ 去 t.co 并提取系列号 (3.891875ms)
✔ 固定头尾与北京时间 (44.767417ms)
✔ HTML 转义 (0.363666ms)
✔ 正文截断到 300 字 (0.28975ms)
✔ 转义膨胀时进一步缩短正文，caption 不超过 1024 (0.994083ms)
✔ 视频帖加一行提示 (0.187959ms)
✔ 非 X 链接不生成按钮 (0.124666ms)
✔ 时间格式化 (0.087792ms)
✔ 成员加入时累计新增并记录邀请来源 (78.579666ms)
✔ 成员退出时累计退出，不重复计算未变化状态 (8.138166ms)
✔ 其他频道的成员变化不计入 (15.463875ms)
✔ 访客 /start 直接出菜单：无年龄门、无本周内容、无会员购买 (78.913167ms)
✔ 未配置的入口：海外订阅与联系客服隐藏，频道按钮降级为提示 (3.494583ms)
✔ 语言切换持久化，下次 /start 仍是英文 (5.118708ms)
✔ 联系客服先说明再跳转，消息不落库 (4.453583ms)
✔ 管理员公告：模板 → 字段 → 预览 → 确认发到防丢频道 (11.367ms)
✔ 非管理员发 /announce 或点公告按钮没有回复 (1.868958ms)
✔ 管理员 /start 额外显示管理命令提示 (1.604959ms)
✔ 首次轮询只记录基线，不发预览 (69.239833ms)
✔ 新帖入队并给每个管理员发预览，重复轮询不重发 (24.786916ms)
✔ 回填配置只把最近 N 条入队 (7.0745ms)
✔ X 返回 403 时告警 owner 且不崩溃 (3.897708ms)
✔ 超过 24 小时的待审会被标记过期 (11.072375ms)
✔ 按配置时区解析本地日期与星期 (12.138792ms)
✔ 日报在 10:00 发给全部管理员，当天只发一次 (19.600167ms)
✔ 周报在周一 10:00 发送并汇总 7 天来源 (3.553084ms)
✔ 定时任务会刷新当前成员数 (2.118459ms)
✔ 同一推文只插入一次 (1.219708ms)
✔ 认领是原子的，第二个管理员点不动 (0.316916ms)
✔ 发布成功后写入 message_id (0.318208ms)
✔ 跳过只能从 pending 发生 (0.261334ms)
✔ 过期只处理超过 TTL 的 pending (0.947084ms)
✔ 成员日报累计新增、退出与来源 (0.335125ms)
✔ 访客语言持久化，重复 /start 不覆盖 (0.297584ms)
✔ 预览消息可保存与读取 (0.27175ms)
ℹ tests 57
ℹ suites 0
ℹ pass 57
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 905.368709

```

### verified-web-build.log

工作目录：`/Users/macbook/.codex/backups/godfather-ip-20261110-175518/validation/web`

命令：`npm run build`
退出状态：`0`

```text

> godfather-web@0.3.0 build
> next build

▲ Next.js 16.4.3 (Turbopack)
✓ Running next.config.ts took 131ms

  Creating an optimized production build ...
✓ Compiled successfully in 1996ms
  Running TypeScript ...
  Finished TypeScript in 745ms ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/2) ...
✓ Generating static pages using 7 workers (2/2) in 85ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ƒ /_not-found
├ ƒ /admin
├ ƒ /api/[...path]
├ ƒ /api/lab/story
├ ƒ /go/[linkId]
├ ○ /icon.svg
├ ƒ /media/[mediaId]
└ ƒ /share/[mediaId]


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand


```

### verified-web-e2e.log

工作目录：`/Users/macbook/.codex/backups/godfather-ip-20261110-175518/validation/web`

命令：`npm run test:e2e`
退出状态：`0`

```text

> godfather-web@0.3.0 test:e2e
> playwright test

[WebServer] (node:27333) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27338) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27344) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27347) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)

Running 6 tests using 1 worker

(node:27350) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27358) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27423) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27439) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
  ✓  1 e2e/browser.spec.ts:33:1 › first visit isolates content; cookie confirmation persists without extending expiry; reset clears access (7.1s)
[WebServer] (node:27449) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27464) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
  ✓  2 e2e/browser.spec.ts:60:1 › memory confirmation disappears after refresh; empty leave target shows notice (2.6s)
[WebServer] (node:27467) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27475) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27480) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
  ✓  3 e2e/browser.spec.ts:74:1 › saved draft survives reload; full-screen preview renders the story; invalid publish preserves the public version (2.4s)
[WebServer] (node:27485) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27496) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
  ✓  4 e2e/browser.spec.ts:101:1 › editing during a delayed save preserves later input and the next save persists it (2.4s)
[WebServer] (node:27500) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27515) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
  ✓  5 e2e/browser.spec.ts:124:1 › principal entry changes require confirmation; stale revision errors preserve input (1.2s)
[WebServer] (node:27525) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27530) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27536) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27546) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27549) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27552) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27563) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:27566) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
  ✓  6 e2e/browser.spec.ts:147:1 › valid publication switches content; memory access loads the avatar and resolves attributed navigation (5.7s)

  6 passed (32.9s)

```

### verified-baseline-web-check.log

工作目录：`/Users/macbook/.codex/backups/godfather-ip-20261110-175518/baseline-validation/web`

命令：`npm run check`
退出状态：`0`

```text

> gu-qingtang-web@0.3.0 check
> npm run typecheck && npm run contracts:check && npm test


> gu-qingtang-web@0.3.0 typecheck
> tsc --noEmit


> gu-qingtang-web@0.3.0 contracts:check
> tsx scripts/contracts.ts --check

OPENAPI_OK: 23 operations; references resolved and schema validated
CONTENT_OK: content baseline matches generated schema/seed; five targets disabled; real publishing remains blocked
MEDIA_OK: six source photos listed for controlled import; bootstrap includes no media

> gu-qingtang-web@0.3.0 test
> tsx --test test/*.test.ts

✔ actual gate and published projections conform to the API response schemas (174.36075ms)
✔ password API schemas preserve the runtime grapheme and UTF-8 byte policy (34.749375ms)
✔ age token is purpose bound, signature checked, fixed 30 days, and expires exactly (39.169792ms)
✔ CSRF challenge has a short independent purpose and expiry (0.364042ms)
✔ scrypt uses separate salts, rejects wrong passwords and malformed encodings (439.347584ms)
✔ production cookies use host prefix, secure httponly strict path and fixed age (0.358083ms)
✔ configuration has exact independent entries and preserves unresolved values (38.47975ms)
✔ Unicode length uses graphemes, and placeholder text is rejected (1.911833ms)
✔ targets reject scripts, credentials, local hosts, templates and same-site navigation (10.363292ms)
✔ before confirmation the projection contains neither biography, entry list nor controlled media (0.564417ms)
✔ normal publication requires exit target, contact and active entry, then ready media (6.470042ms)
✔ source attribution never expands to arbitrary caller data (0.216958ms)
✔ optional blank values normalize to null without accepting missing required text (2.924125ms)
✔ neutral public share assets and controlled portraits have separate purposes (0.66225ms)
✔ HTTP age gate reveals neutral data only, strict Origin/CSRF, fixed expiry, memory revocation (215.539208ms)
✔ HTTP admin sessions isolate drafts, compare revisions, publish atomically and revoke on password change (310.355542ms)
✔ HTTP media upload requires admin and purpose, hidden and draft images stay private, published images retain references (128.289958ms)
✔ HTTP login throttles, malformed credentials share one response, logout clears current session (490.095209ms)
✔ passwords with combining graphemes remain usable after a password change (425.437333ms)
✔ explicit local draft view keeps age and version checks while serving draft photos without publishing (63.770916ms)
✔ a fully closed site has no primary entry (0.87425ms)
✔ the emphasized available entry wins even when it is not first (0.172708ms)
✔ the first available entry takes over when no available entry is emphasized (0.230208ms)
✔ the first available entry wins when several are emphasized (0.120875ms)
✔ an emphasized but disabled entry never receives the accent (0.055ms)
✔ default public reads keep the published snapshot even during development (11.257792ms)
✔ explicit loopback development reads the current draft and versions every save without publishing (53.40825ms)
✔ production and nondevelopment environments always retain published reads with the preview flag set (58.544875ms)
✔ remote, malformed and HTTPS origins retain published reads even when marked as preview (8.003042ms)
✔ actual decode strips metadata, keeps aspect, generates private derivatives and path-free records (36.949ms)
✔ display derivative uses the 2500px long edge for 4:5 images (249.418916ms)
✔ invalid, truncated, oversized, animated, over-dimension and wrong-purpose uploads leave no rows/files (163.006542ms)
✔ pagination and referenced deletion protect drafts and retained published versions (87.338958ms)
✔ transaction failure cleans newly written files; capacity check commits atomically (34.608125ms)
✔ media file symlinks and replaced directories are never followed (13.552167ms)
✔ migration and seed are idempotent; bootstrap is closed and creates no account (47.924167ms)
✔ applied migration checksums prevent silent schema-history changes (1.769083ms)
✔ CAS rejects stale saves and stale publishes without discarding current draft (2.652708ms)
✔ failed validation keeps old pointer; successful publication stores an immutable snapshot (3.4735ms)
✔ database failure inside publication rolls back snapshot, pointer and audit together (2.23575ms)
✔ media foreign keys protect drafts and all retained published versions (3.58675ms)
✔ not-ready media prevents publishing without losing the saved draft (6.377ms)
✔ public share media and age-gated imagery stay separate at publication (5.719958ms)
✔ restart preserves draft, published pointer and only finite aggregate dimensions (84.679625ms)
[story] x posts unavailable: forbidden
[story] x posts unavailable: forbidden
[story] x posts unavailable: forbidden
[story] x profile unavailable: forbidden
✔ live X and Telegram values build a feed without demo data (126.150083ms)
✔ a timeline permission error keeps follower stats and marks only posts unavailable (1.513833ms)
✔ a posts-only cooldown does not hide followers on the next refresh (1.106ms)
✔ a profile error degrades the X stat instead of failing the whole feed (0.306208ms)
✔ unconfigured production feed contains no sample numbers (0.233583ms)
✔ development without credentials keeps the marked sample feed (0.119916ms)
✔ readStoryConfig normalizes handles, chat links and TTL (0.618709ms)
✔ readStoryConfig reports malformed values without exposing secrets (0.270875ms)
✔ parseChat accepts handles, t.me links and numeric ids (0.103416ms)
ℹ tests 53
ℹ suites 0
ℹ pass 53
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2309.27275

```

### 迁移前 Bot 检查

命令：`npm run check`；工作目录为项目 `ops-bot/`；退出状态：`0`。

```text

> qgt-ops-bot@0.1.0 check
> npm run typecheck && npm test


> qgt-ops-bot@0.1.0 typecheck
> tsc --noEmit


> qgt-ops-bot@0.1.0 test
> tsx --test test/*.test.ts

✔ 管理员点发布后发到频道并记录 message_id (78.282541ms)
✔ 第二个管理员再点不会重复发布 (15.336917ms)
✔ 点跳过不会发到频道 (6.373417ms)
✔ 非管理员点按钮没有任何业务效果 (4.462ms)
✔ 频道发送失败时标记 failed 并通知 owner (4.756416ms)
✔ 纯文字帖用 sendMessage 发布 (4.372375ms)
✔ 多图帖用 media group 发布 (5.025958ms)
✔ 非管理员发命令完全静默 (38.385334ms)
✔ 管理员 /stats 返回成员与帖子统计 (22.11375ms)
✔ /report 手动触发日报 (9.294833ms)
✔ /pending 空队列与有待审两种文案 (26.202708ms)
✔ /whoami 返回用户与会话 ID (5.153917ms)
✔ 管理员发普通文本只得到操作提示 (3.643417ms)
✔ 非管理员发普通文本没有回复 (1.149ms)
✔ 解析必填项与默认值，owner 自动并入管理员 (30.326209ms)
✔ ADMIN_IDS 为空时只剩 owner (0.175625ms)
✔ 缺少必填项时一次报出全部问题 (0.318333ms)
✔ 频道 ID 必须是 @username 或负数 (0.159958ms)
✔ 轮询间隔与 TTL 越界会报错 (0.185833ms)
✔ X_ENABLED=0 时允许不填 X 凭据 (0.0935ms)
✔ 访客菜单链接必须是 https，防丢频道 ID 必须是负数 (0.232042ms)
✔ 管理员列表里的非法 ID 会报错 (0.105333ms)
✔ 去 t.co 并提取系列号 (1.259ms)
✔ 固定头尾与北京时间 (28.432625ms)
✔ HTML 转义 (0.339666ms)
✔ 正文截断到 300 字 (0.181583ms)
✔ 转义膨胀时进一步缩短正文，caption 不超过 1024 (0.159458ms)
✔ 视频帖加一行提示 (0.103708ms)
✔ 非 X 链接不生成按钮 (0.098792ms)
✔ 时间格式化 (0.0855ms)
✔ 成员加入时累计新增并记录邀请来源 (48.377417ms)
✔ 成员退出时累计退出，不重复计算未变化状态 (2.973708ms)
✔ 其他频道的成员变化不计入 (4.103666ms)
✔ 访客 /start 直接出菜单：无年龄门、无本周内容、无会员购买 (32.516084ms)
✔ 未配置的入口：海外订阅与联系客服隐藏，频道按钮降级为提示 (3.332208ms)
✔ 语言切换持久化，下次 /start 仍是英文 (6.276167ms)
✔ 联系客服先说明再跳转，消息不落库 (4.43375ms)
✔ 管理员公告：模板 → 字段 → 预览 → 确认发到防丢频道 (15.7995ms)
✔ 非管理员发 /announce 或点公告按钮没有回复 (3.710875ms)
✔ 管理员 /start 额外显示管理命令提示 (4.574541ms)
✔ 首次轮询只记录基线，不发预览 (47.437458ms)
✔ 新帖入队并给每个管理员发预览，重复轮询不重发 (27.6775ms)
✔ 回填配置只把最近 N 条入队 (5.21825ms)
✔ X 返回 403 时告警 owner 且不崩溃 (5.23825ms)
✔ 超过 24 小时的待审会被标记过期 (7.834792ms)
✔ 按配置时区解析本地日期与星期 (24.023834ms)
✔ 日报在 10:00 发给全部管理员，当天只发一次 (31.77825ms)
✔ 周报在周一 10:00 发送并汇总 7 天来源 (8.692417ms)
✔ 定时任务会刷新当前成员数 (5.096042ms)
✔ 同一推文只插入一次 (3.572125ms)
✔ 认领是原子的，第二个管理员点不动 (0.357667ms)
✔ 发布成功后写入 message_id (0.292541ms)
✔ 跳过只能从 pending 发生 (0.251834ms)
✔ 过期只处理超过 TTL 的 pending (0.859958ms)
✔ 成员日报累计新增、退出与来源 (0.318042ms)
✔ 访客语言持久化，重复 /start 不覆盖 (0.264209ms)
✔ 预览消息可保存与读取 (0.264459ms)
ℹ tests 57
ℹ suites 0
ℹ pass 57
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 206509.969

```

### migration-copy.log

```text
{"mode":"applied","draftChanged":true,"publishedChanged":true,"draftRevision":7,"versionId":"2","avatar":"51f13ade-802f-4063-98b5-86f8214ec4c2","backupPath":"/Users/macbook/.codex/backups/godfather-ip-20261110-175518/migration-script-backup.sqlite","draftsRemainSeparate":true}

```

### migration-live-record.json

```text
{
  "cwd": "/Users/macbook/.codex/backups/godfather-ip-20261110-175518/validation/web",
  "env": {
    "DATABASE_PATH": "/Users/macbook/Documents/推特创作者计划/web/var/site.sqlite",
    "MEDIA_ROOT": "/Users/macbook/Documents/推特创作者计划/web/var/media"
  },
  "commands": [
    {
      "command": [
        "node",
        "--import=tsx",
        "scripts/migrate-brand.ts"
      ],
      "exit": 0,
      "output": "{\"mode\":\"dry-run\",\"draftRevision\":6,\"publishedVersion\":\"1\",\"target\":\"教父\",\"draftsRemainSeparate\":true}\n"
    },
    {
      "command": [
        "node",
        "--import=tsx",
        "scripts/migrate-brand.ts",
        "--apply"
      ],
      "exit": 0,
      "output": "{\"mode\":\"applied\",\"draftChanged\":true,\"publishedChanged\":true,\"draftRevision\":7,\"versionId\":\"2\",\"avatar\":\"c91250ff-cad1-4f1d-a07e-4a3aa2a60432\",\"backupPath\":\"/Users/macbook/.codex/backups/godfather-ip-20261110-175518/site-immediately-before-migration.sqlite\",\"draftsRemainSeparate\":true}\n"
    }
  ]
}
```

## 恢复与差异复现

以下命令只在独立副本执行，当前项目保持教父品牌。

工作目录：`/Users/macbook/.codex/backups/godfather-ip-20261110-175518`
命令：`python3 /Users/macbook/.codex/backups/godfather-ip-20261110-175518/rollback-brand.py --backup /Users/macbook/.codex/backups/godfather-ip-20261110-175518 --root /Users/macbook/.codex/backups/godfather-ip-20261110-175518/rollback-validation`
退出状态：`0`

```text
{"mode": "dry-run", "files": 61, "database": "ready", "laterEdits": false}

```

工作目录：`/Users/macbook/.codex/backups/godfather-ip-20261110-175518`
命令：`python3 /Users/macbook/.codex/backups/godfather-ip-20261110-175518/rollback-brand.py --backup /Users/macbook/.codex/backups/godfather-ip-20261110-175518 --root /Users/macbook/.codex/backups/godfather-ip-20261110-175518/rollback-validation`
退出状态：`1`

```text
Later edits detected; retained: 00-阅读说明.md

```

工作目录：`/Users/macbook/.codex/backups/godfather-ip-20261110-175518`
命令：`python3 /Users/macbook/.codex/backups/godfather-ip-20261110-175518/rollback-brand.py --backup /Users/macbook/.codex/backups/godfather-ip-20261110-175518 --root /Users/macbook/.codex/backups/godfather-ip-20261110-175518/rollback-validation --apply`
退出状态：`0`

```text
{"mode": "applied", "filesRestored": 61, "databaseRestored": true, "historyRetained": true}

```

工作目录：`/Users/macbook/.codex/backups/godfather-ip-20261110-175518/diff-validation`
命令：`git apply --check /Users/macbook/.codex/backups/godfather-ip-20261110-175518/migration.diff`
退出状态：`0`

```text

```

工作目录：`/Users/macbook/.codex/backups/godfather-ip-20261110-175518/diff-validation`
命令：`git apply /Users/macbook/.codex/backups/godfather-ip-20261110-175518/migration.diff`
退出状态：`0`

```text
/Users/macbook/.codex/backups/godfather-ip-20261110-175518/migration.diff:415: trailing whitespace.
版本：v3.6，Linktree 类单页链接聚合导航页；已选定风格01「墨黑香槟」，站点显示名称「教父」。  
/Users/macbook/.codex/backups/godfather-ip-20261110-175518/migration.diff:1008: trailing whitespace.
制定日期：2026-11-10；本轮已确认整体采用  
/Users/macbook/.codex/backups/godfather-ip-20261110-175518/migration.diff:1032: trailing whitespace.
依据：`04-个人Link导航页-需求.md` v3.5、`设计开发计划文档.md` v1.3、M1 可编辑设计与 `web/config/content-base.json`。  
warning: 3 lines add whitespace errors.

```

恢复结果：全部迁移文件还原、草稿内容及公开指针还原、后续编辑保护生效、数据库完整性通过；差异文件实际应用后哈希与迁移后文件一致。

## 当前验证边界

- Web 54 项、Bot 57 项、浏览器 6 项及生产构建通过。
- 当前本地数据库草稿和公开快照名称均为教父，头像为品牌徽章；历史版本按不可变约束保留。
- 正式账号显示名、BotFather 与远程部署未自动改动；运行中的运营 Bot 仍需正式重启，新双向联系地址待配置。
- 既有人像背景在本机文件系统可能为云端占位，使用时需要下载；截图只用于品牌文案与布局核对，不代表所有媒体已离线就绪。

## 恢复命令

先检查：`python3 scripts/rollback-brand.py --backup /Users/macbook/.codex/backups/godfather-ip-20261110-175518`
执行恢复：`python3 scripts/rollback-brand.py --backup /Users/macbook/.codex/backups/godfather-ip-20261110-175518 --apply`
