# Story Lab 视觉规范

日期：2026-11-06  
适用：公开页（年龄门 + Story Lab）。后台沿用 `globals.css` 的 `--m1-*` 主题，不受本规范影响。

## 1. 色彩

来源：`web/src/app/public-tokens.css`。

| Token | 值 | 用途 |
|---|---|---|
| `--public-ink` | `#100b09` | 页面底色 |
| `--public-raised` / `--public-raised-2` | `#1c140f` / `#241a13` | 弹窗、浮层 |
| `--public-text` | `#f3e9db` | 正文 |
| `--public-text-strong` | `#f6e7d2` | 强调文字 |
| `--public-muted` | `#c9b9a5` | 次要文字 |
| `--public-disabled` | `#8f8173` | 停用、编号 |
| `--public-gold-line` / `--public-gold-text` / `--public-gold-bright` | `#d8b48a` / `#e6c79b` / `#f4dcb8` | 香槟金层级：细线 / 标题与强调 / 高光 |
| `--public-gold-fill` | `#cba774` | 主按钮渐变基色 |
| `--public-line` / `--public-line-strong` | 金色 14% / 36% | 分隔线 |
| `--public-error` | `#d8a08a` | 错误边框与文案 |

规则：金色只用于强调与分隔，不铺大面积；正文始终用暖白，避免纯白。

## 2. 字体

| 层级 | 字体 | 字号 / 字距 |
|---|---|---|
| 主理人名称 `h1` | Songti SC / Noto Serif SC | 48px（手机 26–33px），字距 2px，金色渐变文字 |
| 章节标题 `h2` | 同上 | 28–34px，字距 2px |
| 小标题 eyebrow | Helvetica Neue / PingFang | 8px，字距 2.2px，金色 |
| 正文 | Helvetica Neue / PingFang SC | 11–13px，行高 1.6–1.9 |
| 数字 / 编号 | Georgia / Times New Roman 斜体 | 9–12px |

英文只承担氛围（kicker、wordmark、SCROLL、编号），中文承担信息。

## 3. 布局

- 桌面（≥960px）：左右分栏。左侧固定面板宽 `min(300px, 100%)`，距视口左侧 24–112px（`clamp(24px, 6vw, 112px)`）；右侧人像整高、靠右、等比裁切，左缘用渐变融入墨黑底。
- 页面顶栏：左 wordmark（THE GODFATHER / PRIVATE EDITION），右章节标签（LUSION LAB / STORY 01）。
- 章节导航：右侧竖排 01–05，当前项金色。
- 底部：底部中央 SCROLL 圆环提示；页脚左为年龄与站点说明，右为静态浏览开关。
- 手机（<960px）：取消固定层，改为五段纵向堆叠；每段「全高人像 + 内容区」；顶栏精简为 wordmark + STORY 01。

断点：960（桌面/移动切换）、849（紧凑左栏）、549（小屏字号与间距）、360（最小宽度）。所有尺寸保证 44px 触控高度与无横向溢出。

## 4. 组件

| 组件 | 规格 |
|---|---|
| 主入口 `.sh-platform[data-variant=primary]` | 60px 高，1px 金色边框，深棕渐变，右侧圆形箭头；hover 有 420ms 扫光 |
| 次级入口 | 48px 高，上边框细线；hover 底部 240ms 下划线；停用为 30% 灰 |
| 入口错误态 | 原位覆盖反馈层，不改变行高；重试按钮 44px |
| 弹窗 `.sh-dialog` | 400px 宽，`--public-raised` 底，原生 `<dialog>` + 背景模糊 |
| 年龄门 | 居中 400px 栏，18+ 斜体衬线大号数字，双光翼 + 椭圆光环背景；入场 16px 上浮、620ms |

## 5. 动效

- 时长/epace：hover 160ms、按压 70ms、回弹 220ms、扫光 420ms；统一 `--public-ease-out` 与 `--public-ease-press`。
- 背景交接：滚动进度直接写 `opacity`，不做补间；相邻层权重线性插值。
- 入场：年龄门元素错峰 40–140ms 上浮；Story Lab 幕布由 `intro-curtain.tsx` 控制，仅首次确认后播放。
- `prefers-reduced-motion: reduce`：关闭交叉淡入、光标、幕布与过渡；页面提供「静态浏览」开关，二者状态一致。

## 6. 资源

- 背景：`web/public/lusion/01–05.jpg`，五张人像，分别对应五个章节；桌面整屏、手机每段顶部。
- 头像与分享图：受控媒体，经 `/media/` 或 `/share/` 鉴权后加载。
- 禁止：在公开页直接引用原片、未去 EXIF 的图片或后台媒体路径。

## 教父 IP 品牌应用（2026-11-10）

字标为 THE GODFATHER，缩写 GF，中文显示名为教父。首页品牌头像采用教父黑金徽章；多位人物按各自风格设计，五张背景作为可替换的风格场景素材，均不绑定单一人物人设。七个频道与机器人头像见 `brand-avatars/README.md`。
