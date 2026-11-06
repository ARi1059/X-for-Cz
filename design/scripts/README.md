# M1 Figma 操作记录

这些 JavaScript 文件记录本轮 Figma Plugin API 操作；它们用于设计交付溯源，不是应用源码。

`figma-state-M1.json` 为实际节点索引；其他脚本依赖执行时的节点与页面。已完成操作不要整套重跑，避免重复创建。复查时优先使用节点索引和只读校验。执行变更须使用 Figma `use_figma` 工具并加载相应技能；`figma-helpers.js` 作为共用前置代码。

`22-validation.js` 中的 `PAGE_ID` 须替换为索引中实际页面 ID。脚本记录包含逐步搭建与后续尺寸修正；最终画面及变量以 `../交付记录-M1.md`、`../tokens-M1.json` 和 `../exports/M1/` 为准。

M1 的回退脚本在 `../../.requirements-history/20261029-M1-design/`；只读预检查与本地副本回退已单独记录。

2026-10-29 文案同步：当前公开文案以 `../公开文案配置-M1.json` 为准。既有 01–22 脚本保留搭建时的历史占位，不用于重新生成当前画面。154 处文字／显隐更新、前后快照及分页重放与回退脚本见 `../../.requirements-history/20261029-M1-copy/`；本轮验证见 `../verification-M1-copy.json`。当前 Figma 与 `../exports/M1/` 已使用更新后的文案。
