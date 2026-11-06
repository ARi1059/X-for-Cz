# Story Lab 实现记录

日期：2026-11-06  
状态：唯一公开页（`/`），已通过类型检查、44 项单元测试、6 项浏览器回归与生产构建。

## 1. 代码结构

| 文件 | 作用 |
|---|---|
| `web/src/app/page.tsx` | 公开页入口，直接渲染 `PublicApp` |
| `web/src/components/public-app.tsx` | 年龄门状态机、确认 / 重置 / 离开、入口解析与跳转 |
| `web/src/components/gate-stage.tsx`、`web/src/app/gate.css` | 年龄门灯效与表单样式 |
| `web/src/components/story-lab.tsx` | 五段叙事、滚动轨道、移动端、弹窗 |
| `web/src/components/story-shell.css` | 共享外壳：wordmark、身份区、入口行、弹窗、页脚、自定义光标 |
| `web/src/components/story-lab.css` | 页内布局：固定层、背景、面板、章节导航、移动端 |
| `web/src/components/story-content.ts` | 章节文案、会员档位、购买步骤、示例数据 |
| `web/src/components/media-image.tsx` | 受控图片加载（公开 / 后台两种端点） |
| `web/src/app/api/lab/story/route.ts` | X / Telegram 数据聚合与 5 分钟缓存 |
| `web/src/components/intro-curtain.tsx`、`open-cursor.tsx` | 入场幕布、桌面光标 |

已删除：After Hours 公开页（`public-view.tsx`、`noir-motion.*`、`noir-public.css`）、Light Gallery（`light-gallery.*`、`light-gallery-scene.ts`、`light-gallery-model.ts`）、WebGL 实验（`lusion-scene.tsx`）、`?experience=` 变体，以及 `three` / `@types/three` 依赖。

## 2. 关键实现

- **滚动**：桌面以 500svh 高的轨道驱动，`scroll` 事件只更新背景层透明度与当前章节索引，不触发 React 全页重渲染；章节切换通过 ref 直接改 DOM（`aria-hidden`、`inert`、`is-active`）。
- **移动端**：`matchMedia('(max-width: 959px)')` 切换为普通文档流，`IntersectionObserver` 同步章节状态。
- **背景**：五张 `/lusion/01–05.jpg` 常驻，滚动进度取权重大于 0.002 的层显示，其余置 0.001 防闪烁。
- **性能**：图片预加载、帖子封面 `decode()`；离屏或后台标签页暂停滚动更新。
- **年龄门**：确认前只请求 `/api/gate`；确认后携带 Cookie 或内存 token 请求 `/api/site`，401 时自动回到门。
- **后台预览**：全屏 `<dialog>` 内复用同一 `StoryLab` 组件，媒体走管理员端点，入口不跳转。

## 3. 验证结果（2026-11-06）

```sh
npm run typecheck   # 通过
npm test            # 44/44
npm run build       # 通过（Turbopack，8 个动态路由）
npm run test:e2e    # 6/6（独立 3103 端口 + 临时数据）
```

浏览器覆盖：年龄门隔离与 Cookie 持久化、重置、仅本次确认 + 离开提示、草稿保存/刷新、全屏预览与发布校验、延迟保存保留输入、主入口停用确认、发布后外链与统计归因。

视觉核对：桌面 1440×900（门、首页、第二段）、手机 390×844，均无横向溢出；截图保存在 `web/var/screenshots/2026-11-06-story-refactor/`。

## 4. 已知边界

- 浏览器回归使用 dev 服务器；此前用 `NEXT_DIST_DIR=.next-e2e` 隔离构建目录会在 Turbopack 下触发自监听重载循环，已改为默认 `.next`（测试服务与开发服务不要同时启动）。
- `/api/lab/story` 未配置凭证时返回示例数据，页面会显示“示例数据”标记。
- 背景图是固定资源（`web/public/lusion/`），不随后台照片条变化；要替换需要更新文件或扩展配置。
- 后台仍保留头像与照片条编辑，照片条数据随草稿/发布保存，但公开页暂不渲染，属于预留能力。
- 真实入口目标、联系邮箱与中性离开地址仍需在后台补齐后发布。
