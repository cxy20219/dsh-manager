# dsh-manager

管理中枢（dsh-manager）：DeepSeek Harness Web UI 左侧的一个入口，管理 Agent 运行所需的东西，以及你怎么访问它：
**技能**、**MCP 服务**、**联网搜索**、**UI 增强**、**偏好**、**局域网访问**、**工具**。

- **技能** — 自带一套完整的技能管理内核（`skills/`，派生自 `@michengai/dsh-skills-manager`，Apache-2.0）。
  **不依赖任何其他技能插件**，装这一个就够。内核发现本机 20+ 个 Agent 技能来源（`~/.dsh/skills`、
  `~/.agents/skills`、Claude Code、Codex、Cursor、Windsurf、Trae、Copilot、Qoder、OpenClaw 等）。
  **默认只启用 `~/.dsh/skills` 与 `~/.agents/skills`**，其它来源在面板里按需打开——新装或升级都不会
  悄悄把别的 Agent 目录里的技能喂给本 Agent。每个来源可整体启停，单个技能也可启停；同名技能按来源
  rank 决胜，其余记为副本而不是重复列出。
- **技能界面** — 分四个子标签，各占一页：**已安装**（一张横铺的技能表）、**项目技能**（按工作区只读浏览）、
  **发现技能**（ClawHub 榜单与搜索安装）、**回收站**（恢复或永久删除）。
  同名技能在别的来源里也存在时只列生效的那一份，后面跟一个 `+N`（N = 另外几个来源有同名）；
  「仅手动」表示它的 frontmatter 写了 `disable-model-invocation`，模型不会自动调用，只有你点名时才用。
  点一行用弹窗看它的简介、token 估算、自定义备注、SKILL.md 正文和源文件路径。
  备注只存在本插件，绝不写回 `SKILL.md`。
- **一处搜全部** — 已安装页没有来源导航栏、也没有右侧详情栏：所有已安装来源的技能在一张通栏表里，
  每行自带来源标签，顶部搜索框铺满整行并一次匹配**全部来源**的名字 / 简介 / 备注，开关就地切换。
  整个来源的开关收进右上角「来源」按钮的弹窗（关掉一个来源＝它下面的技能不再提供给 Agent），
  来源被关掉时行上的来源标签会标黄。
- **异常单独成面板** — 宿主加载不了的 `SKILL.md`（缺 frontmatter / 缺 name / name 转不成 kebab-case /
  description 为空）不进主列表，只计入右上角「异常 N」按钮；点开是它们的清单：名字、来源、**具体原因**、
  文件路径。改好文件点工具栏的「重新扫描」即可（页脚那栏已去掉，重扫按钮就在搜索框右边）。
- **目录核对** — 技能页还会报告 Agent 的注册表实际提供了什么，把所有 provider 合并后统计
  （`ctx.skills.list`）。顶层技能和内置 provider 因此也会计入总数；管理器认为生效、但注册表里没有的
  技能，会被明确标成「被遮蔽」或「缺失」，而不是悄悄算成已加载。
- **MCP** — 添加、编辑、启用、停用、删除和重连本地 stdio MCP 服务。发现的工具按
  `mcp__<服务>__<工具>` 注册到 `ctx.tools`，命名约定与内置 MCP 桥一致。环境变量的值存在宿主凭证库，
  绝不写进插件的设置文件。
- **联网搜索** — 内置 37 个搜索渠道：10 个免 Key 通用/免费档渠道、5 个中文 HTML 抓取渠道、18 个带 Key 的
  通用 API（含中文与英文索引），以及 3 个按次计费的模型搜索（不参与智能路由）。每个渠道单独开关、单独配置
  Key 与服务地址，一个渠道可放多个 Key 轮换。支持「并发合并」「顺序回退」「智能路由（语言 + 意图）」三种模式，
  可关安全搜索、可维护域名黑名单；失败渠道会冷却且冷却跨重启保留，结果有 5 分钟内存缓存，面板可一键测试全部渠道。
  Key 存在宿主凭证库，面板不回显；结果只按文本和 HTTP(S) 链接渲染。
  同一套渠道也注册为 agent 的 `ctx.web` provider `dsh-manager`，以及 5 个 agent 工具：`web_search` /
  `search_source` / `research` / `video_search` / `weather`，替代停用的 dsh-free-search 的核心搜索链路。
- **偏好** — 直接编辑 DSH 每个会话开始时注入的全局 `AGENTS.md`。权威文件存在管理器数据目录
  （`<dataDir>/system/AGENTS.md`），DSH 读的 `~/.dsh/AGENTS.md` 软链到它；不能建软链时退化为两边同步写。
  移植自自衍中枢的同名功能，语义一致（64 KiB 上限、读失败禁用保存、原子写、旧受管段标记清理）。
  **同一个 DSH home 只能有一个偏好编辑器**：本模块会采纳并改写入口文件，自衍中枢的偏好要先关掉。
- **局域网访问** — 一个开关，在本机的局域网地址上开一个入口。面板给出二维码；手机或平板扫码后用浏览器
  打开的就是同一个 GUI，操作权限与本机浏览器完全一致。默认明文 HTTP，链接里的令牌就是口令，扫码即用；
  也可以打开 HTTPS，但那样要在手机上装一次根证书。监听器只在开关打开时存在，并且只绑定一个具体地址，
  绝不绑定所有网卡。
- **对话回退的按钮位置** — 照原插件的方式：接管 `conversation.chat.node` 的那一行，把 ↶ 追加到
  该行的动作栏（复制 / 分支图标那一排）。本版本的聊天行 props 里没有 `sessionId`，原插件的接管会静默
  放弃，所以管理器通过 `globalThis.__dshManagerRewind` 把「当前会话」和自身开关交给它，机制仍是原插件的。
- **输入框历史**（UI 增强里的开关，默认开）— 在对话输入框按 **↑** 依次翻出本会话最近发送过的消息，**↓**
  往回走并最终还原你原来打的草稿；翻出来的内容是可编辑的草稿，改完直接回车就发出。↑ 只在输入框为空时
  接管，↓ 只在翻历史的过程中接管，其余时候方向键照常移动光标；每个会话单独存 50 条，存在浏览器本地。
  对话输入框是 Lexical 的 contenteditable 编辑器（不是 textarea），写回走 `execCommand('insertText')`，
  否则编辑器内部状态不会更新、下一次渲染就把文字抹掉。
- **UI 增强** — 一组界面增强功能的开关，功能由本插件自己提供。当前是**对话回退**：把对话回退到更早的
  用户消息，可选一并还原工作区文件（每条用户消息旁的 ↶ 按钮，`/rewind` 与 `/undo` 命令）。
  这套行为来自 `dsh-rewind-plugin`（MIT），代码**已随本插件内置**在 `rewind/`，因此不依赖那个插件是否安装，
  也不会出现第二套实现；管理器只决定它开不开。开关存在管理器自己的设置里（`ui.features.rewind`），
  切换立即生效：关闭时命令会直接回答「已关闭」，也不再记录文件检查点。
  「UI 增强」页上有两行诊断：「对话里的界面：已挂载 / 未挂载（原因）」和「消息旁的按钮：…」。
  这两处都在对话 UI 里、不在面板里，所以由浏览器把结果报回来，卡在哪一步会直接写出来。
- **按钮的位置是本插件自己写的**：上游把 ↶ 放在每条用户消息旁，做法是接管 `conversation.chat.node`
  这条插槽里的行组件。当前 DSH（0.2.2-rc.3）的这条插槽存在，但它渲染行组件时**不传 sessionId**，
  上游的 `targetOf(props)` 因此拿不到回退目标，**静默不画按钮**（上游面向的是更新版本）。
  所以按钮改放在这个版本为用户消息预留的扩展位 `conversation.chat.user.before`（会话级作用域）上：
  点开列出这个会话可回退的消息，选一条，再选「仅回退对话」或「对话和文件」。
  回退本身仍是上游的引擎（`/rewind-plugin @<seq> <mode>`），候选列表也是上游的接口
  `/api/dsh-rewind/candidates`，只有位置和菜单是我们写的。
  `/rewind`、`/undo` 两个命令同样可用（上游把命令装饰成了选择器）。
- **工具** — 管理器交给 Agent 的工具总目录，按板块分成子标签：技能内核注册的 `create_skill`、每个已连接的
  MCP 服务贡献的工具、联网搜索桥注册的检索工具。每个工具都列出名称、描述和
  参数（JSON Schema 展开成逐项的名称、类型、是否必填、说明），不用翻源码就知道模型能调用什么。

## 安装

在本仓库根目录下执行（把路径换成你自己的检出位置）：

```bash
dsh plugin --profile desktop add .
```

也可以用 Web UI 里的插件管理器安装：先 `npm pack` 打包，再选中生成的 `.tgz`。
这个 bundle 会插入一行宿主配置（`dsh-manager`）和一个客户端模块。
不安装任何运行时依赖：ZIP 导入由自带的 `skills/zip.js` 处理，`dsh plugin add` 直接链接检出目录即可用。

装完后刷新一次网页，入口就出现在左侧栏的其他全局面板旁边。

## 技能来源与结构

内核自己发现来源，不需要你配置扫描根。用户级来源包括：

```text
~/.dsh/skills/            DSH 自己的技能目录（可写、可建、进回收站）
~/.agents/skills/         公共 Agent 目录（可写）
~/.claude/skills/         Claude Code
~/.codex/skills/          Codex
~/.cursor/skills/         Cursor
~/.gemini/skills/         Gemini
~/.copilot/skills/        GitHub Copilot
~/.windsurf/skills/       Windsurf
~/.trae/skills/           Trae
~/.qoder/skills/          Qoder
~/.openclaw/skills/       OpenClaw
… 共 20+ 个
```

每个来源下 `<名字>/SKILL.md` 是一个技能，`<名字>.md` 是扁平技能。项目级来源（工作区里的
`.dsh/skills`、`.agents/skills` 等）由内核单独发现。

- **目录不存在就完全不出现**：内核会列出 22 个候选来源（Claude Code、Cursor、Codex、Trae、Qoder…），
  目录没建的那些直接不进面板——左栏只列真正有内容的来源，页脚也只数它们。本机通常只有 3–5 个。
- **同名技能只显示生效的那一个**：多个来源有同名副本时，按来源 rank 决胜，其余折叠成 `+N` 标记，
  不重复占行。内核以 overlay provider 注册（rank 399–500），确保停用动作真的生效。
- **解析失败的技能不进主列表**：它们只在「异常 N」面板里出现，并附上具体原因和文件路径。
- **状态目录**：`~/.dsh/manager/skills/`（`state.json` 与 `trash/`），与任何其他技能插件的状态分开。

## MCP 服务

只支持 `stdio` 传输。表单字段直接对应一个子进程：命令、每行一个参数、可选的绝对工作目录，以及
`KEY=VALUE` 环境变量行。

- 子进程环境从当前环境出发，先去掉名字匹配 `KEY|PASSWORD|SECRET|TOKEN` 和 `DSH_*` 的变量，再叠加表单里
  显式填写的条目。
- 环境变量的值写入凭证库，记录名 `dsh-manager/<服务 id>`（`api-key` 类型，带一个 `env` 映射）。设置文件
  只保留变量名，面板不会回显值。
- 服务发来 `notifications/tools/list_changed` 时重新同步工具。服务崩溃后会显示错误并保留该行，用
  **重新连接**恢复；没有自动重连循环。
- 工具结果按文本转发。图片、音频和内嵌二进制资源会显示成一段简短诊断，而不是 base64。
- 每个服务都以宿主子进程的身份、用你当前系统的用户权限运行。权限预设里的沙箱不约束它，只有环境变量
  被清洗过。

## 联网搜索

搜索能力由本插件自己实现，不依赖 dsh-web-tools：每个渠道是一个小型 HTTP/HTML/MCP 适配器，管理器只管开关、
凭证、服务地址和结果合并。面板和 agent 的 `web_search` 共用同一套渠道与模式；本插件把搜索注册进 `ctx.web`，
不再需要 dsh-free-search 才能让 agent 搜索。

面板的「联网搜索」页：顶上是查询框（回车或点 **搜索**），下面一行是当前模式、时间过滤和安全搜索；再往下分成
三个子页，切页不会丢掉正在编辑的渠道表单：

- **结果**：逐渠道状态、渠道摘要和按排名列出的来源（纯文本 + HTTP(S) 链接）。
- **渠道**：搜索模式（并发合并 / 顺序回退 / 智能路由）、全部测试、37 个渠道的开关、顺序、测试、服务地址和 Key。
  顶部有筛选框和 **只看已启用**，渠道多时不用一路滚。
- **过滤**：域名黑名单。

- 37 个渠道，分三档：
  - **免 Key**：Bing（HTML）、DuckDuckGo（HTML/Lite）、AnySearch（匿名 JSON）、Exa（匿名 MCP）、Tavily（keyless）、
    Firecrawl（免 Key 档）、Parallel（匿名 MCP）、You.com（每日免费档）、Keenable（匿名 MCP）、SearXNG（自建），
    以及中文 HTML 抓取：百度网页、360 搜索、搜狗、微信文章、今日头条。
  - **通用 API**：DeepSeek（Messages + `web_search`）、MiniMax（Token Plan）、Brave、Jina、百度千帆、Kimi、
    Perplexity、Metaso、Google CSE（Key 填 `API_KEY:CX`）、Yandex（Key 填 `API_KEY:FOLDER_ID`）、阿里云百炼、
    豆包、腾讯元宝、SerpBase、Serply、Outcrawl、TinyFish、DegOog（自建实例）、知乎。
  - **按次计费的模型搜索**：OpenAI、Gemini、Claude。它们不会进入智能路由，只有显式启用并参与合并/回退时才会调用。
  - 混填 Key 的渠道（Exa/Tavily/Firecrawl/Parallel/You/Keenable/SearXNG/AnySearch）留空走免费档。
- 每个渠道有独立的启用开关；搜索只发给已启用的渠道。未启用的渠道仍可单独点 **测试** 验证配置。
- API Key 存宿主凭证库，记录名 `dsh-manager/search-<渠道>`；设置文件只存开关、优先级和 `baseUrl`。面板不回显
  Key，输入框留空表示保持不变；**清除 Key** 删除记录。如果宿主凭据中心已有同名条目（例如 dsh-free-search 写入的
  `EXA_API_KEY`），管理器会复用它；管理器自己的记录优先。也支持环境变量回退：
  `EXA_API_KEY`、`TAVILY_API_KEY`、`FIRECRAWL_API_KEY`、`PARALLEL_API_KEY`、`BRAVE_API_KEY`、
  `YOU_API_KEY`、`JINA_API_KEY`、`KEENABLE_API_KEY`、`SEARXNG_API_KEY`、`ANYSEARCH_API_KEY`、
  `DEEPSEEK_API_KEY`、`MINIMAX_API_KEY`、`BAIDU_API_KEY`、`MOONSHOT_API_KEY`、`PERPLEXITY_API_KEY`、
  `METASO_API_KEY`、`GOOGLE_CSE_API_KEY`、`YANDEX_API_KEY`、`DASHSCOPE_API_KEY`、`DOUBAO_SEARCH_API_KEY`、
  `TENCENTCLOUD_WSA_APIKEY`、`SERPBASE_API_KEY`、`SERPLY_API_KEY`、`OUTCRAWL_API_KEY`、`TINYFISH_API_KEY`、
  `DEGOOG_API_KEY`、`OPENAI_API_KEY`、`GEMINI_API_KEY`、`ANTHROPIC_API_KEY`、`ZHIHU_API_KEY`。
  Bing/DuckDuckGo/中文 HTML 渠道没有 Key。
- 一个渠道可以填多个 Key（逗号、分号或换行分隔，最多 5 个）。搜索按轮转顺序使用，遇到鉴权失败或额度用尽会自动换下一个 Key。
- 服务地址填渠道根地址，留空用默认。SearXNG 默认 `http://127.0.0.1:8080`；它的 API Key 可填
  `user:password` 走 Basic Auth，或者填裸 key 走 `api_key` 查询参数。实例需要在 `settings.yml` 里开启
  JSON 输出（例如 `formats: [html, json]`），否则收到的是 HTML，适配器会报非 JSON 响应。
- **并发合并**（默认）：每次搜索并发请求所有启用渠道，每渠道最多 10 条，按 URL 去重、跨渠道共识排序，
  折叠近似重复的标题/摘要；结果跨 4 个以上站点时单站最多 3 条，最终最多 20 条；
  单个渠道 20 秒超时。某个渠道失败只影响它自己，结果页会逐渠道显示条数或错误码。
- **顺序回退**：按渠道优先级逐个尝试，第一个返回结果的渠道生效；某个渠道成功后停止，后面的渠道不再请求。
  优先级用渠道行的 ↑/↓ 调整，三种模式都生效。
- **智能路由**：按查询语言（中文/英文）与意图（代码、学术、新闻、金融、购物）给渠道排序，最多试 4 个，第一个
  有结果的生效。中文查询优先中文原生渠道，英文查询优先英文索引；OpenAI/Gemini/Claude 这类按次计费的渠道
  不会被自动选中。
- **冷却与缓存**：鉴权/额度失败冷却 5 分钟，限流/反爬冷却 1 分钟；冷却中的渠道会被跳过，可点「重置冷却」立即恢复。
  冷却状态会写入设置文件，重启后仍然生效（最多延迟约 0.6 秒落盘）。成功结果在内存里缓存 5 分钟（最多 50 条），
  改配置或换渠道会清空缓存；测试请求不走缓存。
- **安全搜索**：默认开启，作用于 Bing（`adlt`）、DuckDuckGo（`kp`）和 Google CSE（`safe`）；关掉后回到原始结果。
- **全部测试**：「渠道」子页的「全部测试」并发测试所有已启用渠道，逐渠道显示可用条数或错误码，用来快速判断
  “是渠道坏了还是查询没结果”。
- **域名黑名单**：「过滤」子页里一行一个域名，命中的站点及其所有子域会在合并（或回退）之前被剔除，所以结果仍能填满
  `maxResults`。可以直接粘贴完整网址，scheme、路径、端口和 `www.` 会被自动去掉；重复项和无法识别的行会被丢弃。
  规则对面板和 agent 工具同时生效，保存后清空结果缓存。
- **免 Key 渠道**：Bing/DDG 抓公开结果页，AnySearch 走匿名 JSON，Exa/Parallel/Keenable 走匿名 MCP，Tavily 用
  keyless 头，Firecrawl/You 走官方免费档。HTML 渠道依赖当前出口 IP，可能被反爬或直接连不上；不需要时单独关掉即可，
  不会影响其他渠道。
- 结果只作为纯文本和 HTTP(S) 链接渲染；非 http(s) URL 在 Host 侧就被丢弃，外部内容不会被当成指令。
- 搜索状态与结果不写入设置、会话或卡片库；只有开关、服务地址、域名黑名单和凭证持久化。

### Agent 侧

- 注册 `ctx.web` 搜索 provider `dsh-manager` 和抓取 provider `dsh-manager-fetch`；如果对应的 provider id 为空、
  是 `http`/出厂默认，或还指向 free-search 留下的 `ddg`/`fs-quality-fetch`，会自动接管。已经显式选择其他
  provider 时只警告，不抢占。
- 抓取质量链：直连（校验每跳重定向、拒绝内网地址）→ Exa contents（复用 Exa 渠道 Key）→ Firecrawl scrape
  （复用 Firecrawl 渠道 Key）→ Crawl4AI（`CRAWL4AI_API_KEY`，宿主凭据或环境变量）。无头浏览器层没有搬：
  它要 spawn 本机 Chrome/Edge，属于单独的安全决定，也需要本地 CLI 二进制。
- 注册 **5 个** agent 工具，一个工具对应一个问题，变体走参数而不是新工具名：
  - `web_search` — 搜网页。`query` 必填，另可用 `queries`（多角度合并）、`timeRange`（day/week/month/year）、
    `sites`（只搜某些渠道）、`maxResults`。
  - `search_source` — 直接问某个平台或垂类 API，`target` 是平台与垂类的并集枚举，它决定 `query` 怎么写。
  - `research` — 多查询 + 抓正文 + 质量分级；`fromCache: true` 只翻已抓过的正文（原来的 `cache_search`）。
  - `video_search`（Bing Videos + DuckDuckGo Videos）、`weather`（Open-Meteo，当前 + 1-7 天）。
  - 原来的 `advanced_search` / `multi_search` / `platform_search` / `domain_search` / `cache_search` /
    `free_search_test` 已合并或移出模型目录（按渠道自测在面板「联网搜索 → 渠道」里）。
  - 成本：工具定义 **6113 B → 3698 B**，系统提示词段 749 B → 658 B，合计 **6862 B → 4356 B（−36.5%）**，
    每轮请求少约 626 tokens。改这些定义时请重新量一次，别让工具表又长回去。
  - 新会话或重新加载后可见；已经打开的会话不会自动刷新工具表。
- 注入一段系统提示词段「联网搜索（dsh-manager）」：说明当前搜索模式、已启用的渠道，以及「搜索只返回候选、
  要正文用 web_fetch 或 research」的分工。渠道开关变化时重新注册；文本里没有每次搜索都会变的计数，
  长会话的提示词前缀缓存不会因此反复失效。
- `search_source` 的平台档支持 GitHub / V2EX / Bilibili / Reddit / Hacker News / Stack Overflow / Wikipedia /
  npm / YouTube / Vimeo / 掘金 / 豆瓣 / Qiita；垂类档是 41 个免 Key 公共 API。X (Twitter) 需要本地 Grok
  Build CLI，暂未搬。
- agent 侧和面板共用同一份开关、优先级、Key、冷却和缓存。停用 dsh-free-search 后，至少要在面板启用一个渠道，
  否则 `web_search` 会报“没有启用的搜索渠道”。首次启动且没有任何免费渠道启用时，插件会一次性启用 Bing + Exa
  作为零 Key 兜底；之后手动关闭不会被重新打开。
- `web_search` 的 `timeRange` 和面板的时间下拉支持 `day` / `week` / `month` / `year` 四档；会把过滤参数映射到
  Bing、DuckDuckGo、Tavily、Firecrawl、Parallel、Keenable、SearXNG、Brave，以及有 Key 的 Exa。Exa 的
  免 Key MCP 档、You/AnySearch/Jina/DeepSeek/MiniMax 暂不支持；Bing 没有“一年”档。不支持的渠道仍会返回
  结果，只是不加这个参数；暂不支持自定义日期区间。
- `search_source` 的垂类档支持包/版本（PyPI、crates、GitHub releases、endoflife、Maven/NuGet 等）、学术
  （Crossref、OpenAlex、Semantic Scholar、arXiv、PubMed、dblp 等）、安全（NVD、OSV、CISA KEV）、
  金融（SEC、IMF、World Bank、CFETS 等）、新闻（Google News、GDELT）、法律和中文站等 41 个源。
- `video_search` 跨站搜视频；要按站点搜 YouTube / Vimeo / B 站，用 `search_source` 并把 `target` 设成
  `youtube` / `vimeo` / `bilibili`。
- `research`：按中英文生成 1/3/5 个查询变体、合并搜索结果（同一站点最多 3 个来源，质量域按 eTLD+1 计数），
  先做词法重排；配置了 `SILICONFLOW_API_KEY`（宿主凭据或环境变量）时再用 `BAAI/bge-reranker-v2-m3` 重排，
  失败静默回退。整个运行共享 90 秒预算；第一轮证据偏薄且还有时间时，会再抓 2 个页面（升级检索）。
  正文通过 `dsh-manager-fetch` 质量链抓取，最后给出 `high/medium/low` 证据分级，预算耗尽或抓取全失败会降级为
  `low` 并标注 `degraded`。带 SSRF 防护（只抓公网 http/https）。
  `research.fromCache` 检索 research 抓过的正文，7 天过期，持久化到 manager 数据目录的 `research-cache.json`
  （最多 200 篇，重启保留）。
- 没有搬过来的能力：free-search 的无头浏览器抓取层（需要本机 Chrome/Edge CLI）、独立 MCP server，
  以及依赖 Grok Build CLI 的 X 搜索。除此之外，free-search 的搜索、路由、冷却、缓存、research 与抓取链都已接上。
- `web.searchProvider` / `web.fetchProvider` 的接管会写 profile 的 `web` 配置；这是为了修掉 free-search
  停用后残留的 `ddg` / `fs-quality-fetch` 指针。抓取 provider 会切到 `dsh-manager-fetch`（直连 → Exa →
  Firecrawl → Crawl4AI）；注册失败时回退 `http`。如果你明确指定了别的 provider，本插件不会覆盖。

## 工具目录

「工具」这个标签回答一个问题：**模型现在到底能调用什么**。它不另建一份清单，而是把各板块自己知道的事情
汇总起来——每一条都来自真正注册到 `ctx.tools` 的定义，所以名字、描述和参数不会和实际发出去的 schema 走偏。

| 子标签 | 工具从哪来 | 描述与参数 |
|---|---|---|
| 技能 | 技能内核注册的 `create_skill` | 内核自己的定义 |
| MCP | 每个已连接的 stdio 服务的 `tools/list` | 服务自己的 `description` 与 `inputSchema` |
| 联网搜索 | 搜索桥注册的 5 个检索工具 | 桥自己的定义 |
| 局域网访问 | 没有工具 | — |

- 目录是活的：MCP 服务后来连上，它的工具下一次刷新就出现；服务断掉，工具也一起消失。
- 读目录的接口是 `POST /api/manager/tools-list`，返回 `{ groups: [{ id, tools }] }`；标签页上的计数来自
  `overview` 里的 `tools.total`。

## 局域网访问

Harness 的 web 服务只拥有一个监听器，并且绑定回环地址；内置组合拒绝通配地址绑定是刻意的。因此插件不动
内核：它自己在一个具体的局域网地址上开 HTTPS 监听，把每个请求转发给正在运行的 web 服务。

- 默认是明文 HTTP：访问凭据是链接里的启动令牌，等同于 OpenCode 那种「口令代替加密」的做法，
  扫码打开就能用，手机上不需要装任何东西。
- 打开加密开关后，插件自己是一个小型证书颁发机构：服务器证书由它签发，面板提供根证书下载，手机
  信任根证书之后证书链才被认可（浏览器能让页面穿过自签警告，但会直接拒绝该主机的 WebSocket，所以
  必须装根证书）。证书同时覆盖 mDNS 主机名，地址变了也能用。根证书和服务器证书都缓存在管理器
  数据目录下。
- `Host` 和 `Origin` 会被改写成上游自己的 authority，因为上游信任的是回环那个 authority。Cookie、
  请求体和 WebSocket 升级都原样转发。
- 二维码里带的是宿主的启动令牌。首次访问会像本机浏览器一样用它换成签名会话 Cookie，随后紧随的跳转
  会把令牌从地址栏里去掉。
- 这个链接等同于管理员权限，所以只在开关打开时显示。关掉开关会立刻收回端口；开关状态会被记住，
  下次启动监听器自动回来。

| 内容 | 位置 |
|---|---|
| 管理器设置（0600） | `<DSH_HOME>/manager/settings.json`，默认 `~/.dsh/manager/settings.json` |
| 技能内核状态（启停、分类、备注） | `<DSH_HOME>/manager/skills/state.json` |
| 技能回收站 | `<DSH_HOME>/manager/skills/trash/` |
| 技能操作日志 | `<DSH_HOME>/manager/skills/skills.log` |
| 局域网开关、端口与加密开关 | 同一个文件里的 `lan` 段 |
| TLS 材质（私钥 0600） | `<DSH_HOME>/manager/lan-access/tls/` |
| 局域网访问日志 | `<DSH_HOME>/manager/lan-access/access.log` |
| MCP 环境变量值 | 宿主凭证库，记录 `dsh-manager/<服务 id>` |
| 搜索渠道 API Key | 宿主凭证库，记录 `dsh-manager/search-<渠道>` |
| 技能文件 | 内核发现的各 Agent 来源（`~/.dsh/skills/`、`~/.agents/skills/` 等），只在可写来源里创建 |

在该行配置里填一个绝对路径 `dataDir` 可以改设置目录的位置（技能内核的状态目录固定为
`<DSH_HOME>/manager/skills/`，不跟随 `dataDir`）。插件不会改写 profile 的 patch 文件。

升级说明：内核状态（启停、分类、备注）从空开始，旧版 `settings.json` 里的分类/技能开关不会迁移；
首次启动时按上面的默认来源策略启用，其它来源需要重新打开。

## 限制

- 技能发现只看一层分类，更深的嵌套会被忽略。
- 目录核对只覆盖全局 provider：项目级技能根目录需要工作区，因此不会出现在面板统计里。
- 一次扫描结果最多复用一秒，让概览保持便宜；文件监听事件、开关操作或 **重新扫描** 会立刻丢弃它。
- MCP 只支持 stdio，没有实现 Streamable HTTP。
- 用内置 `@deepseek-ai/dsh-mcp-client` 行配置的服务不会被导入。本面板管理自己的一套 stdio 列表，两者
  不会悄悄共用服务命名空间。
- 删除技能会先进回收站（`~/.dsh/manager/skills/trash/`），可以恢复到原位；只有回收站里的 **永久删除**
  才会真正移除目录。删除入口只对可写来源显示，符号链接的技能不可删。
- 面板不提供「新建技能」入口：写新技能走 Agent 的 `create_skill` 工具，装现成的走「发现技能」。
  `SKILL.md` 的正文和 frontmatter 由内核按与上游一致的规则校验，非法名会被拒绝而不是清洗。
- 标签页打开时，MCP 列表面板每四秒轮询一次状态。
- 搜索渠道本身只负责搜索；正文抓取、多轮 research 和检索缓存由 `agent-fetch` / `research` 负责。X / 小红书站内检索没有接。
- 免 Key 的 HTML 渠道（Bing/DDG）没有浏览器渲染和代理池，反爬、验证码或出口 IP 被限流时会失败；这是免费抓取的固有限制，
  填 Key 的 API 渠道不受影响。
- DDG/You.com 在部分网络（尤其国内直连）会连接超时；不需要时关掉即可，不影响其他渠道。
- Exa/Parallel/Keenable/You 的免 Key 档使用官方固定端点；自定义服务地址只影响有 Key 的请求。
  Tavily/Firecrawl/AnySearch/SearXNG 的免 Key 请求仍使用自定义地址。
- 冷却状态写进管理器设置，跨重启保留；结果缓存仍是 Host 进程内存里的 5 分钟缓存。开关、优先级、模式、服务地址、凭证与冷却都会持久化。
- 搜索渠道使用 Node 的 `fetch` 直连，不读取 Host 的代理设置；需要代理时要改适配器。
- 自定义服务地址会原样用于请求，面板不做 SSRF / 私网过滤；只填可信地址（自定义地址会收到该渠道的 Key）。
- 自定义搜索源（任意 JSON 接口）暂不支持；新增渠道要改 `src/search-providers.js` 并补测试。
- 每个渠道只暴露开关、API Key 和服务地址；渠道特定的高级参数（搜索深度、提取模式等）使用适配器里的默认值。
- DeepSeek 走 Anthropic 兼容的 Messages 接口 + `web_search_20250305`，一次搜索是一次模型调用（默认
  `deepseek-v4-flash`、`max_uses: 5`），端点默认 `https://api.deepseek.com/anthropic/v1`。
- MiniMax 走 `/v1/coding_plan/search`，单次最多 10 条、不支持分页；默认全球站 `https://api.minimax.io`，
  中国站的 Key 会自动回退到 `https://api.minimaxi.com`（成功一次后缓存区域，Host 重启后重新探测）；
  显式填了服务地址时只请求该地址。需要 Token Plan；安全/配额错误从 `base_resp.status_code` 映射，
  `2049`/`1004` 视为鉴权失败并触发区域回退。
- Brave 先走 LLM Context，403/404 时回退 classic Web Search；其他渠道没有多端点回退。
- 局域网监听需要机器上有 `openssl` 才能签发证书。没有时开关会直接报出原因，不会开出端口。
- 监听器只绑一个地址，绝不绑 `0.0.0.0`。macOS 不会把「本机 → 自己的局域网地址」的连接路由回来，所以
  这个链接必须用网络里的另一台设备打开——手机就是预期的打开方式。
- macOS 会问一次是否允许 Harness 应用接受传入连接。不放行的话手机连不上这个端口。
- 开了加密开关才需要用户在手机上装一次根证书并信任（iOS 走描述文件 + 证书信任设置，Android 走
  安装 CA 证书），否则浏览器会拒绝该主机的 WebSocket，界面停在「重新连接中」。
- 明文模式下，局域网上的其他人能看到链接里的令牌；这是用「口令代替加密」换来的便利。
- 二维码由插件自己生成（字节模式，纠错等级 M，版本 1 到 10），超过 213 字节的链接无法编码。

## 开发

```bash
npm test                 # frontmatter、技能内核接线与投影、MCP 客户端、二维码编码器、局域网代理、联网搜索、宿主接线、面板渲染
npm run check:vendored   # 校验 skills/、rewind/ 与 client.js 内联片段与钉住的哈希一致（手改或升级上游后跑 --update 重钉）
```

桌面版 GUI 只认应用自己打印的那条带令牌的 URL，别的浏览器打不开面板。想看界面但不开 GUI，用离线预览：
它用真实的 `client.js`、真实的 Host 主题样式和假的 `/api/manager` 回答渲染同一个面板。

```bash
npm install --prefix /tmp/dsh-preview-cache react@18 react-dom@18   # 只需要 React 18 的 UMD 包
DSH_NODE_EXECUTABLE="/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" \
  node harness/tool/panel-preview.mjs --react-dir /tmp/dsh-preview-cache/node_modules
# [preview] http://127.0.0.1:8123/ (tab: tools)
```

预览页带 `?lang=en` 切英文；主题跟着 `body[data-ds-dark-theme]` 走，加这个属性就是暗色。

源码地图：

| 文件 | 职责 |
|---|---|
| `index.js` | 宿主入口：技能内核挂载、MCP、搜索、局域网监听与 `/api/manager` 路由 |
| `src/frontmatter.js` | `SKILL.md` frontmatter 子集解析器 |
| `skills/` | **自带的技能内核**（派生自 `@michengai/dsh-skills-manager`，见 `skills/NOTICE`）：来源发现、扫描、虚拟分类、回收站、导入导出、仓库订阅、项目作用域。48 条内核路由与下面的面板端点共用 `/api/manager` |
| `src/skills-kernel.js` | 把内核挂到这个插件的上下文上：收窄可见服务、补齐 Host 要求的 `requestBody`、`create_skill` 撞名时降级而不是中断挂载 |
| `src/skills-adapter.js` | 把内核的按来源快照投影成面板沿用的 `categories` 形状，旧端点因此不必知道内核的数据结构 |
| `src/mcp-client.js` | 无依赖的 stdio MCP 客户端与工具命名约定 |
| `src/mcp.js` | 服务行、连接、工具注册、基于凭证库的环境变量 |
| `src/lan-access.js` | 局域网地址探测、自签证书、HTTPS 反向代理 |
| `src/qr.js` | 无依赖的二维码编码器 |
| `src/settings.js` | 原子写入的管理器设置存储 |
| `src/search.js` | 渠道开关、优先级与模式、凭证解析、并发/回退、冷却、缓存、合并去重与超时 |
| `src/search-providers.js` | 37 个渠道的注册表与 HTTP/HTML/MCP 适配器 |
| `src/search-engines.js` | 18 个带 Key 渠道的请求/解析与 `KEY:ID` 约定 |
| `src/serp-engines.js` | 5 个中文 HTML 渠道的抓取、解析与反爬分类 |
| `src/search-route.js` | 智能路由：语言、意图、按次计费渠道排除 |
| `src/rerank.js` | 可选的 SiliconFlow 重排（无 Key 自动关闭） |
| `src/agent-search.js` | `ctx.web` provider 与 5 个 agent 工具（`web_search` / `search_source` / `research` / `video_search` / `weather`） |
| `src/platform-search.js` | 13 个平台的 keyless 站内搜索适配器（`search_source` 的 `target` 档） |
| `src/domain-search.js` | 41 个垂直源的 keyless 直查适配器（`search_source` 的垂类档） |
| `src/weather.js` | Open-Meteo 地理编码、当前天气与预报 |
| `src/video-search.js` | Bing Videos / DuckDuckGo Videos 免 Key 视频搜索 |
| `src/research.js` | 多查询 research、正文抓取、90 秒预算、证据分级与持久化正文缓存（`research.fromCache`） |
| `src/agent-fetch.js` | web_fetch 质量链：直连 → Exa → Firecrawl → Crawl4AI |
| `src/remote.js` | 面板端点与合并后的 Agent 目录视图 |
| `src/tool-catalog.js` | 把各板块的工具汇总成面板「工具」页的目录：技能内核、MCP、搜索桥 |
| `src/ui-enhancements.js` | 「UI 增强」页的功能清单：每个功能是本插件自己提供的一项增强，开关状态存在管理器自己的设置里 |
| `src/rewind.js` | 对话回退这个功能的开关与挂载：状态存在 `ui.features.rewind`，开关实时生效 |
| `rewind/` | **内置的对话回退功能**（取自 `dsh-rewind-plugin` 0.22.2，MIT，见 `rewind/NOTICE`）：宿主半边在 `index.js`，浏览器半边内联在 `client.js` 的 `rewind-client` 标记之间 |
| `src/agent-prompt.js` | 联网搜索的系统提示词段与工具分工 |
| `src/safe-text.js` | 工具输出/抓取正文的安全截断（按码点、清理半个 surrogate） |
| `src/search-error.js` | 搜索渠道错误分类与用户可读消息 |
| `client.js` | 侧边栏入口与管理页面（技能、MCP、联网搜索、UI 增强、偏好、局域网、工具） |
