> **2026-11-04：本 3D 滚动光廊已从 Lab 主流程归档。** 当前 `?experience=lusion` 已是五段 Story Lab（2D 背景 + 内容切换），见 [Story-Lab-实现记录.md](Story-Lab-实现记录.md) 与 [滚动叙事页-需求与开发计划.md](滚动叙事页-需求与开发计划.md)。本文保留为 3D 版本历史。

# Lusion Lab · 滚动光廊

日期：2026-11-03 晚  
入口：`http://localhost:3000/?experience=lusion`（dev + localhost only）  
状态：**已落地；只改 dev-only Lab，主站 `/` 未改。**

## 1. 这次改什么

参考 [lusion.co](https://lusion.co/) 的滚动叙事：**页面滚动推进背景，左侧「与我相遇」内容固定在原位。**

旧版是“点一下 / 滚一格，切一张”的离散切换；新版把五帧走廊变成一条可滚动的空间：

- 五个站点对应 01–05；
- 滚动时相机/灯箱连续推进，可以停在任意中间态；
- 左侧导航、顶栏、页脚、右下 HUD 全部固定，不随页面滚走；
- 初始停在 01 绿色入口，向下滚动依次经过 02–05。

## 2. 体验

| 输入 | 行为 |
|---|---|
| 触控板 / 鼠标滚轮 | 原生页面滚动；背景连续推进，不再有“一次滑动一帧”的锁 |
| 键盘 ↑ ↓ PageUp PageDown Home End | 浏览器原生滚动，同步驱动背景 |
| HUD 上一帧 / 下一帧 | 平滑滚动到上一个 / 下一个站点 |
| 滚动条 | 可直接拖动到任意位置；左栏保持固定 |

- 页面是一条 **5 屏高的滚动轨道**（`500svh`）；可见视口 `position: sticky`。
- 初始在 01（顶部）；向下滚动到 02–05；到 05 时页面到底。
- HUD 的数字和标题按最近站点切换；HUD 底部有一条 1px 金色进度线。
- 左栏、顶栏、页脚、HUD 都留在 sticky 视口里，所以滚动全程位置不变；链接、CTA、站点说明仍然可点。

## 3. 实现

### 3.1 页面与固定层

`web/src/components/light-gallery.css`：

```css
.light-gallery[data-scroll='true'] { height: 500svh; }
.light-gallery[data-scroll='true'] .lg-viewport {
  position: sticky;
  top: 0;
  height: 100svh;
  min-height: 100svh;
}
```

- 只有 `sceneReady` 时加 `data-scroll`；加载中 / 2D 降级时页面仍然是普通 100svh，不会出现空白长页。
- 左侧 `.lg-navigation` 本来就在视口网格里，因此 sticky 视口天然把它固定住。

### 3.2 滚动 → focus

`web/src/components/light-gallery.tsx`：

- `focusRef` 保存连续的 0–4 focus；
- 滚动时用 `window.scrollY`、缓存的 section 顶部和 1 屏间距换算 focus，写入 ref；
- 只在“最近站点”变化时 `setLabIndex`，避免每帧 React 重渲染；
- 页面几何在挂载/ resize 时缓存，滚动回调不再读取 `getBoundingClientRect` / `offsetHeight`，避免强制布局。

初始 focus 为 0（01），所以打开页面就在第一个站点，不需要程序化跳转。

### 3.3 场景连续采样

`web/src/components/lusion-scene.tsx` 不再使用离散 `Glide`，而是每帧读取 `focusRef`：

- `smoothFocus` 以 `0.16s` 时间常数缓动到目标 focus，滚动停止后柔和收尾；
- 当前段 `base → next`，用 `smoothstep(frac)` 采样一帧交接；
- 相机仍然固定在 `z=7.6` 的横向轨道；framing point 略向 incoming 偏一点；
- incoming 画面很快变成完全不透明（避免 outgoing 透出造成重影）；
- 前方灯箱按深度后退（最多 5.5）并压暗（最多 0.62），在中间态给新主角让出视线；
- 每个灯箱的倒影随自己的 z 移动；
- 站点处所有额外让位归零，画面回到原来的五帧走廊构图。

这样滚动可以向前、向后、停在中间；不会出现“点一下才动”的跳变。

### 3.4 性能取舍

- DPR ≥ 1.5 关闭 MSAA，保留 2× canvas；1× 屏幕保留 MSAA；
- HUD 使用局部 `--lab-progress`，不再在 section 上更新 CSS 变量；
- 滚动回调只读 `window.scrollY`，几何缓存；
- 场景只有 5 个灯箱 + 环境，每帧 O(5)。

## 4. 降级

| 条件 | 行为 |
|---|---|
| 手机 / 窄视口 / coarse pointer | 2D 光廊，页面不拉长，无 canvas |
| `prefers-reduced-motion: reduce` | 2D，无 canvas |
| 静态模式 | 场景卸载，页面收回 100svh，2D 停在当前帧 |
| WebGL 创建失败 | 保留 2D 背景，不出现滚动长页 |

静态模式从滚动界面切回 2D 时，会先记住当前站点，fallback 显示当前帧；切回动态时会回到该站点附近。

## 5. 验证

| 项目 | 结果 |
|---|---|
| `npm run check` | **47/47** |
| `npx playwright test e2e/light-gallery.spec.ts` | **12/12** |
| 完整 e2e | **36/36，1.5m** |
| `npm run build` | 通过 |
| 左栏位置 | 滚动到 01–05 各站点，`.lg-navigation` 的 `x/y` 不变（e2e 断言） |
| 滚动帧率（headed Chrome，1440×1000，DPR2，滚轮） | median **16.7ms**，p90 **18.6ms**；长距离平滑跳转偶发一次约 50–130ms 合成停顿，主要出现在滚动末端 |

![五个站点与一次过渡](../web/var/screenshots/M3-lusion-scroll-2026-11-03/scroll-stations.png)

动图（滚动 01 → 05，左栏固定）：

![滚动光廊](../web/var/screenshots/M3-lusion-scroll-2026-11-03/scroll-tour.gif)

## 6. 取舍

- **使用原生滚动，不做 scroll-jacking**：触控板、键盘、滚动条、无障碍都保留；左栏固定靠 sticky，不靠拦截 wheel。
- **从 01 开始**：滚动叙事自然从入口帧开始；红色 hero 在第二个站点。
- **相机不穿走廊**：仍然是“灯箱到舞台”的走廊，scroll 只是把原来的切换变成可擦洗的连续量；这样保留已确认的五帧构图，不引入近景灯箱糊脸。
- **移动端不拉长页面**：五帧滚动只在桌面 3D 下启用；手机继续 2D 条。

## 7. 调参

`web/src/components/lusion-scene.tsx`：

- focus 缓动：`1 - Math.exp(-dt / 0.16)`
- 前方灯箱后退上限：`5.5`
- 压暗上限：`0.62`
- framing lead：`opening * 0.16`
- 站点构图：`STAGE_Z = 0.4`、`CAMERA_Z = 7.6`

`web/src/components/light-gallery.css`：

- 滚动轨道高度：`500svh`（4 个过渡 = 4 屏）
- 初始站点：`useState(0)` / `focusRef = useRef(0)`
- HUD 平滑滚动：`behavior: 'smooth'`

如果想让每个站点的间隔更长，把 `500svh` 改成 `600svh`；如果想更快进入下一帧，改小滚动轨道高度，但一个站点至少保留约 80svh 的可读停留。
