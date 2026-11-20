# Harness 项目资源总览

## 项目总览

记录项目长期稳定的总览、关键约束、常用入口和注意事项。

## 资源分层

- workflow：稳定可执行流程。
- experience：可复用判断经验。
- tool：可重复执行的东西——脚本、可执行文件、CLI 都算。
- resources：工具要读的东西——外部规范、长背景、模板、示例输入、静态资源。

## 偏好（全局 AGENTS.md）

- 管理器接管 DSH 的全局注入点 `$DSH_HOME/AGENTS.md`：权威文件 `<dataDir>/system/AGENTS.md`，
  入口软链到它；建不了软链就两边同步写。实现见 `src/preferences.js`（移植自 dsh-ziyan）。
- **一个 DSH home 只能有一个 owner**：模块每次读都会「采纳入口的外部改动 → 对齐入口」，
  两个插件同时开会来回接管。自衍中枢的偏好移除后才由管理器独占。

## 面板

- 浏览器半边是单个 `client.js`（无构建），面板结构、样式和全部交互都在里面。
- 面板的视觉核对走 `tool/panel-preview.mjs`（不开 GUI 的离线预览），行为核对走 `npm test`。
- 内置的第三方代码放在 `skills/`（技能内核）和 `rewind/`（对话回退），改动要过 `npm run check:vendored`。
- 要往别的包的插槽里塞东西，先查插槽契约：`tool/slot-contract.mjs`（种类、必填选项、官方示例），
  别照着渲染结果猜——注册形状随种类而变，少一个选项就静默不生效。
- 详细约定见 `experience/panel-ui-conventions.md`。
