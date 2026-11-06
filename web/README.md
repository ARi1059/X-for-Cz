# 顾清棠 Web 工程

M3 已实现公开页、管理员后台和 23 个 HTTP 操作，复用 M2 的 SQLite 数据层及 M1 内容配置。当前公开视觉为「After Hours · 墨黑香槟私人秀场」，根据 2026-10-29 用户请求在现有 Linktree 页面加入舞台光影与交互动效。M1 静态稿、原 M3 验证及本机首页草稿预览验证保留为历史记录；本次视觉增量单独验证。完整需求验收与部署分别按 M4、M5 推进。

## 当前视觉与动效

2026-10-30 精修：有效按钮增加短按压、回弹和键盘焦点；默认首页照片条按真实照片中心吸附，快速连点、触摸接管及缩放保持选片一致。手机保留静态背景光影，人像导航姓名改为 2.2 秒单次扫光；离屏及后台暂停。当前人像导航预览已取消旧光廊，沿用 `/?experience=light-gallery` 地址。最新变更与验证见 `../docs/M3-交互动效精修.md`，证据与回退位于 `../.requirements-history/20261030-motion-polish/`。

主页保留身份区、五个纵向入口、照片展、辅助信息与页脚的顺序。新增香槟金侧光与椭圆光环、分段入场、编号金属面板、放大的原五图、照片浮现及桌面轻微倾斜；年龄确认页采用邀请函式布局。顶栏可暂停／启用动效，系统“减少动态效果”偏好会强制静态模式。后台草稿预览复用同一视觉并将效果限制在对话框内。

此改版只更新呈现，不修改草稿 revision、发布指针或照片；正常访问仍记录汇总事件，确认前仍不请求受控媒体，空目标入口保持停用。设计说明见 `../design/M3-After-Hours动效设计.md`，当前实际验证结果见 `../docs/M3-After-Hours验证.json`。本次快照、差异、证据与回退位于 `../.requirements-history/20261029-after-hours/`。

## 本地运行

使用 Node.js 24.12 或更新版本，依赖版本由 `package-lock.json` 锁定。在工程目录执行：

```sh
npm ci
npm run setup
npm run media:import
npm run dev
```

公开页为 `http://localhost:3000/`，管理页为 `http://localhost:3000/admin`。`setup` 首次生成 `.env.local` 中两份独立随机密钥、初始化数据库和管理员，并将随机账号及密码保存到 `var/local-admin.json`；两份文件权限均设为 `0600`，终端只显示文件位置及初始化状态。请在本机读取凭据登录，凭据文件不纳入交付或版本控制。重复执行 `setup` 保留已有内容、密钥和管理员。

`media:import` 按既有清单导入一张头像与五张照片，检测、解码并重编码为受控衍生图，只更新草稿；今后首次成功导入会启用草稿照片条。已有媒体或草稿图片时保留现有编辑和开关，不重新导入。本机已保存草稿为修订3，包含一张头像和五张照片，照片条已启用；现已按用户要求开启本机根首页草稿预览，确认年龄后在五入口下方展示照片条。正式已发布快照仍为初始空配置，五入口停用、零媒体。真实链接、联系邮箱与中性离开目标补齐后，在后台保存、预览并检查发布。

## 本机首页草稿预览

当前 `http://localhost:3000/` 已显式开启 `LOCAL_DRAFT_PREVIEW=1`，年龄确认后读取最近保存的草稿，后台保存后刷新首页即可查看。页面、中性元数据、图片和外跳解析使用同一草稿版本 `local-draft-{revision}`；未保存输入仍只在编辑器内。照片条保持位于完整五入口之后，确认年龄前仍不加载头像、简介、入口或受控照片。

默认示例为：

```dotenv
LOCAL_DRAFT_PREVIEW=0
```

该开关只有在 `NODE_ENV=development`、loopback HTTP origin且使用非Secure开发Cookie时生效；生产、远程访问配置或HTTPS环境忽略它，继续读取已发布版本。将 `.env.local` 中此项设回 `0` 并重启开发服务即可恢复已发布内容。该模式不切换正式发布指针；上线前仍需补齐真实目标、联系邮箱和中性离开地址，再执行正常发布校验。

上一轮本机首页草稿预览改动与验证独立记录在 `../docs/M3-本地首页照片条验证.json`，源码差异及回退位于 `../.requirements-history/20261029-local-home-gallery/`。原 M3 验证记录和源码包保留为该阶段历史交付。

上一轮草稿预览增量 `npm run check` 通过38／38项，独立目录构建退出0，隔离浏览器测试通过7／7项；隔离服务显式设置 `LOCAL_DRAFT_PREVIEW=0`，继续验证正常发布行为。该轮真实本机首页另用无管理员会话浏览器核对：`local-draft-3`，五张照片及头像全部完成图片解码，确认前受控请求为0，390px无横向溢出，刷新后仍显示五图。这些数量对应草稿预览增量，不替代本次动效改版验证。

## 管理员凭据重置

忘记本机管理员密码时，在工程目录执行：

```sh
npm run setup -- --reset-admin
```

该操作保留用户名和站点内容，生成新密码写入 `var/local-admin.json`，增加认证版本并撤销全部旧管理会话。普通 `setup` 不重置账号。管理员密码在数据库内使用带独立盐的 scrypt 摘要，文件中的初始凭据只供本机交接保管；后台改密后以新密码为准。

## 页面与数据流程

- 公开年龄门只请求中性 metadata、成年提示和 CSRF 挑战；确认前不返回简介、入口或受控图片。
- 成年确认固定记忆 30 天，访问与重复确认不续期。开发环境的 HTTP loopback 使用 `age_dev`／`admin_dev` Cookie；HTTPS 使用独立的 `__Host-age`／`__Host-admin` Cookie。Cookie 受限时只在当前标签页内存保留访问凭据，刷新后重新确认。
- 主页保持小头像、名称／简介、连续五入口、照片条、辅助信息／页脚的顺序。隐藏入口移出布局，空目标或停用入口显示未开放状态。有效外链在桌面新标签页打开，手机使用当前页跳转；内存确认模式同样经授权解析目标后导航。
- 管理员可编辑文案、五入口、照片、分享信息、状态提示，管理图片、预览草稿、发布和查询 UTC 汇总统计。成年凭据不授予管理权限。
- 草稿按 revision 比较保存；发布在同一事务内校验配置与媒体、写入不可变版本、切换公开指针和记录审计。预览与保存不改变正式发布版本，失败保留上一成功发布；显式开启的本机首页草稿预览显示最近保存草稿。
- 媒体保存在私有目录，正常公开读取要求成年凭据及当前发布版本，本机草稿模式则核对当前已保存草稿版本；管理员预览独立鉴权。分享图必须独立标记为中性公开素材，不从头像或照片自动生成。

## 工程入口

| 文件／目录 | 用途 |
|---|---|
| `src/app/`、`src/components/` | 公开页、管理页、响应式样式与交互 |
| `src/components/noir-motion.tsx`、`noir-motion.css` | 公开舞台、动效生命周期、暂停及系统静态偏好 |
| `src/app/noir-public.css` | After Hours 公开页视觉及响应式覆盖，不改变后台共享控件 |
| `src/server/http.ts` | 23 个 HTTP 操作、权限、CSRF、限流和错误响应 |
| `src/server/auth.ts` | 年龄签名、管理员 scrypt 密码与固定期限会话 |
| `src/server/media.ts` | JPEG／PNG／WebP 真实检测、去 EXIF、私有衍生图与引用保护 |
| `src/server/runtime.ts` | 显式环境校验与已初始化数据库连接 |
| `src/contracts/site-config.ts`、`contracts/` | 配置字段、发布校验、公开投影与 OpenAPI |
| `src/storage/`、`migrations/` | SQLite WAL、校验和迁移、CAS 草稿及事务发布 |
| `scripts/setup.ts`、`scripts/import-design-media.ts` | 本机初始化／重置管理员与受控素材导入 |
| `test/`、`e2e/` | 配置、接口、存储、认证、媒体与真实浏览器验证 |
| `../docs/M3-开发交付.md` | M3 范围、当前配置状态、验证与后续阶段 |

设计文案变化后运行 `npm run contracts:generate`，再执行 `npm run check`。生成操作只改结构和种子，服务运行后以数据库内容为准，不在重启时覆盖管理员编辑。

## 运行配置与持久化

环境提供 `APP_ORIGIN`、`DATABASE_PATH`、`MEDIA_ROOT`、`AGE_SIGNING_SECRET` 和 `SESSION_HASH_SECRET`。`APP_ORIGIN` 必须是完整精确 origin；生产运行要求 HTTPS，通常由反向代理终止 TLS。同源写操作严格匹配该 origin。两份密钥各不少于32字符且互不相同。数据库必须先初始化，服务启动不自动创建或覆盖内容。

成年状态固定30天，管理员会话固定8小时。当前上传限制为单张10 MiB、2400万像素、最长边6000px、媒体总量500 MiB；这些由实现常量统一约束，不应仅修改同名环境项来调整。SQLite 与媒体目录均放持久卷；本版适用于单 Node 实例。

单独操作数据库可用 `npm run db -- migrate --db PATH`、`seed` 或 `status`。M2 CLI 要求显式 `--db` 或 `DATABASE_PATH`，不自动加载 `.env.local`，`status` 以只读方式打开。`seed` 一次性创建 bootstrap，重复执行保留已有编辑；正常 HTTP 发布继续执行上线校验。

## 验证与回退

在工程目录执行：

```sh
npm run check
NEXT_DIST_DIR=.next-build npm run build
npm run test:e2e
```

浏览器验证使用独立的 `localhost:3103` 服务、临时数据库／媒体和 `NEXT_DIST_DIR` 指定的独立构建目录，测试凭据只用于临时环境，不读取本机 `var/local-admin.json`，不修改开发数据库与素材。原 M3 阶段命令、输出、退出状态及验证结论见 `../docs/M3-验证记录.json`；浏览器截图保存在 `var/screenshots/`。原M3阶段 `npm run check` 的33项测试全部通过，隔离浏览器测试7项全部通过，`NEXT_DIST_DIR=.next-build npm run build` 构建通过。构建文件追踪排除本机 `var/`、`.env*` 与浏览器测试构建目录，运行数据和密钥单独提供。

After Hours 视觉增量的实际命令与结果另见 `../docs/M3-After-Hours验证.json`。新增浏览器回归检查入场中暂停后内容可见、重新启用、系统减少动效与重新确认年龄后的状态；原有年龄门、媒体、外链与后台流程继续回归。本次交付入口为 `../.requirements-history/20261029-after-hours/source.zip`、`change.patch`、`verification.json` 与 `rollback.py`，回退前先检查后续编辑冲突。

原 M3 源码包为 `../.requirements-history/20261029-M3-180840/M3-source.zip`，差异为同目录 `M3.patch`，可运行回退入口为 `rollback.py`；开始前的源码与文档快照保存在同目录。更早的 M2 基线备份保留在 `../.requirements-history/20261029-M3/originals/`。源码回退不覆盖数据库、媒体或凭据。生产迁移前另做 SQLite 一致备份及媒体哈希清单，运行中使用 SQLite online backup，或停止写入后完整复制，避免遗漏 WAL。完整22项验收、备份恢复演练与真实部署由 M4／M5 继续落实。

## 本轮修复

保存请求返回后保留保存途中继续输入的新内容；主要入口隐藏／停用增加明确确认；照片条索引与实际滑动同步；Unicode组合字素密码的设置、登录与当前密码校验采用一致边界；上传错误码及响应状态与OpenAPI同步；发布校验提供中文字段提示；构建追踪排除本机数据及密钥；桌面外链新标签页与手机当前页行为对齐需求。相关HTTP与浏览器回归结果见验证记录。
