# cdsexgirl.com 部署记录

部署日期：2026-11-06  
服务器：`103.20.223.66:22`（Debian 11 bullseye，2 vCPU / 3.8 GiB，磁盘 5.4 GiB）  
域名：`cdsexgirl.com`、`www.cdsexgirl.com`（Cloudflare 代理，源站 103.20.223.66）

## 1. 部署形态

```
浏览器 ── Cloudflare(HTTPS) ── 103.20.223.66:443 nginx ── 127.0.0.1:3200 next start
```

| 项 | 值 |
|---|---|
| 应用目录 | `/opt/cdsexgirl/app` |
| 数据目录 | `/opt/cdsexgirl/data`（`site.sqlite` + `media/`） |
| 备份目录 | `/opt/cdsexgirl/backups` |
| Node | `/opt/node-v24.22.2-linux-x64`（系统全局 node v22 未改动） |
| 进程 | systemd `cdsexgirl.service`，`enabled` + `active`，仅监听 127.0.0.1:3200 |
| 反向代理 | `/etc/nginx/sites-available/cdsexgirl` → `sites-enabled/cdsexgirl` |
| 证书 | Let's Encrypt，`/etc/letsencrypt/live/cdsexgirl.com/`，有效期至 2027-02-04，`certbot renew --dry-run --cert-name cdsexgirl.com` 通过 |
| 访问日志 | `/var/log/nginx/cdsexgirl.access.log` |
| 环境变量 | `/opt/cdsexgirl/app/.env.local`（0600，含两份独立 64 字符密钥） |

环境变量要点：`APP_ORIGIN=https://cdsexgirl.com`、`LOCAL_DRAFT_PREVIEW=0`（生产忽略草稿预览）、
`DATABASE_PATH=/opt/cdsexgirl/data/site.sqlite`、`MEDIA_ROOT=/opt/cdsexgirl/data/media`。

## 2. 与既有项目的隔离

| 项目 | 状态 | 隔离手段 |
|---|---|---|
| `sexgirlweb` | **服务器上不存在**（全盘搜索无目录、无进程、无站点、无 systemd 单元） | 无需终止 |
| `Chiyanlu-Exclusive-Bot` | 未触碰，`chiyanlu-bot.service` 正常 | 端口 3100/3101、目录 `/opt/Chiyanlu-Exclusive-Bot` 均未改动 |
| `vidpic-hub-bot` | 未触碰，`vidpic-api`/`vidpic-bot-worker`/`vidpic-redis` 正常 | 端口 8080/8081/8082 未占用；新站点为独立 `server` 块 |

新站点只占用 `127.0.0.1:3200` 与 nginx 的 `cdsexgirl.com` server 块；`nginx -t` 与既有站点均未受影响。

## 3. 数据迁移

本机 `web/var/site.sqlite` 经 `sqlite3 .backup` 生成一致性副本后上传，`integrity_check` 通过；
本地 `var/media/` 全量同步。迁移后：草稿 revision 6（头像 + 5 张照片 + 入口）、媒体 8 个、发布版本 1（初始空配置）。
管理员账号在服务器上以 `npm run setup -- --reset-admin` 重置为独立凭据，保存于 `/opt/cdsexgirl/app/var/local-admin.json`（0600）。

## 4. 备份

`/opt/cdsexgirl/bin/backup.sh`，cron `15 4 * * *`：

- 每日 `sqlite3 .backup` → `backups/site-YYYY-MM-DD.sqlite`，保留 14 天；
- 每周日 `media-YYYY-MM-DD.tar.gz`，保留 4 周。

## 5. 验收结果（2026-11-06）

| 检查 | 结果 |
|---|---|
| `https://cdsexgirl.com/` | 200，年龄门正常渲染（Headless Chromium 截图核对） |
| `http://` → `https://` | 301 |
| `https://www.cdsexgirl.com/` | 200 |
| `/api/gate` | 200，返回版本 1 与 CSRF |
| `POST /api/age/confirm` | 200，下发 30 天 Secure Cookie |
| 成年后 `/api/site` | 200 |
| 未确认时 `/media/...` | 401；`/share/...` 400（非公开素材） |
| `/admin` | 200，管理员登录页正常 |
| 后台 `/api/admin/preview` | 200，`publishIssues` 仅两项待补 |
| 重启服务 | `systemctl restart cdsexgirl` 后仍 200 |
| 证书续期演练 | 通过 |

## 6. 未完成 / 待办

1. **发布**：草稿缺 `ageGate.exitUrl`（中性离开地址）与 `footer.contactEmail`（联系邮箱），发布校验拦截；
   在 `/admin` 补齐后保存 → 预览 → 发布。发布前公开页读取的是版本 1（入口全部“暂未开放”）。
2. **Cloudflare SSL 模式**：建议设为「完全（严格）/ Full (strict)」；当前源站已是有效 Let's Encrypt 证书，
   切换后不会中断（需在控制台确认当前是否为 Flexible/Full）。
3. **磁盘**：根分区 92%（剩约 420 MiB）。构建与缓存已清理，但长期偏紧，建议扩容或清理其它项目日志。
4. **既有站点证书告警**：`certbot renew --dry-run` 全量演练时，`www.chiyanlog.com` / `chianlog.com` 的
   HTTP-01 校验返回 404，续期会失败（与本项目无关，属既有站点问题，未擅自动手）。
5. 可选：`www` 目前直接返回 200 而非 301 到裸域，如需 canonical 可加跳转。
