# Story Lab · 实现记录（Lab v0.1）

日期：2026-11-04  
入口：`http://localhost:3000/?experience=lusion`（dev + localhost only）  
状态：**Lab 原型已实现；不上生产。**  
关联：[滚动叙事页需求与计划](滚动叙事页-需求与开发计划.md) · [滚动光廊（3D，已归档）](Lusion-Lab-滚动光廊.md)

## 1. 这一版做了什么

把原来的 3D 五帧光廊替换为**五段式滚动叙事**：

| 段 | 背景 | 左侧内容 |
|---|---|---|
| 01 | 绿色 Dior | 与我相遇；Telegram 防丢主页（复用 `tg_personal` 路由） |
| 02 | 红色长裙 | 个人简介 + X / Telegram 粉丝数据 |
| 03 | 白色圣诞 | X 最新视频/图片预告（链接 + 远程预览图，不落盘） |
| 04 | 粉色楼梯 | 会员四档：单月 / 季度 / 年费 / 永久 |
| 05 | 白色皮草 | USDT + Telegram Bot 购买教程 |

- 背景为 2D 整屏交叉淡入（5 层，滚动权重），不再挂 WebGL；
- 左侧面板固定在原位，内容按站点 420ms 淡入替换；
- 桌面右下有 01–05 站点索引；底部中央有下拉提示（05 自动隐藏）；
- 移动端改为五段正常文档流堆叠，保留固定下拉提示；
- `prefers-reduced-motion` / 静态模式关闭浮动和面板动画；
- 3D `LusionScene` 从 Lab 主流程退场，文件保留为历史，不再被 `experience=lusion` 渲染。

## 2. 文件

| 文件 | 作用 |
|---|---|
| `web/src/components/story-lab.tsx` | 五段叙事、滚动、背景、面板、提示、教程弹层 |
| `web/src/components/story-lab.css` | 固定面板/背景/移动端布局 |
| `web/src/components/story-content.ts` | 文案、四档会员、步骤、FAQ、演示数据 |
| `web/src/app/api/lab/story/route.ts` | X + Telegram 数据；仅 dev；内存缓存；失败回退 |
| `web/src/components/public-app.tsx` | `lusionLab` 改为渲染 `StoryLab` |
| `web/src/components/light-gallery.tsx` | 仍服务 `experience=light-gallery`；旧 lusion 分支不再走 |
| `web/.env.example` | 新增 X / Telegram 环境变量 |
| `web/e2e/light-gallery.spec.ts` | 3 个 Story Lab 用例替换旧 3D 用例 |

## 3. 实时数据（当前为演示/待接）

接口：`GET /api/lab/story`，只在 `NODE_ENV=development` 返回；5 分钟内存缓存；不写磁盘。

| 数据 | 来源 | 环境变量 |
|---|---|---|
| X 粉丝数 | X API v2 `public_metrics.followers_count` | `X_BEARER_TOKEN`、`X_USERNAME` |
| X 最新预告 | X API v2 最近 5 条原创帖，取图片/视频预览图 | 同上 |
| Telegram 防丢主页订阅 | Bot API `getChatMemberCount` | `TELEGRAM_BOT_TOKEN`、`TELEGRAM_ANTI_LOSS_CHAT` |
| Telegram 预告频道订阅 | 同上 | `TELEGRAM_BOT_TOKEN`、`TELEGRAM_PREVIEW_CHAT` |

- X 的媒体只使用远程 URL（`pbs.twimg.com` 等）+ 原帖链接，不下载、不落盘；视频只展示封面 + “在 X 查看”。
- Telegram 只取公开成员数；不抓取消息内容。
- 没有环境变量或接口失败时返回**演示数据**，UI 标注“示例数据”，不伪装实时。
- OnlyFans 不展示、不抓取。
- 环境变量写在 `web/.env.local`（不要提交），改完重启 dev server。

## 4. Telegram 防丢主页

- Lab 把 `tg_personal` 的显示 label 覆盖为 **Telegram 防丢主页**，描述为“永久入口 · 丢了也能找到我”；`/go/tg_personal` 路由沿用，不丢历史统计。
- **实际频道 URL 仍取站点配置里 `tg_personal` 的 URL**；当前后台若还是旧私人号地址，需要把 `tg_personal.url` 改成防丢频道链接。
- X 预告频道 / X 主页 / 会员购买 CTA 复用对应链接；链接未启用时显示“暂未开放”，需要在后台启用并填写真实 URL。

## 5. 会员内容

四档：单月 30 天、季度 90 天、年费 365 天、永久。  
购买方式：USDT + Telegram Bot；Bot 确认到账后发**一次性加入链接**（仅一人可用）；月/季/年到期 Bot 自动移出，永久不再移出。

- 站内不收款、不保存支付信息；教程在 05 面板和“查看完整教程”弹层。
- 当前没有真实价格，界面写“价格与 USDT 网络以 Bot 内实时报价为准”；后续可加入价格字段。
- “打开 Telegram Bot”复用 `membership` 链接；当前链接未启用时按钮为“暂未开放”。

## 6. 验证

| 项目 | 结果 |
|---|---|
| `npm run check` | **47/47** |
| `npm run build` | 通过 |
| Story Lab e2e | **3/3**（五段/固定面板/移动端/减少动态） |
| 完整 e2e | **36/36**（1.4m，最终一轮） |
| 1440×1000 | 五段、背景交叉、固定面板、下拉提示 |
| DPR2 滚动 | median 16.7ms / p90 17.7ms / p99 17.8ms（预览段首次合成有 1–2 个长帧） |
| 390×844 | 五段堆叠、固定下拉提示、05 隐藏 |
| 静态/减少动态 | `data-motion=off`，关闭浮动与面板动画 |

## 6.1 视觉修正（2026-11-04）

针对第一轮 Lab 反馈，修正两处：

1. **照片偏暗**
   - 右侧照片不再被整屏黑色渐变压暗；黑色只保留在左侧文字区和底部/顶部必要过渡。
   - 照片画幅加 `brightness(1.03) saturate(1.1)`，移动端人像 `brightness(1.02) saturate(1.05)`，预览卡片缩略图也去掉压暗。
   - 左侧面板仍保持深色，保证文字对比；这是设计取舍，不是照片被压暗。

2. **右侧照片与左侧黑区接缝大小不一致**
   - 原来五张图宽度不同（1024 / 916 / 1024 / 910 / 910），`background-size: contain` 导致照片宽度在 667–750px 之间变化，黑区跟着时大时小。
   - 现在统一为**固定 48% 画幅**（1440 下 x=749、宽 691），五张图都 `cover` 裁切；接缝始终在 52%，黑区大小不再随图片比例变化。
   - 画幅左侧保留 16% 软过渡；照片内容不同造成的明暗差异仍在，但几何边界固定。

验证：`npm run check` 47/47、build 通过、Story Lab e2e 3/3、完整 e2e 36/36；1440 下五段照片框实测均为 `x=749, w=691, h=1000`。

## 6.2 小屏 / 平板适配（2026-11-04 第二轮）

第一轮小屏仍把照片铺在内容下面，导致人物被按钮盖住、整屏黑罩把照片压黑。现在分三档：

| 宽度 | 布局 |
|---|---|
| ≤ 599px（手机） | 照片按原图比例**完整展示**（约 520–585px 高），标题/kicker 压在照片底部，内容在下方 ink 面板；03 默认 2 条 + “查看全部” |
| 600–959px（平板） | 55 / 45 双栏：左内容、右照片；照片 `contain` 完整放入右栏，允许少量深色留白 |
| ≥ 960px（桌面） | 固定左侧面板 + 右侧 48% 照片画幅，保持之前的接缝和亮度修正；03 保持 3 条 |

- 手机/平板照片不再有整屏黑色遮罩；只保留 hero 顶部/底部渐变，内容区用纯深色背景，所以照片颜色正常。
- 手机/平板的下拉提示从“固定底部压住链接”改为**照片底部**的 `story-mobile-hint`，点按进入下一段；桌面仍是右下/底部中央提示。最后一段没有下一段提示。
- 手机标题/kicker 现在压在照片底部（仅标题区用渐变过渡，内容卡片和按钮仍在实色面板上）；平板标题留在左栏内容里。
- 平板照片 `contain`，整张照片完整放入 45% 右栏；手机按原图比例完整展示，不裁人物。
- 断点从 849 调到 959，避免 850–959 的窄桌面按钮压到照片；960 起才用桌面固定面板。

验证：1440 / 768 / 390 三档截图见 `responsive-layout.png`；`check 47/47`、build 通过、Story Lab e2e 3/3、完整 e2e 36/36。

![小屏适配](../web/var/screenshots/M4-story-lab-2026-11-04/responsive-layout.png)

![手机 390](../web/var/screenshots/M4-story-lab-2026-11-04/mobile-01.png)

![平板 768](../web/var/screenshots/M4-story-lab-2026-11-04/tablet-01.png)

## 6.3 完整照片 + 03 内容紧凑（2026-11-04 第三轮）

按“完整展示图片、不做整块半透明内容”的建议落地：

- **手机**：照片按原图比例完整显示（390 宽时约 520–585 高），标题/kicker 压在照片底部；内容在下方实色面板，按钮不再压照片。03 默认只显示 **2 条预告 + “查看全部 3 条”**，点开展示第 3 条，可再收起。
- **平板**：右栏 45% 用 `contain`，整张照片完整，允许少量深色上下留白；左栏 3 条预告 + CTA，按钮不压照片。
- **桌面**：保持固定面板 + 48% 画幅 + 3 条预告。
- **半透明只用于标题**：照片底部有渐变，标题/kicker 叠在照片上；卡片和按钮始终在实色面板上。
- 下拉提示仍在照片底部，不与内容按钮重叠。

验证：`check 47/47`、build 通过、Story Lab e2e 3/3、完整 e2e 36/36。

![03 完整照片 / 紧凑内容](../web/var/screenshots/M4-story-lab-2026-11-04/preview-compact.png)

![手机 03](../web/var/screenshots/M4-story-lab-2026-11-04/mobile-03.png)

![平板 03](../web/var/screenshots/M4-story-lab-2026-11-04/tablet-03.png)

## 7. 已知限制 / 下一步

- **真实数据未接**：当前 `.env.local` 没有 X / Telegram token，显示的是示例；填好 env 后页面刷新/5 分钟缓存更新。
- **频道 URL / 链接未启用**：防丢主页、X、预告频道、会员 Bot 需要在后台补齐 URL 并启用；否则 CTA 为“暂未开放”。
- **会员价格/档位文案**：待用户给定价格与最终权益；当前只有四档时长和统一权益。
- **后台编辑**：故事文案目前是 `story-content.ts` 常量；生产前应迁入配置 v2/后台。
- **高清背景**：当前使用 1024px `/lusion/01–05.jpg`；Retina 下略软，生产前生成 1600–2000px 衍生图。
- **X 预览图**：远程 hotlink；若 X 限制 hotlink，需要改为服务端代理/图片代理，但仍不落盘。
- **生产**：本轮只做 Lab，`?experience=lusion` 仍 dev-only；未改 `/`。

## 8. 证据

`web/var/screenshots/M4-story-lab-2026-11-04/`：桌面五段、移动端、站点索引与下拉提示。

![桌面五段](../web/var/screenshots/M4-story-lab-2026-11-04/story-lab-stations.png)

![移动端 01](../web/var/screenshots/M4-story-lab-2026-11-04/mobile-01.png)

![滚动演示](../web/var/screenshots/M4-story-lab-2026-11-04/story-lab-scroll.gif)
