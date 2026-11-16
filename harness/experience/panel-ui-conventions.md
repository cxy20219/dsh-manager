---
title: 面板 UI 约定与验证方式
summary: 面板结构、子页挂载约定、locale 死键判断与 client-render 测试入口
---
# 面板 UI 约定

浏览器半边是单个 `client.js`（无构建，`window.__ModuleLoader__` 加载），面板结构、样式和全部交互都在里面。

## 结构

- 顶层页签：技能 / MCP / 联网搜索 / 模式 / 局域网，按钮复用 `mgrTab` + `mgrTabActive`。
- 「联网搜索」页是按 `Panel` 里的 `searchSub` 状态切的三段：`结果` / `渠道` / `过滤`。
  - 查询框和每次查询都生效的条件（时间过滤、安全搜索）在子页之上，属于整页。
  - 三个子页**始终挂载**，非活动页外层 `style={{display:'none'}}`：否则切页会丢掉正在填的 API Key 和展开的渠道配置。
  - 子页按钮与主页签同款：`classes('mgrTab', active && 'mgrTabActive')`，容器 `.mgrSubTabs` 只负责布局。
- 搜索动作入口有两个：查询框回车（做了 IME composition 防护）和「搜索」按钮；搜索开始时会 `setSearchSub('results')`。
- 37 个渠道只出现在「渠道」子页，带筛选框和「只看已启用」。
- 面板文案全部走 `t()`：新增 key 必须同时加 zh 和 en；正常 key 在文件里出现 3 次（zh + en + 使用处），只剩 2 次就是死键（`search.channel.<id>.desc` 这类动态拼接的除外）。

## 配色与主题

- 面板样式**只能用 DSH 语义变量**（`--dsw-alias-*`），禁止硬编码颜色字面量。
- DSH 的主题切换是 `body[data-ds-dark-theme]` 这个**属性**（暗色时出现，浅色时不出现），**没有 `data-theme` 属性、也没有 `.dark` class**。
  写 `body[data-theme="light"]` 这类覆盖规则永远不会命中 —— 变量已随主题自动切换。
- 常用映射：底色 `bg-base` / `bg-layer-1` / `bg-layer-2`，文字 `label-primary` / `label-secondary` / `label-tertiary`，
  描边 `border-l1` / `border-l2` / `border-l3`，交互 `interactive-bg-hover` / `interactive-bg-active`，
  阴影 `--dsw-shadow-lv1|lv2|lv3`，圆角 `--dsw-radius-md|lg`。
- 语义色分工：`state-business-primary` 是**主操作色**（主按钮、选中态）；`state-success-primary` 只用于成功态（开关已打开）；
  `state-error-primary` / `state-warn-primary` 同理。主按钮用绿色会和系统面板的主按钮颜色不一致。
- 半透明强调底色用 `color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent)`（内核自身也大量使用 color-mix，浏览器支持无虞）。

## 验证

- 面板行为用 `npm test` 里的 `test/client-render.test.mjs`：`vm` 里加载真实 `client.js`，配一个实例级 React 替身（WeakMap 存 hook、effect 按依赖去重），由测试点击渲染出的按钮。
- 它同时会断言每个组件的 hook kind 序列不变（条件 return 放在 hook 之前会在这里失败）。
- 浏览器半边改完只需刷新 GUI 页面，不用重启宿主；宿主半边（`src/`、`index.js`）改完要热重载 profile 让宿主重新 apply。
- 要在不开 GUI 的情况下核对配色：从 `app.asar` 里取出 `dsh-client-ui-theme/src/styles/design-platform.css`（真实的明暗变量表），
  再把 `client.js` 里的 CSS 数组抽出来放进页面，用 `body[data-ds-dark-theme]` 切换主题即可离线渲染对照。

## 注意

- 渠道面板的 Key 是 write-only：`client.js` 从不回填，`search-status` 也只给 `keyConfigured` / `keySource`。不要为了「显示 Key」去改接口。
- 结果区只渲染纯文本和 http(s) 链接；新增来源字段不要拼 HTML。
