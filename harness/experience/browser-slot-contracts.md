给浏览器插槽注册东西之前，先查「插槽契约」再动手

宿主应用会随包发布一份**插槽目录**（DSH 里在 `dsh-cordis-client-runner` 的客户端包里），
里面写清了每个插槽：种类、作用域、注册时必须带的选项、谁声明它、谁占了它、以及一段官方示例。
**注册形状随种类而变**：

- `single`：一个条目，通常要 `id`；
- `keyed`：要 `key`，key 相同的注册会互相顶掉；
- `list`：要 `id`，多个条目按 `order` 排序；
- `hoc`：要 `id`（和可选 `key`）；
- `chain`：**必须带 `select(owner)`**——条目按顺序试，第一个返回非 null 的当选，
  返回值作为 `matched` 传给它；全 null 就走 owner 的 fallback。

踩坑实例（DSH 的对话回退按钮）：往用户消息行的 `conversation.chat.user.before` 注册，
漏了 `select` → 注册被拒 → 被 try/catch 吞掉 → 表现是「按钮不出现」，
和「插槽还没声明」「inject 没等到」几乎无法区分，绕了好几轮。

两条通用做法：
1. **先查契约再写注册**（DSH 项目里已有 `harness/tool/slot-contract.mjs`）；
2. **注册失败和「还没出现」要分开诊断**：注册成功、组件渲染成功各报一次，
   面板上分开显示，才能一眼看出卡在哪一步。

另外：子插槽要等它出现再注册——它随**父条目**注册才诞生；
`slots.inject(name, cb)` 会等声明出现再调回调，比自己轮询可靠。

## 加入口的三种层次（按「离原插件多近」排）

1. **接管别人的行组件**（原 `dsh-rewind-plugin` 的做法）：`slots.entries('conversation.chat.node')`
   拿到 `user`/`steering` 条目，把 `entry.component` 换成包装组件；包装组件调用原组件，再克隆它返回的
   元素、包一层它的 `actions` 渲染函数，把按钮塞进 `actionRow.props.extraActions`。位置就是复制/分支
   那一排图标。**代价**：`entries()` 的条目是否可写是运行时行为，接管后要自检。
2. **子链插槽**（`conversation.chat.user.before`）：稳、一定有 sessionId，但渲染在气泡**上方**，
   不是动作栏——放这里用户会直接说「位置不对」。
3. **专门的 actions 插槽**：用户消息没有这种插槽（只有 `conversation.chat.assistant-actions`）。

## 接管要自检，别靠「应该生效了」

包装组件打标 `__dshManagerRewindRow`，管理器轮询 `entries()`；8 秒内没看到标记就报
`row-action-takeover-rejected`。否则「改 entry.component 没生效」和「生效了没渲染」在面板上长得一样。

## 诊断三态（UI 增强页第二行）

```
消息动作栏的按钮：已挂载（row-action-mounted）            ← 按钮已画进动作栏 ✓
消息动作栏的按钮：未挂载（row-action-pending）            ← 接管装了，还没渲染到行
消息动作栏的按钮：未挂载（row-action-takeover-rejected）  ← 接管没生效
```

## 工具表的成本习惯（agent 工具）

**工具定义常驻每轮请求**：10 个工具 6113 B + 系统提示词段 749 B ≈ 1.7k tokens/轮。合并后 5 个工具
3698 B + 658 B ≈ 1.1k tokens/轮（−36.5%）。

- 判断标准：**一个工具是不是一个「问题」**。时间窗、多渠道、多查询、缓存回看都是**参数**；把它们做成
  新工具名，等于每个请求都为那次分类付一次钱，还让模型多做一次判断。
- 合并时先用「同一个能力」对齐：`advanced_search` = `web_search` + `timeRange`；`multi_search` =
  `web_search` + `queries`/`sites`；`platform_search` + `domain_search` = 「换哪个源」→ `search_source`
  的 `target` 枚举；`cache_search` = `research.fromCache`。
- **枚举和描述不要写同一份名单**：把 54 个 target 既写进 enum 又写进 description，白白多付一倍字节。
- 合并「返回结构不同」的工具要谨慎：视频（`video_search`）保留独立，因为它的返回结构塞进
  `search_source` 会变成 union schema，模型要跟着分支。
- 自测类工具（`free_search_test`）不给模型：面板有按钮，模型不需要。
- 改完量一次：`node --input-type=module -e "…"` 打印每个工具的 `JSON.stringify({name,description,parameters}).length`。
