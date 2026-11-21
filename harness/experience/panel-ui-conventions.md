---
title: 面板 UI 约定与验证方式
summary: 面板结构、设置页入口、子页挂载约定、工具目录的单一来源、locale 死键判断与 client-render 测试入口
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
- **设置页里那一行是入口，不是页面**：注册 `settings.section`（id `manager`、order **50**，排在插件市场的 40 之后），
  `label` 复用 `t('panel')`，图标走 `settings.section.icon`（同一个 id，复用侧栏那三条滑块；没有这个位的老宿主
  自动落默认齿轮，所以不依赖特殊图标）。组件收到宿主的 `close` 后先 `ctx.layout.selectPanel('manager')` 再 `close()`：
  面板是全窗工作台（自带标题、7 个主标签、自己的滚动体），塞进约 556px 的设置内容列等于再养一套布局、
  两层滚动加一行重复标题。**失败路径必须留着**：`selectPanel` 抛错时不关对话框、原地显示 `settings.failed`，
  入口变成死点比不放这个入口更糟（`test/client-render.test.mjs` 两个方向都钉住了）。
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
  子标签降级成文字 tab（26 高、12px、无边框无底色、active 用 `state-business-primary` 2px 底线，
  字色 `label-primary`——蓝字当文字只有 4.23，底线已经足够标记选中）。
  子标签虽然在 `.mgrSubTabs` 下沿用 `mgrTab`/`mgrTabActive` 类，但视觉分叉全靠 `.mgrSubTabs` 前缀规则，
  hover 必须写 `:not(.mgrTabActive)`——否则鼠标停在当前子页上时，hover 会盖掉 active 的底线。
- **渠道卡**：`.mgrSearchChannelHead` 允许换行，文字列 `flex:1 1 100%` 吃满整卡宽；名称行
  （`.mgrSearchChannelNameRow`）一行里放「名称 + 徽章 + 开关」，名称 `flex:1 1 auto;min-width:64px`
  出省略号、徽章组 `flex:0 1 auto` 可换行、开关 `flex:none`；动作组落到卡底一行
  `flex:1 1 100%;justify-content:flex-end;margin-top:8px`。
  描述 clamp 2 行且 `min-height:35.6px`（=2×1.55×11.5），前三张卡才会等高（实测 123.6px，三者一致）。
  徽章**不要**再单独占一行：多一行 21.8px，37 个渠道就是列表长 800px。动作组占固定宽度会把文字列
  挤到逐字折行（320 宽时实测只剩 21.5px，卡高 476px）。
- **渠道测试不装盒**：动作（全部测试 / 重置冷却）是子标签行右端的 `.mgrTextAction`（12.5px secondary、
  下划线；hover/active 才提到 `label-primary`），测试结果 chips 直接落在渠道列表上方，不再套
  `.mgrSearchCard`。动作下一行必须保留可见的 11.5px secondary 成本提示 `.mgrSubHint`
  （「会实际请求，消耗配额与冷却」）——它会真发请求，说明不能只藏在 `title` 里。
  纵向间距随之收紧：子标签行下 4、提示行下 8、`.mgrSearchChannels` 上 12 / 内上 8（全在 4/8/12 刻度里）。
- **量版式必须先固定内容宽**：同一个 420 视口有两套内容宽，差 11px，不能混用。
  - `353` = QA2 验收口径：preview 的 `.mgrBody` 渲染 11px 经典滚动条（`420 − 28×2 − 11`）。
    `.mgrSearchMeta` 会折行 30 → 57，整页比无滚动条时低 27px；输入框实测 262.5。
  - `364` = 无滚动条的本地 preview（`420 − 28×2`）：meta 单行，输入框 273.5。
  - **以 353 那套为准**（首卡 y 的上限 400 就是在它上面定的）；两套都要报，并把 27px 说明白，
    别当成改版差异。宽度类指标一律报比例（分母写清是卡宽还是内容宽），不报绝对像素。
    （唯一的例外是宽屏封顶值：它本身就是绝对数，见下表。）
  - **验收视口三档，缺一不可**（2026-11 起：宽屏不再漏检。此前只跑 420/320，1900 全屏一打开就是没测过的形态）：

    | 视口 | 内容宽（无滚动条） | 内容宽（11px 经典滚动条） | 列左缘 x |
    |---|---|---|---|
    | 420×740 | 364 | 353 | 28 |
    | 1200×900 | 1120 | 1109 | 40 |
    | 1900×1612 | 1120 | 1109 | 390 |

    判据：**1200 与 1900 的内容宽必须相等**（1120±1）。不相等就是没封顶，直接判不过。
    头部标题的 x、首个主标签的 x、首张卡的 x 三者在同一档里必须相同（一条轴）。
  - 基线：DPR=1、联网搜索→渠道、轮询取稳定帧，三档 × 亮暗各一遍；宽屏还要看技能页（行的名称 ↔ 开关
    距离、`.skxSplit` 两列），因为它是唯一有双列的页。
  - **取色前先把鼠标移出、等过渡结束再取稳定帧**：hover 用 `interactive-bg-hover`（α .06/.08），
    比选中态 `interactive-bg-active`（α .10/.14）浅；停在元素上取色会把数算高（实测激活页签计数
    16.97 → 静息 15.71）。这类错比算错公式更隐蔽，因为数看起来「更好看」，没人会怀疑。
- **右缘渐隐**：主导航单行横滚时用 16px `mask-image` 渐隐 + 末项 `margin-right:12px` 提示还能滚；
  没有渐隐时 420 宽下「工具 4」整块不可见，用户不会知道右边还有东西。
- **对比度**：说明与计数这一层（`.mgrHint`、`.mgrCount`、`.mgrSearchChannelDesc`、`.mgrSubHint`、
  `.mgrVersion`、`.mgrSubtitle`、`.mgrTabCount`）统一 `label-secondary`（亮 5.80 / 暗 10.42–12.11）；
  `label-tertiary` 在亮色只有 3.71:1，别再用它写正文。
- **对比度必须先把半透明底合成再算**：`color-mix()` / `rgba()` 的底不能跳过。量法是从 `.mgrRoot` 向下
  逐层合成 `out = fg·a + bg·(1−a)`，再把文字色按自身 alpha 压上去；Chrome 的 computed 里
  `color(srgb r g b / a)` 三个分量是 0–1，先 ×255 再套 WCAG 公式（当 0–255 直接算会得到假数）。
  跳过半透明底会把结果算高：技能页统计 pill 实际是暗 5.22 / 亮 3.57，不是 6.75 / 4.23。
- **技能页统计 pill 与提示**：`.skxStatLabel` / `.skxStatOn` / `.skxStatOf` 一律 `--skx-fg`（主色），
  accent 只留在 `--skx-accent-soft` 底色和 38% 描边上（合成后亮 15.92 / 暗 11.63）；`.skxNote` 同理。
  `.skxChipOn .skxSourceCount{color:inherit}`——计数必须跟 chip 前景色走，muted 色压在 accent 实底上
  只有 1.37。
- **选中底上的次级文字要跟着主色走**：激活页签本身有 10% 选中底色，`.mgrTabCount` 用 secondary 压上去
  只有 5.21（未选中是 5.80），所以写 `.mgrTabActive .mgrTabCount{color:inherit}`（→ 16.97 / 14.13）。
  同理，任何放在 `interactive-bg-active` / accent-soft 这类有色底上的计数，都按主色算，不要另开一档灰。
- **徽章一个色相一个含义**：FREE（价格）用 `.mgrBadgeFree` 中性描边 chip（透明底 + `border-l2` +
  `label-secondary` 字，亮 5.80 / 暗 10.42），绿色只留给 Key 状态（已配置 / 无需 Key），琥珀只给
  缺 Key / 冷却。三种语义共用绿底时右上角永远一团绿，状态就不可扫读了。
- **徽章用轨道 + 字色，不用纯色字**：`.mgrBadgeOk` = `state-success-tertiary` 底、`.mgrBadgeWarn` =
  `state-warn-tertiary` 底，字都是 `label-primary`（亮 17.33 / 17.48，暗 11.46 / 14.79）。两个徽章同构，
  **不要再写按主题分叉的覆盖**——`state-warn-label` 那类做法在暗色反而更暗（实测 4.33）。
- 亮色残留的地板是 `state-business-primary` 当文字用：主按钮字（白 on 蓝）、`.mgrLinkBtn`，
  实测 4.23:1，低于 4.5。这是主题 token 的取舍，插件侧不要私自改色；激活子标签已经改字色，不在此列。
- **状态先行**：关行卡片根加 `.mgrSearchChannelOff`，名称 `label-secondary`、开行 `label-primary`，
  字重都 600（亮 5.80 vs 18.90，暗 10.42 vs 15.03）。37 行同名色时只能靠一颗开关区分，是「表单感」的
  第一来源。
- **次操作不描边**：`.mgrSearchChannelActions .mgrBtn` 去边框去底、30 高、`padding:0 8`、12.5px
  `label-secondary`，hover 才出 `interactive-bg-hover`、`:active` 出 `interactive-bg-active`。
  排序按钮改 `.mgrIconBtn`（30×30）+ 12×12 inline SVG（`stroke:1.5;currentColor`），文本箭头 `↑ ↓`
  一律不许用；每个图标按钮必须带 `aria-label`。
- **浏览器表面**：`.mgrRoot` 给 `caret-color` 和 `::selection`（business-primary 28% 混底）；
  复选框统一 `input[type=checkbox]{accent-color:var(--dsw-alias-state-business-primary)}`，
  别让浏览器默认蓝漏进来。`.mgrLinkBtn` / `.mgrTextAction` 带 `text-underline-offset:3px`，
  `.mgrTextAction` 是 `inline-flex`、26 高（与子标签同高）、`padding:0 4`，保证 ≥24 的点击区并有
  `:focus-visible`。`.mgrBtn` / `.mgrTab` / `.mgrIconBtn` / `.mgrSwitch` 四类控件都要有 `:active`；
  开关按压只调 `filter:brightness(.97)`，**绝不能加 transform**——会覆盖滑块的 `translateX`。
- **元信息行折行要成组**：`.mgrSearchMeta` 里「时间 + 安全搜索」包进 `.mgrSubMetaGroup`
  （`display:flex;align-items:center;gap:8;flex-wrap:wrap`），spacer 留在组前。内容宽 364 时一行；
  353 时整体折到第二行（「模式/调整」+「时间/安全搜索」两组），**不允许单个控件落单**。
- **统计行要分主次**：`.mgrSearchStatLead`（`已启用 N/M`）600 字重、颜色仍 `label-secondary`，
  其余计数 400 同色；四段同重同色读起来是状态转储。
- **一个元素只用一种分界**：选中态只给底色，`.mgrTabActive` 的 `border-color:transparent`，
  不要再叠 1px 描边；`.mgrWarn` / `.mgrErrorBox` 不要 `border-left` 侧条，警示靠 8%
  `color-mix` 底色（`color-mix(in srgb,var(--dsw-alias-state-warn-primary) 8%,var(--dsw-alias-bg-layer-1))`，
  错误框用 `state-error-primary`），四边仍 1px `border-l2`。
- **错误/破坏性语义由底色或描边承载，文字回主色**：全站只有这一套写法。
  - 自己没底色的（`.mgrErrorBox`、`.mgrFormError`、`.mgrServerError`）：8% `state-error-primary` 底色
    （无边框，一个元素只用一种分界），文字 `label-primary`（亮 16.57 / 暗 13.67）。
  - 本身已有底色的（`.mgrToast`、`.mgrSearchChip`）：**不要再叠 8% 底色**，红只留 1px 描边，
    文字回 `label-primary`（亮 18.90 / 暗 13.34）。
  - `.mgrBtnDanger` 同构。红字直接压浅底只有 4.50，加 8% 底色后掉到 3.94，低于 4.5 地板。
  - 警示框 `.mgrWarn` 文字保持 `label-secondary`（亮 5.46 / 暗 9.05，本身达标），不要动。
- **名称行三徽章边缘态**：名称 `min-width:64px`（短词完整可见）、徽章组 `flex:0 1 auto;min-width:0`
  允许换行。320 宽 + FREE/无需 Key/冷却中 三徽章时，名称 64px 不省略、徽章折两行、无横向溢出；
  不给 min-width 时名字被压到 17px、只剩省略号。
- **开关关态**（`.mgrSwitch`，MCP/渠道/批量/局域网共 5 处共用）：轨道 `state-idle-primary`、
  滑块 `bg-base`、加 `--dsw-elevation-soft` + `0 0 0 1px border-l2` 的圆环。这些只写在
  `:not(.mgrSwitchOn)` 上，不碰 `.mgrSwitchOn`，开态才保证零变化（改前改后逐字 diff 匹配规则即可自证）。
- `skx*`（技能工作台）是另一套自带的视觉系统（13/14/16/17 档、`skxSwitch` 绿色 pill），不在 mgr 刻度内；
  要统一必须先问 Designer，别顺手改。

## 宽屏版式（≥1176，Designer 定稿）

面板在全屏窗口里一直铺满（实测 1900 视口内容宽 **1844**，`.mgrBody` 没有任何 `max-width`），
宽屏从来没人设计过。规则如下，每条都给量法。

- **内容列封顶 1120、居中**：头部、主标签、正文三条边共用同一条左轴。
  - 实现只改三处左右内边距：`.mgrHead{padding:24px max(28px,calc((100% - 1120px)/2)) 0}`、
    `.mgrTabs{padding:16px max(28px,calc((100% - 1120px)/2)) 0}`、
    `.mgrBody{padding:16px max(28px,calc((100% - 1120px)/2)) 24px}`。
    `100%` 取的是 `.mgrRoot` 宽，三个元素包含块相同，三条左缘必然对齐；滚动条仍在窗口右缘，
    不要改成给 `.mgrBody` 加 `max-width` + `margin:auto`（滚动条会跑到屏幕中间）。
  - 生效点 **1176**（`1120 + 28×2`）：窄于它自动退回 28，**420/320 零变化**；1200 与 1900 都得 1120，
    验收只报一个数。
  - 为什么居中不居左：居左会在右缘留一整列空白，读起来像没做完；对称外边距才读作「有版心」。
  - 为什么是 1120：面板里最长的一行固定内容（技能行 = 名称 + 两枚徽章 + 开关 + 单行 meta，
    MCP 命令行）在 1120 内一行放得下，再窄就要折行；再宽只是把同一列拉长，增加眼动距离，不增加信息。
    面板本来就给正文封了 640（`.mgrHint`），缺的只是容器级封顶。
  - 反例（1900 实测）：名称左缘 43 → 开关左缘 1823（**1780**）、搜索框 1777（光标 38、提交 1813）、
    最后一个子标签右缘 198 →「全部测试」1814（**1616**），每行都要从左眼跳到右眼才能读完。
- **只有三类元素二次封顶**，其余跟随列宽：

  | 元素 | 写法 | 反例 @1900 | 理由 |
  |---|---|---|---|
  | `.mgrSearchBar .mgrInput` | `max-width:480px` | 1777 | 搜索是输入不是通栏；1900 下光标在 x=38、提交在 1813，中间隔 1775——封顶后都落进 390–938 这一段 |
  | `.skxToolbarTop .skxInput` | `max-width:400px` | 1475 | 技能筛选器，400 约 30 个汉字，足够 |
  | `.mgrPrefsText`（偏好大文本域） | `max-width:720px` | 1814 | 等宽 12px 一行约 100 字符，再宽无从校对 |

  - 不封顶的：渠道卡、技能行、MCP 服务器卡、局域网行、工具卡、名称与描述（clamp 2 行）、MCP 命令行。
  - 动作区永远贴**列右缘**：`.mgrSubActions` 右缘、卡片右缘同一侧（1900 下都是 1510），
    不要给动作区单独设宽度，否则右缘会分裂成两条。
- **标签行左对齐，不拉伸也不等分**：主导航 7 项宽度由文字决定（合计约 489 + 24 gap），封顶后左起 390；
  子标签同理。**不要** `justify-content:space-between`、不要 `flex:1` 均分——等分后每项左右各留空，
  会读成分段控件，计数也会漂到项中间。
- **单列，不分两列**：
  - 渠道列表是**有序列表**（↑↓ 调整搜索优先级）。分两列后「第 3 个」既可能在右列顶也可能在左列第 3 行，
    扫读从纵向变成 Z 字，顺序语义直接丢掉；技能/MCP/工具同理。
  - 卡内动作右对齐要求每张卡只有一条右缘，分列会多出第二条，破坏「一页一条动作轴」。
  - 两列确实能让一屏多看到一倍的行，但代价是顺序和轴；这张表的主体是「谁是下一个」，不是数量。
    宽出来的空间由列宽上限消化。
- **断点**：不新增。封顶用 `max()` 连续生效（1176 处无缝），现有 `@media (max-width:1100px)` 只给
  `.skxSplit` 折列，保持不动（封顶后 1100 视口内容宽 1044，两列 558/486 仍可用）。
  验收档位是视口规格，不是 CSS 断点，见「版式刻度」里的量法。

## 审美判据（Designer 定稿）

方向：这页是仪表盘，不是表单页——密度、安静、可扫读；一屏只留一个强视觉锚（右缘那列开关）。
下列每条都要能由 Dev 照做、由 QA 量出来；量不出来的品味描述不进这份文件。

- **状态先行**：列表里必须让人不看控件就能分出「在用/未用」。判据：关闭行名称 `label-secondary`、
  开启行 `label-primary`，同一列表两种文字色都出现（亮 5.80 vs 17.45，暗 12.11 vs 17.45）。反例：
  37 行名称全 `label-primary`，只靠一颗 34×20 开关区分——37 行长得一模一样，是「表单感」的第一来源。
- **次操作不描边**：行内测试/配置/排序是次操作，不得用 1px 描边按钮。判据：`.mgrSearchChannelActions`
  里按钮 `border-color:transparent` 全覆盖，hover 才出 `interactive-bg-hover`；一屏内渠道行的描边按钮
  16 → 0（行开关是状态控件，不算次操作）。反例：每行 4 个描边按钮 × 37 行 = 148 个框，列表读起来是
  一排按钮而不是一排渠道。
- **图标必须是图形**：`↑ ↓ →` 这类 Unicode 字形不能当图标。判据：文本里带箭头的按钮数 = 0；改用
  12×12 inline SVG（stroke 1.5、`currentColor`）。反例：`.mgrSearchOrder` 的 12.5px 文字箭头，
  旁边是 51px 的「测试」，两套字形语言。
- **一个色相一个含义**：同屏一个色相只承担一个语义。判据：FREE（价格）用中性描边 chip（透明底 +
  `border-l2` + `label-secondary` 字），绿只给 Key 状态（已配置/无需 Key），琥珀只给缺 Key/冷却。
  反例：FREE/无需 Key/已配置 三种语义共用 `state-success-tertiary` 绿底，右上角永远一团绿。
- **盒子纪律**：非内容块不装盒；一个元素只用一个分界手段（描边或底色，不叠加）。判据：列表首屏内
  与内容卡「同边框 + 同圆角 + 同底色」的工具块 = 0；抽任意卡片，`border` 与 `background` 只有一个
  在分界。反例：渠道测试卡 95.6px，与渠道卡同款，是首屏第一个盒子。
- **一条轴**：换行的控件簇必须共用左边或右边，不能一行左、一行右。判据：同一控件簇内所有元素的
  `x` 或 `right` 相等（容许 1px 舍入）。反例：筛选区第 1 行输入框 + 复选框，第 2 行「全部可用渠道」
  左起，两行右端差 109px。
- **数字要有主次**：统计行至少两级字重/颜色，决定下一步的那个数是 600 + `label-primary`，其余
  11.5 secondary。判据：统计行里同时出现两种字重（或两种文字色）。反例：「已启用 9/37 免费 16
  已配置 8 缺 Key 15」四段同色同重，读起来是一串状态转储。
- **反馈成对**：有 hover 就必须有 `:active`；按下用 `interactive-bg-active`，不做位移/缩放（密集
  列表面板里位移会抖）。判据：`.mgrBtn` / `.mgrTab` / `.mgrSwitch` / `.mgrIconBtn` 各有 `:active`
  规则。反例：目前只有 `skxBtn` 有按压态，mgr 一套没有。
- **浏览器表面归设计管**：选中色、插入符、滚动条、focus ring、下划线偏移、数字等宽都要给值。判据：
  `::selection`、`caret-color`、`scrollbar-color`、`:focus-visible`、`text-underline-offset` 各 ≥1
  条规则。反例：选中和插入符还是浏览器默认蓝，`.mgrLinkBtn` 下划线贴字。
- **克制**：不加进场动画、不加逐行 stagger、不加渐变/玻璃；动效只回应用户动作（hover/active/展开）。
  判据：`@keyframes` 只有 `mgrSpin`。反例：无（守住）。

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
