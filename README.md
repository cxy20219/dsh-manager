# dsh-manager

DeepSeek Harness Web UI 左侧的一个入口，管理 Agent 运行所需的东西，以及你怎么访问它：
**技能**、**MCP 服务**、**联网搜索**、**模式**、**局域网访问**。

- **技能** — 自带一套完整的技能管理内核（`skills/`，派生自 `@michengai/dsh-skills-manager`，Apache-2.0）。
  **不依赖任何其他技能插件**，装这一个就够。内核发现本机 20+ 个 Agent 技能来源（`~/.dsh/skills`、
  `~/.agents/skills`、Claude Code、Codex、Cursor、Windsurf、Trae、Copilot、Qoder、OpenClaw 等）。
  **默认只启用 `~/.dsh/skills` 与 `~/.agents/skills`**，其它来源在面板里按需打开——新装或升级都不会
  悄悄把别的 Agent 目录里的技能喂给本 Agent。每个来源可整体启停，单个技能也可启停；同名技能按来源
  rank 决胜，其余记为副本而不是重复列出。
- **技能界面** — 三栏工作台：左栏来源、中栏技能列表（同名副本自动折叠成 `+N`）、右栏详情
  （简介、token 估算、自定义备注、SKILL.md 正文、源文件路径）。备注只存在本插件，绝不写回 `SKILL.md`。
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
  同一套渠道也注册为 agent 的 `ctx.web` provider `dsh-manager` 以及 `web_search` / `advanced_search` /
  `platform_search` / `domain_search` / `weather` / `video_search` / `research` / `cache_search` /
  `free_search_test` 工具，替代停用的 dsh-free-search 的核心搜索链路。
- **模式** — DSH 的「模式」就是 Agent 预设：一份插件行清单，决定新会话拿到哪些工具和提示词。这个标签
  管理本插件自己注册的模式，开关就是注册 / 注销，不写 profile 补丁、不需要重启。内置的「简单」模式是
  标准模式去掉定时任务、工作流与插件管理之后的样子。
- **局域网访问** — 一个开关，在本机的局域网地址上开一个入口。面板给出二维码；手机或平板扫码后用浏览器
  打开的就是同一个 GUI，操作权限与本机浏览器完全一致。默认明文 HTTP，链接里的令牌就是口令，扫码即用；
  也可以打开 HTTPS，但那样要在手机上装一次根证书。监听器只在开关打开时存在，并且只绑定一个具体地址，
  绝不绑定所有网卡。

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

- **目录不存在就不显示**：面板左栏把未安装的来源单独归到「未安装」，不占主列表。
- **同名技能只显示生效的那一个**：多个来源有同名副本时，按来源 rank 决胜，其余折叠成 `+N` 标记，
  不重复占行。内核以 overlay provider 注册（rank 399–500），确保停用动作真的生效。
- **解析失败的技能默认不显示**：想看到它们就勾选「显示异常项」。
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
- 注册十个 agent 工具：`web_search`（`queries` 数组，合并去重，最多 3 个查询）、`advanced_search`
  （单个查询 + 固定时间过滤）、`multi_search`（指定渠道并发合并）、`platform_search`（13 个平台站内搜索）、
  `domain_search`（41 个垂直源直查）、
  `weather`（Open-Meteo 当前天气 + 1-7 天预报）、`video_search`（Bing Videos + DuckDuckGo Videos）和
  `research`（多查询 + 直接抓正文 + 质量分级）、`cache_search`（全文检索 research 抓过的正文）和
  `free_search_test`（按渠道测试）。新会话或重新加载后可见；已经打开的会话不会自动刷新工具表。
- 注入一段系统提示词段「联网搜索（dsh-manager）」：说明当前搜索模式、已启用的渠道，以及「搜索只返回候选、
  要正文用 web_fetch 或 research」的分工。渠道开关变化时重新注册；文本里没有每次搜索都会变的计数，
  长会话的提示词前缀缓存不会因此反复失效。
- `platform_search` 支持 GitHub / V2EX / Bilibili / Reddit / Hacker News / Stack Overflow / Wikipedia / npm /
  YouTube / Vimeo / 掘金 / 豆瓣 / Qiita。X (Twitter) 需要本地 Grok Build CLI，暂未搬。
- agent 侧和面板共用同一份开关、优先级、Key、冷却和缓存。停用 dsh-free-search 后，至少要在面板启用一个渠道，
  否则 `web_search` 会报“没有启用的搜索渠道”。首次启动且没有任何免费渠道启用时，插件会一次性启用 Bing + Exa
  作为零 Key 兜底；之后手动关闭不会被重新打开。
- `advanced_search` 和面板的时间下拉支持 `day` / `week` / `month` / `year` 四档；会把过滤参数映射到
  Bing、DuckDuckGo、Tavily、Firecrawl、Parallel、Keenable、SearXNG、Brave，以及有 Key 的 Exa。Exa 的
  免 Key MCP 档、You/AnySearch/Jina/DeepSeek/MiniMax 暂不支持；Bing 没有“一年”档。不支持的渠道仍会返回
  结果，只是不加这个参数；暂不支持自定义日期区间。
- `domain_search` 支持包/版本（PyPI、crates、GitHub releases、endoflife、Maven/NuGet 等）、学术
  （Crossref、OpenAlex、Semantic Scholar、arXiv、PubMed、dblp 等）、安全（NVD、OSV、CISA KEV）、
  金融（SEC、IMF、World Bank、CFETS 等）、新闻（Google News、GDELT）、法律和中文站等 41 个源。
- `video_search` 跨站搜视频；要按站点搜 YouTube / Vimeo / B 站，用 `platform_search`。
- `research`：按中英文生成 1/3/5 个查询变体、合并搜索结果（同一站点最多 3 个来源，质量域按 eTLD+1 计数），
  先做词法重排；配置了 `SILICONFLOW_API_KEY`（宿主凭据或环境变量）时再用 `BAAI/bge-reranker-v2-m3` 重排，
  失败静默回退。整个运行共享 90 秒预算；第一轮证据偏薄且还有时间时，会再抓 2 个页面（升级检索）。
  正文通过 `dsh-manager-fetch` 质量链抓取，最后给出 `high/medium/low` 证据分级，预算耗尽或抓取全失败会降级为
  `low` 并标注 `degraded`。带 SSRF 防护（只抓公网 http/https）。
  `cache_search` 检索 research 抓过的正文，7 天过期，持久化到 manager 数据目录的 `research-cache.json`
  （最多 200 篇，重启保留）。
- 没有搬过来的能力：free-search 的无头浏览器抓取层（需要本机 Chrome/Edge CLI）、独立 MCP server，
  以及依赖 Grok Build CLI 的 X 搜索。除此之外，free-search 的搜索、路由、冷却、缓存、research 与抓取链都已接上。
- `web.searchProvider` / `web.fetchProvider` 的接管会写 profile 的 `web` 配置；这是为了修掉 free-search
  停用后残留的 `ddg` / `fs-quality-fetch` 指针。抓取 provider 会切到 `dsh-manager-fetch`（直连 → Exa →
  Firecrawl → Crawl4AI）；注册失败时回退 `http`。如果你明确指定了别的 provider，本插件不会覆盖。

## 模式

「模式」就是 DSH 的 Agent 预设：一份插件行清单，决定新会话拿到哪些工具、哪些提示词段。这个标签管理的是
**本插件自己注册的模式**；DSH 自带的标准 / 极简 / 创造 / PTC 由应用提供，这里不开关它们。

- **开关 = 注册 / 注销**。打开时调用 Host 的 `agentPresets.register()`，关闭时调用它返回的注销函数。
  不写 profile 补丁，不需要重启，也不给插件增加任何 `@deepseek-ai/*` 依赖。
- **只影响之后新建的会话**。已经开着的会话保持它创建时的组合——注册表会为旧代际保留挂载树，直到最后一个
  会话释放它。
- **失败不吞掉**。挂载失败会在行上显示「挂载失败」和注册表给出的具体诊断；开关仍保持你选的状态，因为那是
  你的意图，注册是否成功是另一回事。开关状态存在管理器设置的 `modes.enabled` 里，重启后按它恢复。

内置的「简单」模式 = 标准模式去掉三块：

| 去掉 | 为什么 |
|---|---|
| `tool-schedule` | 定时任务用得少；演化器自己的定时器不走这条链路 |
| `workflow-ptc` + `tool-workflow` | 工作流编排是标准模式里最大的一块工具描述 |
| `tool-plugin-manager` | 插件管理走左侧管理器 |

保留下来的有：读 / 写 / 搜索、持久 shell、后台任务、长目标、计划模式、技能目录、子 agent（含 fork 与控制
三件套）、待办、联网、交付物。计划模式的引导文本换成了更短的一版，契约不变：先探索、不改文件、只通过
`exit_plan_mode` 提交计划。

「查看组成」按挂载顺序列出每一行及其插件名，并标出相对标准模式去掉了哪些——不用翻源码就能核对差异。

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
- 新建技能写在当前来源下（默认 `~/.dsh/skills`）；`SKILL.md` 的正文和 frontmatter 由内核按与上游一致的
  规则校验，非法名会被拒绝而不是清洗。
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
- 「模式」只管本插件注册的那些；DSH 自带预设在应用侧，这个标签不提供它们的开关。
- 模式挂在 Host 的 `agentPresets` 注册表上。没有这个服务的组合（例如 TUI）里，整页只显示原因，不做降级。
- 关闭一个模式不会结束正在运行的会话，也不会收回别的会话正在用的组合。
- 挂载失败的模式仍会出现在 DSH 自己的模式设置页，状态是「不可用」——两处看到的是同一份注册表。
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
npm test                 # frontmatter、技能内核接线与投影、MCP 客户端、二维码编码器、局域网代理、联网搜索、模式、宿主接线、面板渲染
npm run check:vendored   # 校验 skills/ 与钉住的哈希一致（手改或升级上游后跑 --update 重钉）
```

源码地图：

| 文件 | 职责 |
|---|---|
| `index.js` | 宿主入口：技能内核挂载、MCP、模式、搜索、局域网监听与 `/api/manager` 路由 |
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
| `src/agent-search.js` | `ctx.web` provider 与 10 个 agent 工具（`web_search` / `advanced_search` / `multi_search` / `platform_search` / `domain_search` / `weather` / `video_search` / `research` / `cache_search` / `free_search_test`） |
| `src/platform-search.js` | 13 个平台的 keyless 站内搜索适配器 |
| `src/domain-search.js` | 41 个垂直源的 keyless 直查适配器 |
| `src/weather.js` | Open-Meteo 地理编码、当前天气与预报 |
| `src/video-search.js` | Bing Videos / DuckDuckGo Videos 免 Key 视频搜索 |
| `src/research.js` | 多查询 research、正文抓取、90 秒预算、证据分级与持久化 cache_search |
| `src/agent-fetch.js` | web_fetch 质量链：直连 → Exa → Firecrawl → Crawl4AI |
| `src/modes.js` | 内置模式的行清单，以及注册 / 注销的生命周期与失败上抛 |
| `src/remote.js` | 面板端点与合并后的 Agent 目录视图 |
| `src/agent-prompt.js` | 联网搜索的系统提示词段与工具分工 |
| `src/safe-text.js` | 工具输出/抓取正文的安全截断（按码点、清理半个 surrogate） |
| `src/search-error.js` | 搜索渠道错误分类与用户可读消息 |
| `client.js` | 侧边栏入口与管理页面（技能、MCP、联网搜索、模式、局域网） |
