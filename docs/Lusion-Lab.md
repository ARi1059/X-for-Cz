# Lusion Lab 原型

日期：2026-11-02  
入口：`http://localhost:3000/?experience=lusion`（仅 `NODE_ENV=development` + localhost）  
性质：**隔离实验，不影响 `/` 主站，不发布，不新增依赖。**

## 1. 做了什么

一个「After Hours 私人放映室」的 3D 人像原型：

- 现有光廊人像照片直接作为 Three.js 纹理；
- 3D 照片平面 + 金色细框；
- 照片后方 2.45 半径金色圆环；
- 径向金色辉光；
- 190 个金色尘埃点；
- 指针驱动相机视差、照片轻微旋转、圆环/尘埃缓慢运动；
- 顶部标识 `LUSION LAB / 3D STUDY`；
- 复用现有年龄门、1+4 链接、主入口、CTA、OPEN 光标、静态开关、页脚。

**没有新增图片/字体/第三方依赖。** `three@0.186.1` 是项目已有依赖。

## 2. 架构

| 位置 | 作用 |
|---|---|
| `src/app/page.tsx` | `experience=lusion` 仅 dev/local |
| `src/components/public-app.tsx` | `lusionLab` 选择 LightGallery，传递 `lusion` |
| `src/components/light-gallery.tsx` | 加载现有 `MediaImage`，将已解码 `<img>` 传给场景；`data-lusion` |
| `src/components/lusion-scene.tsx` | Three.js 场景、纹理、相机、圆环、尘埃、清理 |
| `src/components/light-gallery.css` | `.lg-lusion-scene` 层、2D 背景交叉淡出 |

- 场景通过 `next/dynamic({ssr:false})` 加载，只进 Lab 页面。
- 纹理来自 `LightGallery` 已经加载的 `<img>`（object URL），**不新增 `/media` 请求**。
- 没有使用 `@react-three/fiber` 或新包。

## 3. 降级

| 条件 | 行为 |
|---|---|
| 桌面 + fine pointer + 非 reduced | 3D 场景 |
| 手机 / 窄视口 / coarse pointer | 2D 光廊人像，不挂 canvas |
| `prefers-reduced-motion: reduce` | 2D，不挂 canvas |
| 静态模式 | 场景卸载，2D 恢复 |
| WebGL 创建失败 | 保留 2D 背景（`onFail`） |

场景内还有：

- `visibilitychange` 暂停 rAF；
- resize 更新 renderer/camera；
- 卸载时 dispose 所有几何/材质/纹理并清空 canvas；
- 不播放声音，不请求外部资源。

## 4. 实测

| 项目 | 结果 |
|---|---|
| 1440 canvas | `1440×1000`，`is-ready=true` |
| 2D 背景 | `opacity:0 / visibility:hidden`（3D 接管） |
| 手机 390 | 无 canvas；2D 背景 `opacity:1` |
| reduced 1440 | 无 canvas；2D 背景 `opacity:1` |
| 主站回归 | 33/33 e2e；47 check；build 通过 |
| 视觉 | `web/var/screenshots/M3-lusion-lab-2026-11-02/` |

## 5. 证据

- `lab-1440x1000.png`：3D 人像房间
- `lab-1440x1000-pointer2.png`：指针移动后的视差
- `lab-mobile.png`：手机 2D 降级
- `lab-reduced.png`：reduced 2D 降级

## 6. 结论

这个原型验证的是「Lusion 的空间感 + After Hours 的私人放映室」，不是把整站变成 Lusion。

通过的部分：

- 3D 人像 + 金框 + 圆环 + 尘埃有明确的“房间/展陈”感；
- 不是满屏粒子，链接和 CTA 仍然是主角；
- 纹理复用现有图片，无新增媒体请求；
- 手机/reduced/static 降级干净；
- 主站 33 项 e2e 未受影响。

仍然不够 Lusion 的部分：

- 只有一个平面人像，没有真正的场景几何/材质/镜头叙事；
- 已有滚动驱动的背景推进（2026-11-03），但仍是固定机位 + 灯箱到舞台，不是完整的相机穿行；
- 没有 Lusion 标志性的“物体/空间交互”；
- 没有做 FPS/低端机实测，只验证了功能降级；
- 没有做 A/B，不能证明对引流有帮助。

## 7. 下一步建议

1. 先在 1440/390 看 10 秒：如果 3D 只是“照片加框”，不值得上主站。
2. 若要更像 Lusion，Lab 内再加 **一个** 场景元素：地面/半透明幕布/可切换的照片层，而不是堆粒子。
3. 补 FPS 采样（桌面 60fps、Retina）和低端机测试。
4. 不要把 Lab 直接替换 `/`；最多把 3D 场景作为一个可选的 `light-gallery` 背景，主站保持转化优先。

**房间纵深版本：[Lusion-Lab-房间纵深.md](Lusion-Lab-房间纵深.md)**  
**五帧走廊 v2：[Lusion-Lab-v2-五帧空间.md](Lusion-Lab-v2-五帧空间.md)**  
**切换动效精修（历史）：[Lusion-Lab-切换动效.md](Lusion-Lab-切换动效.md)**  
**滚动光廊（3D，已归档）：[Lusion-Lab-滚动光廊.md](Lusion-Lab-滚动光廊.md)**  
**Story Lab v0.1：[Story-Lab-实现记录.md](Story-Lab-实现记录.md)**

**下一步计划：[Lusion-Lab-计划.md](Lusion-Lab-计划.md)**
