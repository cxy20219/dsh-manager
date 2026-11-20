---
title: 面板 UI 约定与验证方式
summary: 面板结构、子页挂载约定、工具目录的单一来源、locale 死键判断与 client-render 测试入口
---
# 面板 UI 约定

浏览器半边是单个 `client.js`（无构建，`window.__ModuleLoader__` 加载），面板结构、样式和全部交互都在里面。

## 结构

- 顶层页签：技能 / MCP / 联网搜索 / 模式 / UI 增强 / 局域网 / 工具，按钮复用 `mgrTab` + `mgrTabActive`。
- 「UI 增强」页的开关对应**本插件自己提供的一项功能**（当前是内置的对话回退），开关状态存在管理器自己的
  设置里（`ui.features.<id>`），没有第二份状态。功能的代码随插件内置（`rewind/`），所以不依赖别的插件是否安装，
  也不会有第二套实现。
- **别照抄上游的 UI 接入**：上游把按钮放在每条用户消息旁，靠接管 `conversation.chat.node` 插槽的**行组件**
  （这行插槽在 **dsh-client-ui-chat** 包里，不在 dsh-client-ui-conversation——查错包会得出「没有这个插槽」
  的错误结论）。当前 DSH（0.2.2-rc.3）确实有这条插槽，但渲染行组件时**不传 sessionId**，
  上游的 `targetOf(props)` 拿不到目标就**静默不画按钮**。
  本版本给用户消息预留的扩展位是 `conversation.chat.user.before`（chain 插槽，session 作用域），
  按钮挂那里。注册形状：`slots.register(options, component)`——**组件是第二个参数**，
  子插槽还要带 `priority`。
- 把上游 bundle 的 factory 体**抠出来内联**时，最后一行 `return module.exports;` 属于外层 wrapper，
  很容易连着切掉；少了它 factory 返回 undefined，报错是 `Cannot read properties of undefined (reading 'apply')`。
  `scripts/check-vendored.mjs` 现在会拒绝没有这一行的内联区域，测试里也有一条守卫。
- **客户端 `apply` 里任何一处抛错 = 整个面板从侧边栏消失**（侧边栏入口和主面板都在 apply 里注册）。
  每处注册都包 try/catch，失败只记 warning；`inject` 只用于**顶层**插槽，子插槽
  （如 `conversation.chat.user.before`）要 `slots.register(options, component)` 直接注册。
- **子插槽要等它出现再注册**：子插槽随父条目注册才存在（本插件先加载、聊天 UI 后加载），
  提前注册会抛错。用 `ctx.slots.inject(name, cb)`：它自己等声明出现再调回调。
  注册成功与组件真的渲染了要**分开上报**，否则面板分不清「插槽没出现」「注册了但没有消息行」「按钮已画出来」。
- **注册前查插槽契约**：`node harness/tool/slot-contract.mjs <插槽名>`。注册形状随种类而变
  （chain 必须带 `select`，keyed 要 `key`，list 要 `id`），少一个选项注册就被拒绝，
  表现和「插槽没声明」一样——都是「东西不出现」。别照着渲染结果猜。
- 客户端模块要用的宿主服务（`sessions` / `commandUi` / `configForms`）必须写进模块 `inject` 列表，
  loader 才会把它们交给 `apply`；不写就拿不到，`ctx.get` 也未必找得到。缺了就用「浏览器上报挂载结果」
  的办法把原因显示出来，别让用户对着「按钮没出现」猜。
- 内置的浏览器 bundle 不能被普通脚本 import，所以它**内联在 `client.js` 的标记之间**
  （`rewind-client:start` / `rewind-client:end`），`scripts/check-vendored.mjs` 把这段区域的哈希也钉住，
  两份拷贝不会走散。宿主半边是 ESM，可以直接 import，但要**去掉 `@deepseek-ai/*` 依赖**，
  否则单元测试在纯 Node 里 import 不了它。
- 「联网搜索」页是按 `Panel` 里的 `searchSub` 状态切的三段：`结果` / `渠道` / `过滤`。
  - 查询框和每次查询都生效的条件（时间过滤、安全搜索）在子页之上，属于整页。
  - 三个子页**始终挂载**，非活动页外层 `style={{display:'none'}}`：否则切页会丢掉正在填的 API Key 和展开的渠道配置。
  - 子页按钮与主页签同款：`classes('mgrTab', active && 'mgrTabActive')`，容器 `.mgrSubTabs` 只负责布局。
- 「技能」页也是四个子标签：已安装 / 项目技能 / 发现技能 / 回收站。四个子页都挂载、非活动页 display:none。
  子标签页里**不要再写一遍同名 h2**——标签本身就是页标题。
- 「已安装」是**一张通栏合并表**：没有来源导航栏、没有右侧详情栏，搜索框铺满整行（它是进列表的入口，
  不是某一列的筛选器），所有来源的技能拼起来统一 `collapseSkills`（同名按 rank 折叠成 `+N`），
  **每行常显来源标签**。开关、详情、备注、删除都用**行自己**的 `sourceKey`，不是某个全局选中项。
- 技能详情是**弹窗**（`Modal` + `mgrModalWide`），不是并排的第二列。文档放进弹窗时：弹窗头已经写了名字，
  所以 `.skxDocInline .skxDocTitle` 隐藏；`skxDocHead` 的 sticky 与负 margin 也要归零，否则会在弹窗体里溢出。
- 整个来源的开关收进右上角「来源」按钮的弹窗（每个来源：名字 + 技能数 + 路径 + 开关）。来源被关掉时，
  它的行的来源标签转 warn 色并带 tooltip——否则一张合并表里看不出某行其实没生效。
- 行上的徽章要看**内核给的哪一个字段**：内核对「已关闭」的技能也返回 `effectiveModelInvocable: false`，
  所以拿它判「仅手动」会把 13 个关着的技能全标成仅手动（实测）。要判「模型不能自动调用」得看
  **frontmatter 声明的** `modelInvocable === false`，并且技能本身是开着的。
- 工具栏里除搜索框外不要放 `mgrSpacer`：它和 `flex:1` 的输入框抢剩余空间，搜索框就铺不满了。
- 页面底部不再有常驻页脚：重扫按钮和「异常 N」「来源 N」一起放在搜索框右侧的工具条里。
  面板头部的「重新扫描」只刷 overview，技能页用的是自己那份 `state` 扫描，所以 `Panel` 会给
  `SkillsWorkspace` 传一个 `rescan` 计数，头部按钮把它 +1 来重新触发技能页的 `load()`——两个按钮必须是同一个行为。
- 「异常 N」和「来源 N」是同一种入口（`skxBtnSmall` + `skxTabCount`），不是一个复选框：宿主拒绝加载的
  技能不进主列表，只在面板里给**名字 / 来源 / 原因 / 路径**。原因由内核的 `diagnostics` 翻译而来，
  用**静态映射表** `DIAGNOSTIC_HINT`（code → locale key），未知 code 落到 `skx.diag.other`；
  不要 `'skx.diag.' + code` 拼 key，否则拼不上的 code 会显示成裸 key。出错时按钮转 `skxBtnWarn`。
- 目录不存在的候选来源在 `load()` 里就滤掉，不列「未安装」也不计入页脚——用户明确说过不要这堆噪音。
- 「工具」页按板块分成子标签：技能 / MCP / 联网搜索 / 模式 / 局域网，每个子标签列出该板块交给 Agent 的
  工具、描述与参数。板块 id → locale key 用静态映射表（`TOOL_GROUP_LABEL` / `_HINT` / `_EMPTY`），
  不要靠 `'tools.group.' + id` 拼接——动态 key 会让死键扫描误报。
- 搜索动作入口有两个：查询框回车（做了 IME composition 防护）和「搜索」按钮；搜索开始时会 `setSearchSub('results')`。
- 37 个渠道只出现在「渠道」子页，带筛选框和「只看已启用」。
- **批量开关不新增接口**：筛选栏的「全部可用渠道」是个**二态开关**（不是按钮组），浏览器半边循环调既有的
  `search-save`（一次一个，失败的只计数不中断），口径与行上的开关完全同一条路径。方向不对称：
  **开 → 只开可用渠道**（`free || keyConfigured`，缺 Key 的付费渠道保持原状）；**关 → 关掉全部渠道**。
  显示状态是「所有可用渠道都已开启」的如实映射，不做三态；批量进行中开关禁用，旁边显示 `search.enabling`。
- 「渠道」页的列表**按启用状态分组**（已启用在前，组内保持存储顺序），因此 `↑`/`↓` 不能只靠
  `status.order` 的索引：行要把**绘制顺序**（`moveOrder`）一起交给 `moveSearchChannel`，
  否则跨过分界线的那一行点了箭头画面不动。
- 面板文案全部走 `t()`：新增 key 必须同时加 zh 和 en；正常 key 在文件里出现 3 次（zh + en + 使用处），只剩 2 次就是死键（`search.channel.<id>.desc` 这类动态拼接的除外）。

## 工具目录的单一来源

「工具」页不维护第二份清单，而是让每个板块报自己注册的东西：

- 搜索桥在 `registerAgentSearch` 里**先构造一次**工具定义，再注册同一批对象，面板报的 description / parameters
  就是模型收到的那一份，不会走偏。
- MCP 的工具记录里带上服务自己的 `inputSchema`（`src/mcp.js` 的 `registered.push`）。
- 技能内核注册的 `create_skill` 由 `src/skills-kernel.js` 的 `wrapOptionalTools` 顺手记下来，内核本身不知道面板的存在。
- 模式只报**工具行**（`tool-*` 命名的行或显式声明 `toolName` 的行）：工具的描述与参数住在别的插件里，不复制。
- 汇总在 `src/tool-catalog.js`，接口是 `POST /api/manager/tools-list`；页签计数来自 `overview` 的 `tools.total`。

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

## 版式刻度（Designer 定稿）

- **字号六档一职**，不要再出现第七档：18 页面标题 / 14 区块标题 / 13 行标题与正文 /
  12.5 控件（按钮、输入框、下拉、字段标签）/ 11.5 说明与计数 / 10.5 徽章。图标字形（`.mgrIconBtn`、
  `.mgrChevron`）按 glyph 尺寸走，不算文字档。
- **纵向间距只用 4/8/12/16/24**：行内间距 4、同组 8、组间 12、区块之间 24。卡片圆角 12、内边距 12×14，
  控件高度统一 30px（搜索框也 30，别再单开 36 的hero尺寸）。
- **两级标签**：主导航单行横滚（`nowrap` + `overflow-x:auto` + 隐藏滚动条），30 高、13px；
  子标签降级成文字 tab（26 高、12px、无边框无底色、active 用 `state-business-primary` 2px 底线）。
  子标签虽然在 `.mgrSubTabs` 下沿用 `mgrTab`/`mgrTabActive` 类，但视觉分叉全靠 `.mgrSubTabs` 前缀规则，
  hover 必须写 `:not(.mgrTabActive)`——否则鼠标停在当前子页上时，hover 会盖掉 active 的底线。
- **渠道卡**：`.mgrSearchChannelHead` 允许换行，文字列 `flex:1 1 100%` 吃满整卡宽；名称行
  （`.mgrSearchChannelNameRow`）一行里放「名称 + 徽章 + 开关」，名称 `flex:1 1 0` 出省略号、徽章和开关
  `flex:none`；动作组落到卡底一行 `flex:1 1 100%;justify-content:flex-end;margin-top:8px`。
  描述 clamp 2 行且 `min-height:35.6px`（=2×1.55×11.5），前三张卡才会等高（实测 123.6px，三者一致）。
  徽章**不要**再单独占一行：多一行 21.8px，37 个渠道就是列表长 800px。动作组占固定宽度会把文字列
  挤到逐字折行（320 宽时实测只剩 21.5px，卡高 476px）。
- **渠道测试卡**：动作按钮（全部测试 / 重置冷却）与标题同一行（`.mgrSearchCardHead` + `.mgrSpacer`），
  说明文字另起一行（`.mgrSearchCardHint`），整卡约 96px。三行式布局会把首卡 y 顶到 507.9（上限 480）。
- **右缘渐隐**：主导航单行横滚时用 16px `mask-image` 渐隐 + 末项 `margin-right:12px` 提示还能滚；
  没有渐隐时 420 宽下「工具 4」整块不可见，用户不会知道右边还有东西。
- **对比度**：说明与计数这一层（`.mgrHint`、`.mgrCount`、`.mgrSearchChannelDesc`、`.mgrSearchCardHint`、
  `.mgrVersion`、`.mgrSubtitle`、`.mgrTabCount`）统一 `label-secondary`（亮 5.80 / 暗 10.42–12.11）；
  `label-tertiary` 在亮色只有 3.71:1，别再用它写正文。
- **徽章用轨道 + 字色，不用纯色字**：`.mgrBadgeOk` = `state-success-tertiary` 底、`.mgrBadgeWarn` =
  `state-warn-tertiary` 底，字都是 `label-primary`（亮 17.33 / 17.48，暗 11.46 / 14.79）。两个徽章同构，
  **不要再写按主题分叉的覆盖**——`state-warn-label` 那类做法在暗色反而更暗（实测 4.33）。
- 亮色残留的地板是 `state-business-primary` 当文字用：主按钮字（白 on 蓝）、`.mgrLinkBtn`、激活子标签，
  实测 4.23:1，低于 4.5。这是主题 token 的取舍，插件侧不要私自改色。
- **名称行三徽章边缘态**：名称 `min-width:64px`（短词完整可见）、徽章组 `flex:0 1 auto;min-width:0`
  允许换行。320 宽 + FREE/无需 Key/冷却中 三徽章时，名称 64px 不省略、徽章折两行、无横向溢出；
  不给 min-width 时名字被压到 17px、只剩省略号。
- **开关关态**（`.mgrSwitch`，MCP/渠道/批量/局域网共 5 处共用）：轨道 `state-idle-primary`、
  滑块 `bg-base`、加 `--dsw-elevation-soft` + `0 0 0 1px border-l2` 的圆环。这些只写在
  `:not(.mgrSwitchOn)` 上，不碰 `.mgrSwitchOn`，开态才保证零变化（改前改后逐字 diff 匹配规则即可自证）。
- `skx*`（技能工作台）是另一套自带的视觉系统（13/14/16/17 档、`skxSwitch` 绿色 pill），不在 mgr 刻度内；
  要统一必须先问 Designer，别顺手改。

## 验证

- 面板行为用 `npm test` 里的 `test/client-render.test.mjs`：`vm` 里加载真实 `client.js`，配一个实例级 React 替身（WeakMap 存 hook、effect 按依赖去重），由测试点击渲染出的按钮。
- 它同时会断言每个组件的 hook kind 序列不变（条件 return 放在 hook 之前会在这里失败）。
- 浏览器半边改完只需刷新 GUI 页面，不用重启宿主；宿主半边（`src/`、`index.js`）改完要热重载 profile 让宿主重新 apply。
- **桌面版 GUI 打不开**：web 服务只认应用自己打印的那条带启动令牌的 URL，别的浏览器（连 `ego-browser`）
  只会看到 “dsh web authentication required”，`/api/manager/*` 也一律 401。令牌是进程内随机的，不落盘，找不到。
  所以视觉核对走 `harness/tool/panel-preview.mjs`（说明见 `harness/tool/panel-preview.md`）：它用真实的 `client.js`、
  真实的 Host 主题样式和假的 `/api/manager` 回答，在浏览器里渲染同一个面板，明暗两套主题都能截。
  **它只能看，不能代替 `npm test`。**

```bash
# 用法、坑和边界见 harness/tool/panel-preview.md
DSH_NODE_EXECUTABLE="/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
  node harness/tool/panel-preview.mjs --react-dir /tmp/dsh-preview-cache/node_modules --tab tools
```

- 预览的 `search-status` 夹具从 `src/search-providers.js` 的 `SEARCH_CHANNELS` **派生**，只有开关和 Key 是编的；
  早先手写的四行夹具用的是过时字段（`hasKey`、`duckduckgo`），面板只好按「没有 Key」画。
- 预览的 `--tab` 只点一次，且点的是顶部页签；搜索页的子页（结果/渠道/设置）是 `role="tab"` 的按钮，
  要截图渠道页得自己再点一次——用 `get_by_role("tab", name="渠道")`，按 button 角色找不到。

- 要在不开 GUI 的情况下核对配色：从 `app.asar` 里取出 `dsh-client-ui-theme/src/styles/` 下的样式（用
  `ELECTRON_RUN_AS_NODE=1` + 运行中的 Electron 运行时，`copyFileSync` 可以、`cpSync` 不行），再把
  `client.js` 里的 CSS 数组抽出来放进页面，用 `body[data-ds-dark-theme]` 切换主题即可离线渲染对照。
  圆角和字体在 `base.css` 里，不在 `design-platform.css`——只取后者会得到直角和默认字体。

## 注意

- 渠道面板的 Key 是 write-only：`client.js` 从不回填，`search-status` 也只给 `keyConfigured` / `keySource`。不要为了「显示 Key」去改接口。
- 结果区只渲染纯文本和 http(s) 链接；新增来源字段不要拼 HTML。

## 客户端专属功能（有开关、没有宿主半边）

「输入框历史」是这类功能的样板：行为全在 `client.js`，宿主只提供一个开关对象
（`src/composer-history.js` 的 `status` / `setEnabled`），把它和 rewind 一起放进
`createUiEnhancements({ features: [rewind, history] })` 即可出现在 UI 增强页。

- 浏览器半边启动时读 `ui-status` 找到自己的 id；面板切换后派发 `dsh-manager:ui-changed`，
  浏览器半边监听它就重读，不需要刷新页面（rewind 仍然靠 reload，因为它的界面在会话 bundle 里）。
- 上报状态用 `ui-client-status` 带 `feature: '<id>'`，服务端按功能存到 `client.features[id]`，
  面板在对应功能行下面显示「客户端：已挂载（reason）」；整页那两行只在只有一个功能时出现。
- 按方向键接管时先判断「输入框为空 / 光标在边界 / 仍是我们刚填进去的那条」，否则放行给原生行为。
