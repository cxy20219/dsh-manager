/*
 * dsh-manager — browser half.
 *
 * One sidebar entry opens one management page with four tabs:
 * 技能 (hierarchical categories under ~/.agents/skills), MCP (stdio servers),
 * 联网搜索 (the Host web seam) and 局域网访问 (the LAN listener).
 *
 * The panel only talks to `/api/manager`, served by the Host half. Skill
 * bodies are read on demand; the catalog stays a list of summaries until a
 * category or skill is enabled and a loaded body is requested.
 */
window.__ModuleLoader__.load({
	id: 'dsh-manager',
	factory: function (require) {
		var react = require('react');

		var h = react.createElement;
		var useState = react.useState;
		var useEffect = react.useEffect;
		var useCallback = react.useCallback;
		var useRef = react.useRef;

		var NS = 'dsh-manager';
		var PANEL_ID = 'manager';
		var PANEL_ORDER = 20;
		var API_PREFIX = '/api/manager';

		//#region locale

		var zh = {
			'panel': '管理器',
			'subtitle': '技能分类、MCP 服务、联网搜索、模式与局域网访问',
			'tab.skills': '技能',
			'tab.mcp': 'MCP',
			'tab.search': '联网搜索',
			'action.refresh': '重新扫描',
			'action.close': '关闭',
			'action.cancel': '取消',
			'action.create': '创建',
			'action.edit': '编辑',
			'action.delete': '删除',
			'action.reconnect': '重新连接',
			'action.retry': '重试',
			'state.loading': '读取中…',
			'state.saved': '已保存',
			'state.deleted': '已删除',
			'state.created': '已创建',
			'state.refreshed': '已重新扫描',
			'skills.search': '搜索技能或分类…',
			'skills.new': '新建技能',
			'skills.refresh': '重新扫描',
			'skills.count': '{categories} 个分类 · {skills} 个技能 · {enabled} 个生效',
			'skills.catalog': 'Agent 目录 {total} 个技能（模型可见 {visible}）· 本插件 {managed} · 其他来源 {external}',
			'skills.catalogNames': '：{names}',
			'skills.catalogMissing': '{n} 个已启用的技能没有进入 Agent 目录：{names}。可能是同名技能被更高优先级的来源覆盖，或该来源没有列出。',
			'skills.catalogError': '读取 Agent 目录失败：{error}',
			'skills.catalogUnavailable': '当前 Host 没有技能注册表，无法核对 Agent 目录。',
			'skills.roots': '扫描目录',
			'skills.rootMissing': '目录不存在',
			'skills.rootError': '无法读取',
			'skills.categoryEmpty': '这个分类下还没有技能',
			'skills.categoryDisabled': '分类已停用',
			'skills.skillDisabled': '已停用',
			'skills.conflict': '重名，未注册',
			'skills.conflictWith': '与 {owner} 重名',
			'skills.broken': '解析失败',
			'skills.modelHidden': '模型不主动调用',
			'skills.userHidden': '用户不可调用',
			'skills.empty': '没有匹配的技能。新建一个，或检查扫描目录。',
			'skills.detail.description': '描述',
			'skills.detail.whenToUse': '何时使用',
			'skills.detail.path': '文件',
			'skills.detail.content': '正文',
			'skills.detail.invocation': '调用策略',
			'skills.detail.invocation.both': '模型与用户都可调用',
			'skills.detail.invocation.modelOnly': '仅模型可调用',
			'skills.detail.invocation.userOnly': '仅用户可调用',
			'skills.detail.invocation.none': '都不可调用',
			'skills.create.title': '新建技能',
			'skills.create.category': '分类',
			'skills.create.categoryHint': '例如 dev、office；不存在时自动创建目录。',
			'skills.create.name': '技能名',
			'skills.create.nameHint': 'kebab-case，例如 webapp-testing。',
			'skills.create.description': '描述',
			'skills.create.descriptionHint': '一句话说明什么时候用它；这段文字会进入 Agent 的技能目录。',
			'skills.create.location': '创建到 {path}',
			'skills.create.invalidCategory': '分类名只能包含字母、数字、点、横线和下划线',
			'skills.create.invalidName': '技能名必须是 kebab-case',
			'skills.create.invalidDescription': '请填写描述',
			'mcp.note': 'stdio 启动；工具以 mcp__<服务>__<工具> 注入 Agent。环境变量的值保存在本机凭证库，面板不回显。',
			'mcp.add': '添加 MCP 服务',
			'mcp.empty': '还没有 MCP 服务。添加一个本地 stdio 服务，它的工具会出现在 Agent 的工具列表里。',
			'mcp.unavailable': 'Host 没有提供 tools 服务，MCP 工具无法注册。',
			'mcp.noCredentials': 'Host 没有提供凭证服务，环境变量无法保存；不填环境变量仍可使用。',
			'mcp.state.connecting': '连接中',
			'mcp.state.ready': '已连接',
			'mcp.state.error': '连接错误',
			'mcp.state.stopped': '未启用',
			'mcp.toolsCount': '{n} 个工具',
			'mcp.showTools': '查看工具',
			'mcp.hideTools': '收起工具',
			'mcp.toolsEmpty': '这个服务没有提供工具。',
			'mcp.envKeys': '环境变量',
			'mcp.noEnv': '无',
			'mcp.stderr': '最近输出',
			'mcp.deleteConfirm': '确认删除',
			'mcp.form.addTitle': '添加 MCP 服务',
			'mcp.form.editTitle': '编辑 MCP 服务',
			'mcp.form.name': '服务名',
			'mcp.form.nameHint': '工具命名空间：字母、数字、下划线或横线，最长 32。',
			'mcp.form.command': '启动命令',
			'mcp.form.commandHint': '例如 npx、uvx 或绝对路径。',
			'mcp.form.args': '参数',
			'mcp.form.argsHint': '每行一个参数，例如 -y 和包名。',
			'mcp.form.cwd': '工作目录',
			'mcp.form.cwdHint': '可选，必须是绝对路径。',
			'mcp.form.env': '环境变量',
			'mcp.form.envHint': '每行一个 KEY=VALUE。',
			'mcp.form.envSaved': '已保存 {n} 个变量：{keys}',
			'mcp.form.envKeep': '留空表示保持不变；填写则整体替换。',
			'mcp.form.clearEnv': '清空已保存的环境变量',
			'mcp.form.enabled': '保存后立即启用',
			'mcp.form.invalidEnv': '环境变量格式不对：每行 KEY=VALUE，名称只能包含字母、数字、下划线',
			'mcp.form.required': '请填写服务名和启动命令',
			'mcp.form.submit': '保存',
			'search.noteMerge': '查询会并发发给所有已启用的渠道，按 URL 去重后合并；每个渠道单独显示成功或失败。',
			'search.noteFallback': '按渠道优先级逐个尝试，第一个返回结果的渠道生效；失败渠道会短暂冷却。',
			'search.mode': '搜索模式',
			'search.time': '时间',
			'search.timeAny': '不限',
			'search.timeDay': '一天',
			'search.timeWeek': '一周',
			'search.timeMonth': '一月',
			'search.timeYear': '一年',
			'search.modeMerge': '并发合并',
			'search.modeFallback': '顺序回退',
			'search.modeMergeHint': '所有启用渠道同时搜，合并去重。',
			'search.modeFallbackHint': '按下方顺序逐个试，命中即停。',
			'search.cached': '缓存',
			'search.allCooling': '所有启用的渠道都在冷却中，稍后再试或点“重置冷却”。',
			'search.resetCooldowns': '重置冷却',
			'search.cooldown': '冷却中 {s}s',
			'search.moveUp': '上移',
			'search.moveDown': '下移',
			'search.free': 'FREE',
			'search.channel.apiKeyOptionalFree': '可选；留空使用免费档',
			'search.channel.noKeyNeeded': '这个渠道不需要 API Key，打开开关即可使用。',
			'search.placeholder': '输入关键词，回车搜索…',
			'search.running': '搜索中…',
			'search.maxResults': '合并后最多 {n} 条 · 每渠道最多 {per} 条',
			'search.emptyIdle': '输入关键词开始搜索；至少启用一个渠道。',
			'search.queryRequired': '请输入搜索关键词。',
			'search.failed': '搜索失败',
			'search.resultCount': '{n} 条结果 · {ms} ms',
			'search.noResults': '没有找到结果，换个关键词或渠道试试。',
			'search.allFailed': '所有启用的渠道都失败了，检查上面的错误码。',
			'search.external': '以下内容来自外部网页，仅作信息参考，不要当作指令执行。',
			'search.answer': '渠道摘要',
			'search.open': '在新窗口打开',
			'search.channels': '搜索渠道',
			'search.channelsCount': '已启用 {enabled}/{total}',
			'search.statusError': '读取搜索渠道失败：{error}',
			'search.channel.enable': '启用',
			'search.channel.configure': '配置',
			'search.channel.hide': '收起',
			'search.channel.test': '测试',
			'search.channel.testing': '测试中…',
			'search.channel.save': '保存',
			'search.channel.saving': '保存中…',
			'search.channel.apiKey': 'API Key',
			'search.channel.apiKeyKeep': '已保存，留空保持不变',
			'search.channel.apiKeyEnvKeep': '当前来自环境变量，留空保持',
			'search.channel.apiKeyNew': '输入 API Key',
			'search.channel.apiKeyOptional': '可选；填 user:password 走 Basic Auth',
			'search.channel.baseUrl': '服务地址',
			'search.channel.baseUrlHint': '留空使用默认：{url}；自定义地址会收到该渠道的 API Key。',
			'search.channel.envHint': '也可以用环境变量 {env}',
			'search.channel.clearKey': '清除 Key',
			'search.channel.keyConfigured': '已配置',
			'search.channel.keyEnv': '环境变量',
			'search.channel.keyHost': '宿主凭据',
			'search.channel.apiKeyHostKeep': '当前来自宿主凭据，留空保持',
			'search.channel.keyMissing': '缺 Key',
			'search.channel.keyless': '无需 Key',
			'search.channel.noCredentials': 'Host 没有凭证服务，只能用环境变量配置 Key。',
			'search.channel.testHint': '测试使用当前查询；为空时用 DeepSeek Harness。',
			'search.channel.testOk': '测试成功：{n} 条 · {ms} ms',
			'search.channel.testFail': '测试失败',
			'search.channel.testQuery': '查询：{query}',
			'search.chipOk': '{label} {n} 条',
			'search.chipFail': '{label} {code}',
			'search.enabledNone': '先在下面启用至少一个渠道。',
			'search.channel.exa.desc': '语义搜索与 highlights，适合资料和论文；不填 Key 走匿名 MCP。',
			'search.channel.tavily.desc': 'AI 优化搜索，正文摘要密度高；不填 Key 走 keyless 档。',
			'search.channel.firecrawl.desc': '带正文片段的搜索引擎，适合资料聚合；不填 Key 走免 Key 档。',
			'search.channel.parallel.desc': 'Agent 优化的搜索与摘录；不填 Key 走匿名 MCP。',
			'search.channel.brave.desc': '独立搜索索引，优先使用 LLM Context。',
			'search.channel.you.desc': 'AI 搜索，支持 highlights 与新闻结果；不填 Key 走每日免费档。',
			'search.channel.jina.desc': 'Reader 体系里的搜索接口，按 token 计费。',
			'search.channel.keenable.desc': '通用 Web 搜索 API，description 优先；不填 Key 走匿名 MCP。',
			'search.channel.searxng.desc': '自建元搜索；填实例地址即可，无需 API Key（需开启 JSON 输出）。',
			'search.channel.deepseek.desc': 'DeepSeek 原生联网搜索（Messages + web_search，按对话调用计费）。',
			'search.channel.minimax.desc': 'MiniMax Token Plan 网页搜索，单次最多 10 条；默认 global，CN Key 自动回退 api.minimaxi.com。',
			'search.channel.bing.desc': 'Bing 网页搜索，无需 Key；HTML 抓取，可能被反爬限流。',
			'search.channel.ddg.desc': 'DuckDuckGo HTML/Lite，无需 Key；反爬时自动切换 Lite。',
			'search.channel.anysearch.desc': 'AnySearch 匿名搜索，无需 Key；可选 Key 提高额度。',
			'error.banner': '操作失败',
			'tab.lan': '局域网访问',
			'lan.title': '局域网访问',
			'lan.hint': '打开后，本机会在局域网地址上开一个加密入口。手机或平板扫码即可在浏览器里打开这个 DSH，操作与本机一致。',
			'lan.switch': '启用局域网访问',
			'lan.switchHint': '关闭时端口立即收回，不会再对局域网提供服务。',
			'lan.off': '当前未开启。开启后这里会显示二维码和访问链接。',
			'lan.starting': '正在开启…',
			'lan.running': '已开启',
			'lan.stopped': '已关闭',
			'lan.qr': '扫码打开',
			'lan.qrHint': '用手机相机或浏览器扫码打开；首次访问需要手动信任自签证书。',
			'lan.url': '访问链接',
			'lan.copy': '复制链接',
			'lan.copied': '已复制',
			'lan.address': '局域网地址',
			'lan.upstream': '转发到',
			'lan.certificate': '证书指纹',
			'lan.certificateValid': '证书有效期',
			'lan.tokenWarning': '链接里带着本机的启动令牌，等同于管理员权限，不要分享给别人。关闭开关后链接立即失效。',
			'lan.certWarning': '证书由本机根证书签发，不是公开 CA 签的；手机信任上面那个根证书之后，浏览器就不会再提示不安全。',
			'lan.noAddress': '没有检测到局域网 IPv4 地址，请先连上局域网。',
			'lan.secure': '加密连接（HTTPS）',
			'lan.secureHint': '默认关闭：明文 HTTP，但链接里的令牌就是口令，扫码即用。打开后走 HTTPS，代价是要在手机上装一次根证书，否则浏览器会拒绝该主机的 WebSocket。',
			'lan.trust': '手机信任证书',
			'lan.trustHint': '浏览器可以点"继续访问"打开页面，但 WebSocket 会被直接拒绝，所以要先把根证书装到手机上并信任它。装一次即可，之后扫码即用。',
			'lan.downloadCa': '下载根证书',
			'lan.caDownloaded': '根证书已下载',
			'lan.ios': 'iPhone / iPad：先下载根证书，再用「设置 → 通用 → VPN 与设备管理」安装描述文件，再到「设置 → 通用 → 关于本机 → 证书信任设置」里打开对这个根证书的完全信任。',
			'lan.android': 'Android：先下载根证书，再到「设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书」里选中它。',
			'lan.error': '开启失败',
			'lan.addresses': '检测到的地址',
			'tab.modes': '模式',
			'modes.hint': '模式就是 Agent 预设：一份插件行清单，决定新会话拿到哪些工具和提示词。开关只影响之后新建的会话，已经开着的会话保持原样。DSH 自带的标准、极简、创造和 PTC 由应用提供，不在这里管理。',
			'modes.owned': '本插件提供',
			'modes.on': '已启用',
			'modes.off': '已关闭',
			'modes.pending': '正在挂载',
			'modes.registered': '已挂载',
			'modes.unregistered': '未挂载',
			'modes.rows': '行',
			'modes.composition': '查看组成',
			'modes.removed': '相对标准模式去掉',
			'modes.failed': '挂载失败',
			'modes.unavailable': '当前 Host 没有模式服务（agentPresets），这个标签只在带 Agent 预设的组合里可用。',
			'modes.empty': '没有可以管理的模式。',
		};

		var en = {
			'panel': 'Manager',
			'subtitle': 'Skill categories, MCP servers, web search, modes and LAN access',
			'tab.skills': 'Skills',
			'tab.mcp': 'MCP',
			'tab.search': 'Web search',
			'action.refresh': 'Rescan',
			'action.close': 'Close',
			'action.cancel': 'Cancel',
			'action.create': 'Create',
			'action.edit': 'Edit',
			'action.delete': 'Delete',
			'action.reconnect': 'Reconnect',
			'action.retry': 'Retry',
			'state.loading': 'Loading…',
			'state.saved': 'Saved',
			'state.deleted': 'Deleted',
			'state.created': 'Created',
			'state.refreshed': 'Rescanned',
			'skills.search': 'Search skills or categories…',
			'skills.new': 'New skill',
			'skills.refresh': 'Rescan',
			'skills.count': '{categories} categories · {skills} skills · {enabled} active',
			'skills.catalog': 'Agent catalog: {total} skills ({visible} model-visible) · {managed} from this manager · {external} from other providers',
			'skills.catalogNames': ': {names}',
			'skills.catalogMissing': '{n} active skills are missing from the agent catalog: {names}. A same-name skill from a higher-priority provider may shadow them, or that provider failed to list.',
			'skills.catalogError': 'Could not read the agent catalog: {error}',
			'skills.catalogUnavailable': 'This Host has no skill registry, so the agent catalog cannot be checked.',
			'skills.roots': 'Scanned roots',
			'skills.rootMissing': 'Directory missing',
			'skills.rootError': 'Unreadable',
			'skills.categoryEmpty': 'No skills in this category yet',
			'skills.categoryDisabled': 'Category disabled',
			'skills.skillDisabled': 'Disabled',
			'skills.conflict': 'Duplicate name, not registered',
			'skills.conflictWith': 'Duplicates {owner}',
			'skills.broken': 'Parse failed',
			'skills.modelHidden': 'Not model-invocable',
			'skills.userHidden': 'Not user-invocable',
			'skills.empty': 'No matching skills. Create one, or check the scanned roots.',
			'skills.detail.description': 'Description',
			'skills.detail.whenToUse': 'When to use',
			'skills.detail.path': 'File',
			'skills.detail.content': 'Body',
			'skills.detail.invocation': 'Invocation',
			'skills.detail.invocation.both': 'Model and user invocable',
			'skills.detail.invocation.modelOnly': 'Model invocable only',
			'skills.detail.invocation.userOnly': 'User invocable only',
			'skills.detail.invocation.none': 'Not invocable',
			'skills.create.title': 'New skill',
			'skills.create.category': 'Category',
			'skills.create.categoryHint': 'For example dev or office; the directory is created when missing.',
			'skills.create.name': 'Skill name',
			'skills.create.nameHint': 'kebab-case, for example webapp-testing.',
			'skills.create.description': 'Description',
			'skills.create.descriptionHint': 'One sentence about when to use it; this text enters the agent skill catalog.',
			'skills.create.location': 'Creates {path}',
			'skills.create.invalidCategory': 'Category names only allow letters, numbers, dots, dashes and underscores',
			'skills.create.invalidName': 'Skill names must be kebab-case',
			'skills.create.invalidDescription': 'A description is required',
			'mcp.note': 'Started over stdio; tools reach the agent as mcp__<server>__<tool>. Environment values live in the Host credential store and are never shown here.',
			'mcp.add': 'Add MCP server',
			'mcp.empty': 'No MCP servers yet. Add a local stdio server and its tools join the agent tool list.',
			'mcp.unavailable': 'The Host has no tools service, so MCP tools cannot register.',
			'mcp.noCredentials': 'The Host has no credential service, so environment values cannot be saved; the server still works without them.',
			'mcp.state.connecting': 'Connecting',
			'mcp.state.ready': 'Connected',
			'mcp.state.error': 'Error',
			'mcp.state.stopped': 'Disabled',
			'mcp.toolsCount': '{n} tools',
			'mcp.showTools': 'Show tools',
			'mcp.hideTools': 'Hide tools',
			'mcp.toolsEmpty': 'This server exposes no tools.',
			'mcp.envKeys': 'Environment',
			'mcp.noEnv': 'None',
			'mcp.stderr': 'Recent output',
			'mcp.deleteConfirm': 'Delete now',
			'mcp.form.addTitle': 'Add MCP server',
			'mcp.form.editTitle': 'Edit MCP server',
			'mcp.form.name': 'Server name',
			'mcp.form.nameHint': 'Tool namespace: letters, numbers, underscores or dashes, up to 32.',
			'mcp.form.command': 'Command',
			'mcp.form.commandHint': 'For example npx, uvx, or an absolute path.',
			'mcp.form.args': 'Arguments',
			'mcp.form.argsHint': 'One argument per line, for example -y and the package name.',
			'mcp.form.cwd': 'Working directory',
			'mcp.form.cwdHint': 'Optional; must be absolute.',
			'mcp.form.env': 'Environment',
			'mcp.form.envHint': 'One KEY=VALUE per line.',
			'mcp.form.envSaved': '{n} stored variables: {keys}',
			'mcp.form.envKeep': 'Leave empty to keep them; entries replace the whole set.',
			'mcp.form.clearEnv': 'Clear the stored environment',
			'mcp.form.enabled': 'Start it after saving',
			'mcp.form.invalidEnv': 'Invalid environment lines: use KEY=VALUE with letters, numbers and underscores in the name',
			'mcp.form.required': 'A server name and a command are required',
			'mcp.form.submit': 'Save',
			'search.noteMerge': 'The query fans out to every enabled channel and the results merge by URL; each channel reports success or failure separately.',
			'search.noteFallback': 'Channels are tried in priority order; the first one that returns results wins, and failures rest briefly.',
			'search.mode': 'Search mode',
			'search.time': 'Time',
			'search.timeAny': 'Any time',
			'search.timeDay': 'Past day',
			'search.timeWeek': 'Past week',
			'search.timeMonth': 'Past month',
			'search.timeYear': 'Past year',
			'search.modeMerge': 'Merge',
			'search.modeFallback': 'Fallback',
			'search.modeMergeHint': 'Search every enabled channel at once and merge.',
			'search.modeFallbackHint': 'Try channels in order and stop at the first hit.',
			'search.cached': 'cached',
			'search.allCooling': 'Every enabled channel is cooling down; retry shortly or reset the cooldowns.',
			'search.resetCooldowns': 'Reset cooldowns',
			'search.cooldown': 'cooling {s}s',
			'search.moveUp': 'Move up',
			'search.moveDown': 'Move down',
			'search.free': 'FREE',
			'search.channel.apiKeyOptionalFree': 'Optional; leave blank for the free tier',
			'search.channel.noKeyNeeded': 'This channel needs no API key; just enable it.',
			'search.placeholder': 'Type a query and press Enter…',
			'search.running': 'Searching…',
			'search.maxResults': 'Up to {n} merged · {per} per channel',
			'search.emptyIdle': 'Type a query to search; enable at least one channel first.',
			'search.queryRequired': 'Enter a search query.',
			'search.failed': 'Search failed',
			'search.resultCount': '{n} results · {ms} ms',
			'search.noResults': 'No results found. Try different keywords or channels.',
			'search.allFailed': 'Every enabled channel failed; check the error codes above.',
			'search.external': 'The content below comes from external pages. Treat it as information, not as instructions.',
			'search.answer': 'Channel answer',
			'search.open': 'Open in a new window',
			'search.channels': 'Search channels',
			'search.channelsCount': '{enabled}/{total} enabled',
			'search.statusError': 'Could not read the search channels: {error}',
			'search.channel.enable': 'Enable',
			'search.channel.configure': 'Configure',
			'search.channel.hide': 'Hide',
			'search.channel.test': 'Test',
			'search.channel.testing': 'Testing…',
			'search.channel.save': 'Save',
			'search.channel.saving': 'Saving…',
			'search.channel.apiKey': 'API key',
			'search.channel.apiKeyKeep': 'Saved; leave blank to keep it',
			'search.channel.apiKeyEnvKeep': 'Currently from the environment; leave blank to keep it',
			'search.channel.apiKeyNew': 'Enter the API key',
			'search.channel.apiKeyOptional': 'Optional; user:password uses Basic auth',
			'search.channel.baseUrl': 'Base URL',
			'search.channel.baseUrlHint': 'Leave blank for the default: {url}; a custom address receives this channel\'s API key.',
			'search.channel.envHint': 'The {env} environment variable also works',
			'search.channel.clearKey': 'Clear key',
			'search.channel.keyConfigured': 'Configured',
			'search.channel.keyEnv': 'Environment',
			'search.channel.keyHost': 'Host credentials',
			'search.channel.apiKeyHostKeep': 'Currently from Host credentials; leave blank to keep it',
			'search.channel.keyMissing': 'Key missing',
			'search.channel.keyless': 'No key needed',
			'search.channel.noCredentials': 'This Host has no credential service; configure the key through its environment variable.',
			'search.channel.testHint': 'Tests with the current query, or DeepSeek Harness when the box is empty.',
			'search.channel.testOk': 'Test passed: {n} results · {ms} ms',
			'search.channel.testFail': 'Test failed',
			'search.channel.testQuery': 'Test query: {query}',
			'search.chipOk': '{label} {n}',
			'search.chipFail': '{label} {code}',
			'search.enabledNone': 'Enable at least one channel below first.',
			'search.channel.exa.desc': 'Semantic search with highlights; good for papers and references. Leave the key blank for anonymous MCP.',
			'search.channel.tavily.desc': 'AI-optimized search with dense page summaries. Leave the key blank for the keyless tier.',
			'search.channel.firecrawl.desc': 'Search with page excerpts; good for gathering references. Leave the key blank for the free tier.',
			'search.channel.parallel.desc': 'Agent-optimized search and excerpts. Leave the key blank for anonymous MCP.',
			'search.channel.brave.desc': 'Independent index; uses LLM Context when available.',
			'search.channel.you.desc': 'AI search with highlights and news results. Leave the key blank for the daily free tier.',
			'search.channel.jina.desc': 'Search API from the Reader family, billed by tokens.',
			'search.channel.keenable.desc': 'General web search API with description-first snippets. Leave the key blank for anonymous MCP.',
			'search.channel.searxng.desc': 'Self-hosted metasearch; point it at an instance, no API key needed (JSON output must be enabled).',
			'search.channel.deepseek.desc': 'DeepSeek native web search (Messages + web_search; billed as a model call).',
			'search.channel.minimax.desc': 'MiniMax Token Plan web search, up to 10 results; global by default, CN keys fall back to api.minimaxi.com.',
			'search.channel.bing.desc': 'Bing HTML search, no key required; may hit anti-bot limits.',
			'search.channel.ddg.desc': 'DuckDuckGo HTML/Lite, no key required; falls back to Lite when challenged.',
			'search.channel.anysearch.desc': 'Anonymous AnySearch; no key required, an optional key raises limits.',
			'error.banner': 'Action failed',
			'tab.lan': 'LAN access',
			'lan.title': 'LAN access',
			'lan.hint': 'When on, this machine opens an encrypted door on its LAN address. A phone or tablet can scan the code and open this Harness in a browser with the same powers.',
			'lan.switch': 'Enable LAN access',
			'lan.switchHint': 'Turning it off closes the port at once and the LAN sees nothing.',
			'lan.off': 'Currently off. Turn it on and the code and the link appear here.',
			'lan.starting': 'Starting…',
			'lan.running': 'On',
			'lan.stopped': 'Off',
			'lan.qr': 'Scan to open',
			'lan.qrHint': 'Scan with a phone camera or browser; the first visit asks you to trust the self-signed certificate.',
			'lan.url': 'Access link',
			'lan.copy': 'Copy link',
			'lan.copied': 'Copied',
			'lan.address': 'LAN address',
			'lan.upstream': 'Forwarded to',
			'lan.certificate': 'Certificate fingerprint',
			'lan.certificateValid': 'Certificate validity',
			'lan.tokenWarning': 'The link carries this machine\'s launch token and therefore administrator rights. Do not share it; turning the switch off invalidates it.',
			'lan.certWarning': 'The certificate is signed by the local root certificate, not by a public authority; once the phone trusts that root, the browser stops calling the page unsafe.',
			'lan.noAddress': 'No LAN IPv4 address was found; connect to a network first.',
			'lan.secure': 'Encrypted connection (HTTPS)',
			'lan.secureHint': 'Off by default: plain HTTP, with the token in the link acting as the password, so scanning is enough. Turning it on uses HTTPS, at the price of installing a root certificate on the phone once, because a browser refuses the WebSocket of an untrusted host.',
			'lan.trust': 'Trust the certificate on the phone',
			'lan.trustHint': 'A browser can let the page through its warning, but it refuses the WebSocket outright, so the root certificate has to be installed and trusted on the phone. Once, and scanning works.',
			'lan.downloadCa': 'Download root certificate',
			'lan.caDownloaded': 'Root certificate downloaded',
			'lan.ios': 'iPhone / iPad: download the root certificate, install the profile from Settings → General → VPN & Device Management, then enable full trust for it under Settings → General → About → Certificate Trust Settings.',
			'lan.android': 'Android: download the root certificate, then pick it under Settings → Security → Encryption & credentials → Install a certificate → CA certificate.',
			'lan.error': 'Could not start',
			'lan.addresses': 'Detected addresses',
			'tab.modes': 'Modes',
			'modes.hint': 'A mode is an agent preset: one list of plugin rows that decides the tools and prompt sections a new session gets. A switch only affects sessions created afterwards; running sessions keep what they started with. The standard, minimal, creator and PTC presets come from the app and are not managed here.',
			'modes.owned': 'from this plugin',
			'modes.on': 'On',
			'modes.off': 'Off',
			'modes.pending': 'Mounting',
			'modes.registered': 'Mounted',
			'modes.unregistered': 'Not mounted',
			'modes.rows': 'rows',
			'modes.composition': 'View composition',
			'modes.removed': 'Removed from the standard preset',
			'modes.failed': 'Could not mount',
			'modes.unavailable': 'This Host has no mode service (agentPresets); the tab only works in a composition with agent presets.',
			'modes.empty': 'No modes to manage.',
		};

		//#endregion

		//#region styles

		var css = [
			'.mgrRoot{position:relative;height:100%;display:flex;flex-direction:column;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}',
			'.mgrHead{display:flex;align-items:flex-start;gap:16px;padding:22px 28px 0;flex:none}',
			'.mgrHeadMain{flex:1;min-width:0}',
			'.mgrTitle{margin:0;font-size:18px;font-weight:600;line-height:26px;letter-spacing:-.01em}',
			'.mgrVersion{margin-left:8px;font-size:12px;font-weight:500;letter-spacing:0;color:var(--dsw-alias-label-tertiary);vertical-align:2px}',
			'.mgrSubtitle{margin-top:3px;font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			'.mgrHeadActions{display:flex;align-items:center;gap:8px;flex:none;padding-top:3px}',
			'.mgrTabs{display:flex;gap:4px;padding:16px 28px 0;flex:none;flex-wrap:wrap}',
			'.mgrTab{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border:1px solid transparent;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}',
			'.mgrTab:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
			'.mgrTab:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}',
			'.mgrTabActive{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary);font-weight:500;border-color:var(--dsw-alias-border-l2)}',
			'.mgrTabCount{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
			'.mgrBody{flex:1;min-height:0;overflow:auto;padding:18px 28px 36px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2) transparent}',
			'.mgrBody::-webkit-scrollbar{width:10px;height:10px}',
			'.mgrBody::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2);border:3px solid transparent;border-radius:6px;background-clip:content-box}',
			'.mgrToolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}',
			'.mgrToolbarSpacer{flex:1}',
			'.mgrHint{font-size:11.5px;color:var(--dsw-alias-label-tertiary);line-height:1.55;max-width:640px}',
			'.mgrBtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer;transition:background .15s ease,border-color .15s ease}',
			'.mgrBtn:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}',
			'.mgrBtn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}',
			'.mgrBtn[disabled]{opacity:.5;cursor:default}',
			'.mgrBtnPrimary{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-foreground)}',
			'.mgrBtnPrimary:hover{background:var(--dsw-alias-state-business-primary);filter:brightness(1.05)}',
			'.mgrBtnDanger{color:var(--dsw-alias-state-error-primary)}',
			'.mgrBtnDanger:hover{border-color:var(--dsw-alias-state-error-primary);background:transparent}',
			'.mgrIconBtn{flex:none;width:28px;height:28px;padding:0;border:1px solid transparent;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:16px;line-height:1;cursor:pointer}',
			'.mgrIconBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
			'.mgrInput,.mgrTextarea,.mgrSelect{width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:1.5}',
			'.mgrInput{height:32px}',
			'.mgrInput:focus,.mgrTextarea:focus,.mgrSelect:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}',
			'.mgrTextarea{min-height:76px;resize:vertical}',
			'.mgrToolbar .mgrInput{width:240px;flex:none}',
			'.mgrField{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}',
			'.mgrLabel{font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
			'.mgrFieldHint{font-size:11.5px;color:var(--dsw-alias-label-tertiary);line-height:1.55}',
			'.mgrStats{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px;font-size:12px;color:var(--dsw-alias-label-tertiary)}',
			'.mgrStats b{font-weight:600;color:var(--dsw-alias-label-secondary)}',
			'.mgrCatalog{margin:-4px 0 12px}',
			'.mgrRootPath{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;color:var(--dsw-alias-label-tertiary)}',
			'.mgrWarn{display:flex;align-items:flex-start;gap:8px;padding:9px 12px;margin-bottom:12px;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-state-warn-primary);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.6}',
			'.mgrErrorBox{display:flex;align-items:flex-start;gap:8px;padding:9px 12px;margin-bottom:12px;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-state-error-primary);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);font-size:12px;color:var(--dsw-alias-state-error-primary);line-height:1.6;word-break:break-word}',
			'.mgrCat{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);margin-bottom:10px;overflow:hidden}',
			'.mgrCatHead{display:flex;align-items:center;gap:8px;padding:9px 12px;min-height:40px;box-sizing:border-box}',
			'.mgrCatHead:hover{background:var(--dsw-alias-bg-layer-2)}',
			'.mgrChevron{flex:none;width:20px;height:20px;padding:0;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1;cursor:pointer}',
			'.mgrChevron:hover{color:var(--dsw-alias-label-primary)}',
			'.mgrCatName{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			'.mgrCount{flex:none;font-size:11.5px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
			'.mgrSpacer{flex:1}',
			'.mgrCatBody{border-top:1px solid var(--dsw-alias-border-l2)}',
			'.mgrSkill{display:flex;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid var(--dsw-alias-border-l1);cursor:pointer;transition:background .15s ease}',
			'.mgrSkill:first-child{border-top:none}',
			'.mgrSkill:hover{background:var(--dsw-alias-bg-layer-2)}',
			'.mgrSkill:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}',
			'.mgrSkillMain{flex:1;min-width:0}',
			'.mgrSkillName{display:flex;align-items:center;gap:6px;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;color:var(--dsw-alias-label-primary)}',
			'.mgrSkillDesc{margin-top:2px;font-size:11.5px;color:var(--dsw-alias-label-tertiary);line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}',
			'.mgrBadge{display:inline-flex;align-items:center;flex:none;padding:0 6px;border-radius:99px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);font-size:10.5px;font-weight:500;line-height:1.7;letter-spacing:0;white-space:nowrap}',
			'.mgrBadgeOk{color:var(--dsw-alias-state-success-primary)}',
			'.mgrBadgeWarn{color:var(--dsw-alias-state-warn-primary)}',
			'.mgrBadgeError{color:var(--dsw-alias-state-error-primary)}',
			'.mgrSwitch{position:relative;flex:none;width:34px;height:20px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:99px;background:var(--dsw-alias-bg-layer-3);cursor:pointer;transition:background .15s ease,border-color .15s ease}',
			'.mgrSwitch:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
			'.mgrSwitchOn{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}',
			'.mgrSwitch:disabled{opacity:.5;cursor:default}',
			'.mgrSwitchKnob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground);box-shadow:var(--dsw-elevation-soft);transition:transform .15s ease}',
			'.mgrSwitchOn .mgrSwitchKnob{transform:translateX(14px)}',
			'.mgrServer{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);padding:12px 14px;margin-bottom:10px}',
			'.mgrServer:hover{border-color:var(--dsw-alias-border-l3)}',
			'.mgrServerHead{display:flex;align-items:center;gap:8px}',
			'.mgrServerName{font-size:13px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.mgrDot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}',
			'.mgrDot-ready{background:var(--dsw-alias-state-success-primary)}',
			'.mgrDot-connecting{background:var(--dsw-alias-state-warn-primary)}',
			'.mgrDot-error{background:var(--dsw-alias-state-error-primary)}',
			'.mgrCommand{margin-top:6px;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;color:var(--dsw-alias-label-secondary);word-break:break-all}',
			'.mgrMeta{margin-top:4px;font-size:11.5px;color:var(--dsw-alias-label-tertiary);word-break:break-word}',
			'.mgrServerError{margin-top:6px;font-size:11.5px;color:var(--dsw-alias-state-error-primary);line-height:1.5;word-break:break-word}',
			'.mgrServerActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1)}',
			'.mgrToolList{margin-top:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);padding:6px 10px}',
			'.mgrToolRow{padding:5px 0;border-top:1px solid var(--dsw-alias-border-l1)}',
			'.mgrToolRow:first-child{border-top:none}',
			'.mgrToolName{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;color:var(--dsw-alias-label-primary);word-break:break-all}',
			'.mgrToolDesc{margin-top:1px;font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.5;word-break:break-word}',
			'.mgrPre{white-space:pre-wrap;word-break:break-word;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;line-height:1.65;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);padding:10px 12px;margin:0;max-height:320px;overflow:auto}',
			'.mgrEmpty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:44px 16px;text-align:center;color:var(--dsw-alias-label-tertiary);line-height:1.7}',
			'.mgrLoading{display:flex;align-items:center;justify-content:center;gap:10px;padding:36px 0;color:var(--dsw-alias-label-tertiary)}',
			'.mgrSpinner{width:13px;height:13px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-state-business-primary);border-radius:50%;animation:mgrSpin .8s linear infinite}',
			'@keyframes mgrSpin{to{transform:rotate(360deg)}}',
			'@media (prefers-reduced-motion:reduce){.mgrSpinner{animation:none}}',
			'.mgrModalBackdrop{position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent)}',
			'.mgrModal{display:flex;flex-direction:column;width:min(680px,100%);max-height:min(82vh,760px);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-elevation-soft);overflow:hidden}',
			'.mgrModalHead{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none}',
			'.mgrModalTitle{margin:0;font-size:14px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.mgrModalBody{flex:1;min-height:0;overflow:auto;padding:16px}',
			'.mgrModalFoot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l2);flex:none}',
			'.mgrFormError{margin:0 0 10px;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5}',
			'.mgrDetailRow{display:flex;gap:12px;padding:5px 0;font-size:12px;line-height:1.6}',
			'.mgrDetailKey{flex:none;width:76px;color:var(--dsw-alias-label-tertiary)}',
			'.mgrDetailValue{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);word-break:break-word}',
			'.mgrToast{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:10px;max-width:min(620px,84%);padding:9px 11px 9px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-soft);font-size:12.5px;line-height:1.5;color:var(--dsw-alias-label-primary)}',
			'.mgrToastError{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
			'.mgrToastText{white-space:pre-wrap;word-break:break-word}',
			'.mgrToastClose{flex:none;border:0;background:transparent;color:inherit;cursor:pointer;font-size:16px;line-height:1;padding:0 2px}',
			'.mgrLanCard{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);padding:14px 16px;margin-bottom:12px}',
			'.mgrLanRow{display:flex;align-items:center;gap:14px}',
			'.mgrLanRowMain{flex:1;min-width:0}',
			'.mgrLanTitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}',
			'.mgrLanHint{margin-top:3px;font-size:11.5px;color:var(--dsw-alias-label-tertiary);line-height:1.6}',
			'.mgrLanGrid{display:flex;gap:20px;flex-wrap:wrap;margin-top:14px}',
			'.mgrQrBox{flex:none;display:flex;flex-direction:column;align-items:center;gap:8px}',
			'.mgrQr{width:184px;height:184px;padding:10px;background:#fff;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md)}',
			'.mgrQrCaption{font-size:11.5px;color:var(--dsw-alias-label-tertiary)}',
			'.mgrLanMain{flex:1;min-width:260px}',
			'.mgrLanUrl{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);padding:8px 10px;word-break:break-all;line-height:1.6}',
			'.mgrLanMeta{margin-top:12px;display:flex;flex-direction:column;gap:6px}',
			'.mgrLanMetaRow{display:flex;gap:12px;font-size:12px;line-height:1.6}',
			'.mgrLanMetaKey{flex:none;width:96px;color:var(--dsw-alias-label-tertiary)}',
			'.mgrLanMetaValue{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);word-break:break-all}',
			'.mgrLanActions{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap}',
			'.mgrLanRowSub{margin-top:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}',
			'.mgrLanTrust{margin-top:14px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}',
			'.mgrLanSteps{margin-top:6px;line-height:1.7}',
			'.mgrModeIntro{margin-bottom:12px}',
			'.mgrModeTag{display:inline-block;margin-left:8px;padding:0 6px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;font-size:10.5px;font-weight:400;line-height:16px;color:var(--dsw-alias-label-tertiary);vertical-align:1px}',
			'.mgrModeMeta{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:11.5px;color:var(--dsw-alias-label-tertiary)}',
			'.mgrModeState{color:var(--dsw-alias-label-secondary)}',
			'.mgrModeStateBad{color:var(--dsw-alias-state-error-primary)}',
			'.mgrModeDetails{margin-top:8px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1)}',
			'.mgrModeDetails summary{cursor:pointer;font-size:11.5px;color:var(--dsw-alias-label-secondary);list-style:none}',
			'.mgrModeDetails summary::-webkit-details-marker{display:none}',
			'.mgrModeDetails summary::before{content:"▸";display:inline-block;width:14px;color:var(--dsw-alias-label-tertiary)}',
			'.mgrModeDetails[open] summary::before{content:"▾"}',
			'.mgrModeRows{display:flex;flex-direction:column;gap:3px;margin-top:8px}',
			'.mgrModeRow{display:flex;align-items:baseline;gap:10px;font-size:11.5px;line-height:1.7}',
			'.mgrModeRowId{flex:none;width:128px;color:var(--dsw-alias-label-secondary)}',
			'.mgrModeRowPlugin{flex:1;min-width:0;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary);word-break:break-all}',
			'.mgrModeRowChild{flex:none;color:var(--dsw-alias-label-tertiary)}',
			'.mgrModeRemoved{margin-top:10px}',
			'.mgrSearchControls{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:8px 0 12px}',
			'.mgrSearchControls .mgrHint{flex:1;min-width:180px}',
			'.mgrSearchTimeWrap{display:flex;align-items:center;gap:5px}',
			'.mgrSearchTime{width:auto;min-width:96px;height:30px;padding:2px 6px;font-size:11.5px}',
			'.mgrSearchOrder{display:flex;align-items:center;gap:3px}',
			'.mgrSearchOrder .mgrBtn{padding:2px 6px;min-width:0;line-height:1.5}',
			'.mgrSearchBar{display:flex;align-items:center;gap:8px;margin-bottom:10px}',
			'.mgrSearchBar .mgrInput{flex:1;width:auto;min-width:0;height:36px;font-size:13.5px}',
			'.mgrSearchResults{margin-bottom:18px}',
			'.mgrSearchList{display:flex;flex-direction:column;gap:10px}',
			'.mgrSearchChannels{margin-top:22px;padding-top:16px;border-top:1px solid var(--dsw-alias-border-l2)}',
			'.mgrSearchChannelsHead{display:flex;align-items:center;gap:8px;margin-bottom:10px}',
			'.mgrSearchChannelsTitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}',
			'.mgrSearchChannel{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);margin-bottom:8px;overflow:hidden}',
			'.mgrSearchChannelHead{display:flex;align-items:flex-start;gap:12px;padding:10px 12px}',
			'.mgrSearchChannelMain{flex:1;min-width:0}',
			'.mgrSearchChannelName{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}',
			'.mgrSearchChannelDesc{margin-top:2px;font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}',
			'.mgrSearchChannelBadges{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:5px}',
			'.mgrSearchChannelActions{display:flex;align-items:center;gap:6px;flex:none;flex-wrap:wrap;justify-content:flex-end}',
			'.mgrSearchChannelBody{padding:12px;border-top:1px solid var(--dsw-alias-border-l1)}',
			'.mgrSearchChannelGrid{display:flex;gap:12px;flex-wrap:wrap}',
			'.mgrSearchChannelField{flex:1;min-width:220px;margin-bottom:0}',
			'.mgrSearchChannelFoot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}',
			'.mgrSearchChannelResult{padding:0 12px 12px}',
			'.mgrSearchTest{margin-top:10px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);font-size:11.5px;line-height:1.6}',
			'.mgrSearchTestOk{border-left-color:var(--dsw-alias-state-success-primary)}',
			'.mgrSearchTestError{border-left-color:var(--dsw-alias-state-error-primary)}',
			'.mgrSearchTestTitle{font-weight:600;color:var(--dsw-alias-label-secondary)}',
			'.mgrSearchTestItem{margin-top:3px;color:var(--dsw-alias-label-tertiary);word-break:break-word}',
			'.mgrSearchChips{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:6px 0 10px}',
			'.mgrSearchChip{display:inline-flex;align-items:center;padding:1px 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:10.5px;color:var(--dsw-alias-label-secondary)}',
			'.mgrSearchChipError{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
			'.mgrSearchChannelTag{flex:none;max-width:30%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;color:var(--dsw-alias-label-tertiary)}',
			'.mgrSearchSummary{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
			'.mgrSearchResult{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);padding:11px 13px;transition:border-color .15s ease}',
			'.mgrSearchResult:hover{border-color:var(--dsw-alias-border-l3)}',
			'.mgrSearchResultHead{display:flex;align-items:baseline;gap:8px;min-width:0}',
			'.mgrSearchRank{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;min-width:14px}',
			'.mgrSearchLink{flex:1;min-width:0;font-size:13px;font-weight:600;color:var(--dsw-alias-state-business-primary);text-decoration:none;word-break:break-word}',
			'.mgrSearchLink:hover{text-decoration:underline}',
			'.mgrSearchHost{flex:none;max-width:38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:10.5px;color:var(--dsw-alias-label-tertiary)}',
			'.mgrSearchSnippet{margin-top:5px;font-size:12px;line-height:1.65;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}',
			'.mgrSearchDate{margin-top:4px;font-size:11px;color:var(--dsw-alias-label-tertiary)}',
			'.mgrSearchAnswer{margin-bottom:14px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-state-business-primary);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}',
			'.mgrSearchAnswerTitle{margin-bottom:4px;font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
			'.mgrSearchAnswerBody{max-height:220px;overflow:auto;font-size:12px;line-height:1.65;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}',
		].join('\n');

		//#endregion

		//#region helpers

		/**
		 * Call one `/api/manager` endpoint on the Host.
		 *
		 * @param {object} ctx - Client context.
		 * @param {string} endpoint - Endpoint name.
		 * @param {object} payload - JSON payload.
		 * @param {number} [timeoutMs] - How long to wait; searches need more than the default.
		 * @returns {Promise<object>} The endpoint's value.
		 */
		function callHost(ctx, endpoint, payload, timeoutMs) {
			if (ctx.get('connection') === undefined) return Promise.reject(new Error('连接不可用'));
			var options = {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload ?? {}),
				credentials: 'same-origin',
			};
			var wait = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 30000;
			if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
				options.signal = AbortSignal.timeout(wait);
			}
			return fetch(API_PREFIX + '/' + endpoint, options).then(function (response) {
				return response.json().then(function (value) {
					// The error envelope is an object with a code and a message.
					// A plain `error` string in a payload is data, not a failure.
					var error = value !== null && typeof value === 'object' && value.error !== null && typeof value.error === 'object'
						? value.error
						: undefined;
					if (!response.ok || error !== undefined) {
						var failure = new Error((error && (error.message || error.code)) || ('HTTP ' + response.status));
						if (error && typeof error.code === 'string') failure.code = error.code;
						if (error && error.details !== undefined) failure.details = error.details;
						throw failure;
					}
					return value;
				});
			});
		}

		/**
		 * Read a thrown value's message.
		 *
		 * @param {unknown} reason - Thrown value.
		 * @returns {string} The message.
		 */
		function messageOf(reason) {
			return reason instanceof Error ? reason.message : String(reason);
		}

		/**
		 * Join class names.
		 *
		 * @returns {string} The class list.
		 */
		function classes() {
			var out = [];
			for (var index = 0; index < arguments.length; index += 1) {
				if (arguments[index]) out.push(arguments[index]);
			}
			return out.join(' ');
		}

		/**
		 * Join a name list, keeping the line short.
		 *
		 * @param {string[]} names - Names.
		 * @param {number} [max] - How many names to spell out.
		 * @returns {string} The list.
		 */
		function nameList(names, max) {
			var limit = max || 6;
			if (names.length <= limit) return names.join(', ');
			return names.slice(0, limit).join(', ') + ' … +' + (names.length - limit);
		}

		/**
		 * Read a URL's hostname for a result row.
		 *
		 * @param {string} value - The URL.
		 * @returns {string} The hostname, or an empty string.
		 */
		function hostOf(value) {
			try {
				return new URL(value).hostname;
			} catch {
				return '';
			}
		}

		//#endregion

		//#region primitives

		/**
		 * Host-like toggle.
		 *
		 * @param {object} props - `checked`, `onChange`, optional `label`, `disabled`.
		 * @returns {object} React node.
		 */
		function Switch(props) {
			return h('button', {
				type: 'button',
				role: 'switch',
				'aria-checked': props.checked === true,
				'aria-label': props.label,
				title: props.label,
				disabled: props.disabled === true,
				className: classes('mgrSwitch', props.checked === true && 'mgrSwitchOn'),
				onClick: function (event) {
					event.stopPropagation();
					if (props.disabled !== true) props.onChange(!props.checked);
				},
			}, h('span', { className: 'mgrSwitchKnob' }));
		}

		/**
		 * Small status tag.
		 *
		 * @param {object} props - `tone` and children.
		 * @returns {object} React node.
		 */
		function Badge(props) {
			return h('span', {
				className: classes('mgrBadge', props.tone && 'mgrBadge' + props.tone),
				title: props.title,
			}, props.children);
		}

		/**
		 * Loading row.
		 *
		 * @param {object} props - `label`.
		 * @returns {object} React node.
		 */
		function Loading(props) {
			return h('div', { className: 'mgrLoading' },
				h('span', { className: 'mgrSpinner', 'aria-hidden': true }),
				h('span', null, props.label));
		}

		/**
		 * Dialog shell with Escape and backdrop dismissal.
		 *
		 * @param {object} props - `title`, `onClose`, `children`, `footer`.
		 * @returns {object} React node.
		 */
		function Modal(props) {
			var panelRef = useRef(null);
			// Keep the latest close handler without re-running the mount effect:
			// the panel re-renders on its four-second status poll, and a changing
			// dependency would steal focus back to the first field.
			var closeRef = useRef(props.onClose);
			closeRef.current = props.onClose;
			useEffect(function () {
				function onKeyDown(event) {
					if (event.key === 'Escape') {
						event.stopPropagation();
						closeRef.current();
					}
				}
				document.addEventListener('keydown', onKeyDown);
				var node = panelRef.current;
				var target = node === null ? null : node.querySelector('.mgrModalBody input, .mgrModalBody textarea, .mgrModalBody select, .mgrModalBody button');
				if (target !== null) target.focus();
				return function () {
					document.removeEventListener('keydown', onKeyDown);
				};
			}, []);
			return h('div', {
				className: 'mgrModalBackdrop',
				onMouseDown: function (event) {
					if (event.target === event.currentTarget) props.onClose();
				},
			}, h('div', {
				className: 'mgrModal',
				role: 'dialog',
				'aria-modal': 'true',
				'aria-label': props.title,
				ref: panelRef,
			},
				h('div', { className: 'mgrModalHead' },
					h('h2', { className: 'mgrModalTitle' }, props.title),
					h('button', {
						type: 'button',
						className: 'mgrIconBtn',
						'aria-label': 'close',
						onClick: props.onClose,
					}, '×')),
				h('div', { className: 'mgrModalBody' }, props.children),
				props.footer === undefined ? null : h('div', { className: 'mgrModalFoot' }, props.footer)));
		}

		/**
		 * One labelled form field.
		 *
		 * @param {object} props - `label`, `hint`, `children`, optional `htmlFor`.
		 * @returns {object} React node.
		 */
		function Field(props) {
			return h('div', { className: 'mgrField' },
				h('label', { className: 'mgrLabel', htmlFor: props.htmlFor }, props.label),
				props.children,
				props.hint === undefined ? null : h('div', { className: 'mgrFieldHint' }, props.hint));
		}

		//#endregion

		//#region skills view

		/**
		 * Hierarchical skill categories.
		 *
		 * @param {object} props - Panel data and actions.
		 * @returns {object} React node.
		 */
		function SkillsSection(props) {
			var t = props.t;
			var skills = props.skills;
			var catalog = props.catalog;
			var catalogText = '';
			if (catalog !== undefined) {
				if (catalog.error !== '') {
					catalogText = t('skills.catalogError', { error: catalog.error });
				} else if (catalog.unavailable === true) {
					catalogText = t('skills.catalogUnavailable');
				} else {
					catalogText = t('skills.catalog', {
						total: catalog.total,
						visible: catalog.visible,
						managed: catalog.managed,
						external: catalog.external.length,
					});
					if (catalog.external.length > 0) catalogText += t('skills.catalogNames', { names: nameList(catalog.external) });
				}
			}
			var needle = props.query.trim().toLowerCase();
			var categories = [];
			for (var index = 0; index < skills.categories.length; index += 1) {
				var category = skills.categories[index];
				if (needle === '') {
					categories.push(category);
					continue;
				}
				var matched = category.skills.filter(function (skill) {
					var haystack = (category.name + ' ' + skill.name + ' ' + skill.description).toLowerCase();
					return haystack.indexOf(needle) >= 0;
				});
				if (matched.length > 0) {
					categories.push({ ...category, skills: matched });
				}
			}
			var missingRoots = skills.roots.filter(function (root) { return !root.exists; });
			return h('div', null,
				h('div', { className: 'mgrToolbar' },
					h('input', {
						className: 'mgrInput',
						type: 'search',
						value: props.query,
						placeholder: t('skills.search'),
						'aria-label': t('skills.search'),
						onChange: function (event) { props.setQuery(event.target.value); },
					}),
					h('span', { className: 'mgrToolbarSpacer' }),
					h('button', { type: 'button', className: 'mgrBtn', onClick: props.onRefresh, disabled: props.busy }, t('skills.refresh')),
					h('button', { type: 'button', className: 'mgrBtn mgrBtnPrimary', onClick: props.onNew, disabled: props.busy }, t('skills.new'))),
				h('div', { className: 'mgrStats' },
					h('span', null, t('skills.count', {
						categories: skills.totals.categories,
						skills: skills.totals.skills,
						enabled: skills.totals.enabled,
					})),
					h('span', { className: 'mgrSpacer' }),
					h('span', { className: 'mgrRootPath' }, skills.roots.map(function (root) { return root.path; }).join(' · '))),
				catalogText === '' ? null : h('div', { className: 'mgrHint mgrCatalog' }, catalogText),
				catalog === undefined || catalog.missing.length === 0 ? null : h('div', { className: 'mgrWarn' },
					h('span', null, t('skills.catalogMissing', { n: catalog.missing.length, names: nameList(catalog.missing) }))),
				missingRoots.length === 0 ? null : h('div', { className: 'mgrWarn' },
					h('span', null, t('skills.roots') + '：' + missingRoots.map(function (root) {
						return root.path + (root.error ? '（' + t('skills.rootError') + '：' + root.error + '）' : '（' + t('skills.rootMissing') + '）');
					}).join('；'))),
				skills.conflicts.length === 0 ? null : h('div', { className: 'mgrWarn' },
					h('span', null, skills.conflicts.map(function (conflict) {
						return conflict.name + '：' + conflict.sources.join('、');
					}).join('；'))),
				categories.length === 0 ? h('div', { className: 'mgrEmpty' }, t('skills.empty')) : categories.map(function (entry) {
					var open = needle !== '' || props.openCats[entry.name] === true;
					return h('div', { className: 'mgrCat', key: entry.name },
						h('div', { className: 'mgrCatHead' },
							h('button', {
								type: 'button',
								className: 'mgrChevron',
								'aria-expanded': open,
								'aria-label': entry.name,
								onClick: function () { props.toggleCategory(entry.name); },
							}, open ? '▾' : '▸'),
							h('span', { className: 'mgrCatName' }, entry.name),
							h('span', { className: 'mgrCount' }, String(entry.skills.length)),
							entry.disabled ? h(Badge, { tone: 'Warn' }, t('skills.categoryDisabled')) : null,
							h('span', { className: 'mgrSpacer' }),
							h(Switch, {
								checked: !entry.disabled,
								disabled: props.busy,
								label: entry.name,
								onChange: function (next) { props.onToggleCategory(entry.name, next); },
							})),
						!open ? null : h('div', { className: 'mgrCatBody' },
							entry.error === undefined ? null : h('div', { className: 'mgrServerError', style: { padding: '8px 12px' } }, entry.error),
							entry.skills.length === 0 ? h('div', { className: 'mgrEmpty', style: { padding: '18px 12px' } }, t('skills.categoryEmpty')) : entry.skills.map(function (skill) {
								var badges = [];
								if (!skill.ok) badges.push(h(Badge, { tone: 'Error', key: 'broken' }, t('skills.broken')));
								if (skill.conflict) badges.push(h(Badge, {
									tone: 'Error',
									key: 'conflict',
									title: skill.conflictWith === undefined ? t('skills.conflict') : t('skills.conflictWith', { owner: skill.conflictWith }),
								}, t('skills.conflict')));
								if (skill.ok && skill.disabled && !entry.disabled) badges.push(h(Badge, { key: 'disabled' }, t('skills.skillDisabled')));
								if (skill.ok && !skill.invocation.modelInvocable) badges.push(h(Badge, { key: 'model' }, t('skills.modelHidden')));
								if (skill.ok && !skill.invocation.userInvocable) badges.push(h(Badge, { key: 'user' }, t('skills.userHidden')));
								return h('div', {
									key: skill.folder,
									className: 'mgrSkill',
									role: 'button',
									tabIndex: 0,
									onClick: function () { props.onOpenSkill(entry.name, skill); },
									onKeyDown: function (event) {
										if (event.key === 'Enter' || event.key === ' ') {
											event.preventDefault();
											props.onOpenSkill(entry.name, skill);
										}
									},
								},
									h('div', { className: 'mgrSkillMain' },
										h('div', { className: 'mgrSkillName' }, skill.name, badges),
										h('div', { className: 'mgrSkillDesc' }, skill.ok ? skill.description : skill.error)),
									h(Switch, {
										checked: skill.ok && !skill.conflict && !entry.disabled && !skill.disabled,
										disabled: props.busy || !skill.ok || skill.conflict || entry.disabled,
										label: skill.name,
										onChange: function (next) { props.onToggleSkill(entry.name, skill.name, next); },
									}));
							})));
				}));
		}

		/**
		 * One skill's parsed contents.
		 *
		 * @param {object} props - `category`, `name`, `call`, `t`, `onClose`.
		 * @returns {object} React node.
		 */
		function SkillDetail(props) {
			var [state, setState] = useState({ loading: true, data: null, error: '' });
			useEffect(function () {
				var alive = true;
				props.call('skill-read', { category: props.category, name: props.name }).then(function (value) {
					if (alive) setState({ loading: false, data: value, error: '' });
				}).catch(function (reason) {
					if (alive) setState({ loading: false, data: null, error: messageOf(reason) });
				});
				return function () { alive = false; };
			}, [props.category, props.name, props.call]);
			var body;
			if (state.loading) {
				body = h(Loading, { label: props.t('state.loading') });
			} else if (state.error !== '') {
				body = h('div', { className: 'mgrErrorBox' }, state.error);
			} else {
				var data = state.data;
				var invocation = data.invocation.modelInvocable
					? (data.invocation.userInvocable ? props.t('skills.detail.invocation.both') : props.t('skills.detail.invocation.modelOnly'))
					: (data.invocation.userInvocable ? props.t('skills.detail.invocation.userOnly') : props.t('skills.detail.invocation.none'));
				body = h('div', null,
					h('div', { className: 'mgrDetailRow' },
						h('span', { className: 'mgrDetailKey' }, props.t('skills.detail.description')),
						h('span', { className: 'mgrDetailValue' }, data.description)),
					data.whenToUse === undefined ? null : h('div', { className: 'mgrDetailRow' },
						h('span', { className: 'mgrDetailKey' }, props.t('skills.detail.whenToUse')),
						h('span', { className: 'mgrDetailValue' }, data.whenToUse)),
					h('div', { className: 'mgrDetailRow' },
						h('span', { className: 'mgrDetailKey' }, props.t('skills.detail.invocation')),
						h('span', { className: 'mgrDetailValue' }, invocation)),
					h('div', { className: 'mgrDetailRow' },
						h('span', { className: 'mgrDetailKey' }, props.t('skills.detail.path')),
						h('span', { className: 'mgrDetailValue mgrRootPath' }, data.path)),
					h('div', { className: 'mgrLabel', style: { margin: '14px 0 6px' } }, props.t('skills.detail.content')),
					h('pre', { className: 'mgrPre' }, data.content));
			}
			return h(Modal, {
				title: props.category + ' / ' + props.name,
				onClose: props.onClose,
			}, body);
		}

		/**
		 * Creation form for one skill skeleton.
		 *
		 * @param {object} props - `skills`, `t`, `onSubmit`, `onClose`.
		 * @returns {object} React node.
		 */
		function SkillCreate(props) {
			var [category, setCategory] = useState('');
			var [name, setName] = useState('');
			var [description, setDescription] = useState('');
			var [error, setError] = useState('');
			var [busy, setBusy] = useState(false);
			var t = props.t;
			var firstRoot = props.skills.roots.length > 0 ? props.skills.roots[0].path : '';
			var location = firstRoot === '' ? '' : firstRoot.replace(/\/$/, '') + '/' + (category.trim() || '<分类>') + '/' + (name.trim() || '<技能名>') + '/SKILL.md';
			function submit(event) {
				if (event) event.preventDefault();
				var categoryValue = category.trim();
				var nameValue = name.trim();
				if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u.test(categoryValue)) {
					setError(t('skills.create.invalidCategory'));
					return;
				}
				if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(nameValue)) {
					setError(t('skills.create.invalidName'));
					return;
				}
				if (description.trim() === '') {
					setError(t('skills.create.invalidDescription'));
					return;
				}
				setBusy(true);
				setError('');
				props.onSubmit({ category: categoryValue, name: nameValue, description: description.trim() })
					.catch(function (reason) { setError(messageOf(reason)); })
					.then(function () { setBusy(false); });
			}
			return h(Modal, {
				title: t('skills.create.title'),
				onClose: props.onClose,
				footer: [
					h('button', { type: 'button', className: 'mgrBtn', key: 'cancel', onClick: props.onClose }, t('action.cancel')),
					h('button', { type: 'submit', className: 'mgrBtn mgrBtnPrimary', key: 'submit', form: 'mgr-skill-form', disabled: busy }, t('action.create')),
				],
			},
				h('form', { id: 'mgr-skill-form', onSubmit: submit },
					error === '' ? null : h('p', { className: 'mgrFormError' }, error),
					h(Field, { label: t('skills.create.category'), hint: t('skills.create.categoryHint'), htmlFor: 'mgr-skill-category' },
						h('input', {
							id: 'mgr-skill-category',
							className: 'mgrInput',
							value: category,
							placeholder: 'dev',
							list: 'mgr-skill-categories',
							onChange: function (event) { setCategory(event.target.value); },
						}),
						h('datalist', { id: 'mgr-skill-categories' }, props.skills.categories.map(function (entry) {
							return h('option', { key: entry.name, value: entry.name });
						}))),
					h(Field, { label: t('skills.create.name'), hint: t('skills.create.nameHint'), htmlFor: 'mgr-skill-name' },
						h('input', {
							id: 'mgr-skill-name',
							className: 'mgrInput',
							value: name,
							placeholder: 'webapp-testing',
							onChange: function (event) { setName(event.target.value); },
						})),
					h(Field, { label: t('skills.create.description'), hint: t('skills.create.descriptionHint'), htmlFor: 'mgr-skill-description' },
						h('textarea', {
							id: 'mgr-skill-description',
							className: 'mgrTextarea',
							value: description,
							rows: 3,
							onChange: function (event) { setDescription(event.target.value); },
						})),
					h('div', { className: 'mgrFieldHint mgrRootPath' }, location === '' ? '' : t('skills.create.location', { path: location }))));
		}

		//#endregion

		//#region mcp view

		/**
		 * Parse the environment textarea.
		 *
		 * @param {string} text - KEY=VALUE lines.
		 * @returns {Record<string, string> | undefined} Parsed map, or undefined when invalid.
		 */
		function parseEnv(text) {
			var env = {};
			var lines = text.split('\n');
			for (var index = 0; index < lines.length; index += 1) {
				var line = lines[index].trim();
				if (line === '') continue;
				var equals = line.indexOf('=');
				if (equals <= 0) return undefined;
				var key = line.slice(0, equals).trim();
				var value = line.slice(equals + 1).trim();
				if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return undefined;
				if (value !== '') env[key] = value;
			}
			return env;
		}

		/**
		 * Add or edit one MCP server.
		 *
		 * @param {object} props - `mode`, `server`, `credentials`, `t`, `onSubmit`, `onClose`.
		 * @returns {object} React node.
		 */
		function McpForm(props) {
			var editing = props.mode === 'edit';
			var t = props.t;
			var server = props.server;
			var [name, setName] = useState(editing ? server.name : '');
			var [command, setCommand] = useState(editing ? server.command : '');
			var [argsText, setArgsText] = useState(editing ? server.args.join('\n') : '');
			var [cwd, setCwd] = useState(editing ? server.cwd : '');
			var [envText, setEnvText] = useState('');
			var [clearEnv, setClearEnv] = useState(false);
			var [enabled, setEnabled] = useState(editing ? server.enabled : true);
			var [error, setError] = useState('');
			var [busy, setBusy] = useState(false);
			function submit(event) {
				if (event) event.preventDefault();
				var nameValue = name.trim();
				var commandValue = command.trim();
				if (nameValue === '' || commandValue === '') {
					setError(t('mcp.form.required'));
					return;
				}
				var args = argsText.split('\n').map(function (line) { return line.trim(); }).filter(function (line) { return line !== ''; });
				var payload = {
					name: nameValue,
					command: commandValue,
					args: args,
					cwd: cwd.trim(),
					enabled: enabled,
				};
				if (editing) payload.id = server.id;
				if (clearEnv) {
					payload.env = {};
				} else if (envText.trim() !== '') {
					var parsed = parseEnv(envText);
					if (parsed === undefined) {
						setError(t('mcp.form.invalidEnv'));
						return;
					}
					if (props.credentials !== true && Object.keys(parsed).length > 0) {
						setError(t('mcp.noCredentials'));
						return;
					}
					payload.env = parsed;
				}
				setBusy(true);
				setError('');
				props.onSubmit(payload)
					.catch(function (reason) { setError(messageOf(reason)); })
					.then(function () { setBusy(false); });
			}
			return h(Modal, {
				title: editing ? t('mcp.form.editTitle') : t('mcp.form.addTitle'),
				onClose: props.onClose,
				footer: [
					h('button', { type: 'button', className: 'mgrBtn', key: 'cancel', onClick: props.onClose }, t('action.cancel')),
					h('button', { type: 'submit', className: 'mgrBtn mgrBtnPrimary', key: 'submit', form: 'mgr-mcp-form', disabled: busy }, t('mcp.form.submit')),
				],
			},
				h('form', { id: 'mgr-mcp-form', onSubmit: submit },
					error === '' ? null : h('p', { className: 'mgrFormError' }, error),
					h(Field, { label: t('mcp.form.name'), hint: t('mcp.form.nameHint'), htmlFor: 'mgr-mcp-name' },
						h('input', {
							id: 'mgr-mcp-name',
							className: 'mgrInput',
							value: name,
							placeholder: 'github',
							onChange: function (event) { setName(event.target.value); },
						})),
					h(Field, { label: t('mcp.form.command'), hint: t('mcp.form.commandHint'), htmlFor: 'mgr-mcp-command' },
						h('input', {
							id: 'mgr-mcp-command',
							className: 'mgrInput',
							value: command,
							placeholder: 'npx',
							onChange: function (event) { setCommand(event.target.value); },
						})),
					h(Field, { label: t('mcp.form.args'), hint: t('mcp.form.argsHint'), htmlFor: 'mgr-mcp-args' },
						h('textarea', {
							id: 'mgr-mcp-args',
							className: 'mgrTextarea',
							value: argsText,
							rows: 3,
							placeholder: '-y\n@modelcontextprotocol/server-github',
							onChange: function (event) { setArgsText(event.target.value); },
						})),
					h(Field, { label: t('mcp.form.cwd'), hint: t('mcp.form.cwdHint'), htmlFor: 'mgr-mcp-cwd' },
						h('input', {
							id: 'mgr-mcp-cwd',
							className: 'mgrInput',
							value: cwd,
							placeholder: '/Users/you/project',
							onChange: function (event) { setCwd(event.target.value); },
						})),
					h(Field, {
						label: t('mcp.form.env'),
						hint: props.credentials === true
							? (editing && server.envKeys.length > 0
								? t('mcp.form.envSaved', { n: server.envKeys.length, keys: server.envKeys.join(', ') }) + ' ' + t('mcp.form.envKeep')
								: t('mcp.form.envHint'))
							: t('mcp.noCredentials'),
						htmlFor: 'mgr-mcp-env',
					},
						h('textarea', {
							id: 'mgr-mcp-env',
							className: 'mgrTextarea',
							value: envText,
							rows: 3,
							disabled: props.credentials !== true || clearEnv,
							placeholder: 'GITHUB_TOKEN=xxx',
							onChange: function (event) { setEnvText(event.target.value); },
						}),
						editing && server.envKeys.length > 0 && props.credentials === true
							? h('label', { className: 'mgrFieldHint', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
								h('input', {
									type: 'checkbox',
									checked: clearEnv,
									onChange: function (event) { setClearEnv(event.target.checked); },
								}),
								t('mcp.form.clearEnv'))
							: null),
					h('label', { className: 'mgrFieldHint', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
						h('input', {
							type: 'checkbox',
							checked: enabled,
							onChange: function (event) { setEnabled(event.target.checked); },
						}),
						t('mcp.form.enabled'))));
		}

		/**
		 * The MCP server list.
		 *
		 * @param {object} props - Panel data and actions.
		 * @returns {object} React node.
		 */
		function McpSection(props) {
			var t = props.t;
			var mcp = props.mcp;
			var [openTools, setOpenTools] = useState({});
			var [confirming, setConfirming] = useState('');
			var [editing, setEditing] = useState(null);
			function stateLabel(server) {
				if (!server.enabled) return t('mcp.state.stopped');
				if (server.state === 'stopped') return t('mcp.state.connecting');
				return t('mcp.state.' + server.state);
			}
			function tone(server) {
				if (!server.enabled) return '';
				if (server.state === 'ready') return 'Ok';
				if (server.state === 'connecting') return 'Warn';
				if (server.state === 'error') return 'Error';
				return '';
			}
			return h('div', null,
				h('div', { className: 'mgrToolbar' },
					h('div', { className: 'mgrHint' }, t('mcp.note')),
					h('span', { className: 'mgrToolbarSpacer' }),
					h('button', {
						type: 'button',
						className: 'mgrBtn mgrBtnPrimary',
						disabled: props.busy || mcp.available !== true,
						onClick: function () { setEditing({ mode: 'add', server: null }); },
					}, t('mcp.add'))),
				mcp.available === true ? null : h('div', { className: 'mgrWarn' }, t('mcp.unavailable')),
				mcp.credentials === true ? null : h('div', { className: 'mgrWarn' }, t('mcp.noCredentials')),
				mcp.servers.length === 0 ? h('div', { className: 'mgrEmpty' }, t('mcp.empty')) : mcp.servers.map(function (server) {
					var toolsOpen = openTools[server.id] === true;
					var envLabel = server.envKeys.length === 0 ? t('mcp.noEnv') : server.envKeys.join(', ');
					return h('div', { className: 'mgrServer', key: server.id },
						h('div', { className: 'mgrServerHead' },
							h('span', { className: 'mgrDot mgrDot-' + (server.enabled ? server.state : 'stopped'), 'aria-hidden': true }),
							h('span', { className: 'mgrServerName' }, server.name),
							h(Badge, { tone: tone(server) }, stateLabel(server)),
							server.enabled ? h('span', { className: 'mgrMeta' }, t('mcp.toolsCount', { n: server.tools.length })) : null,
							h('span', { className: 'mgrSpacer' }),
							h(Switch, {
								checked: server.enabled,
								disabled: props.busy || mcp.available !== true,
								label: server.name,
								onChange: function (next) { props.onToggle(server.id, next); },
							})),
						h('div', { className: 'mgrCommand' }, server.command + (server.args.length > 0 ? ' ' + server.args.join(' ') : '')),
						server.cwd === '' ? null : h('div', { className: 'mgrMeta' }, server.cwd),
						h('div', { className: 'mgrMeta' }, t('mcp.envKeys') + '：' + envLabel),
						server.error === '' ? null : h('div', { className: 'mgrServerError' }, server.error),
						h('div', { className: 'mgrServerActions' },
							h('button', {
								type: 'button',
								className: 'mgrBtn',
								disabled: !server.enabled || props.busy || mcp.available !== true,
								onClick: function () { props.onReconnect(server.id); },
							}, t('action.reconnect')),
							h('button', {
								type: 'button',
								className: 'mgrBtn',
								onClick: function () {
									setOpenTools(function (current) {
										var next = { ...current };
										next[server.id] = current[server.id] !== true;
										return next;
									});
								},
							}, (toolsOpen ? t('mcp.hideTools') : t('mcp.showTools')) + ' (' + server.tools.length + ')'),
							h('button', {
								type: 'button',
								className: 'mgrBtn',
								onClick: function () { setEditing({ mode: 'edit', server: server }); },
							}, t('action.edit')),
							confirming === server.id
								? [
									h('button', {
										type: 'button',
										className: 'mgrBtn mgrBtnDanger',
										key: 'confirm',
										disabled: props.busy,
										onClick: function () {
											props.onRemove(server.id).then(function () { setConfirming(''); }).catch(function () {});
										},
									}, t('mcp.deleteConfirm')),
									h('button', {
										type: 'button',
										className: 'mgrBtn',
										key: 'cancel',
										onClick: function () { setConfirming(''); },
									}, t('action.cancel')),
								]
								: h('button', {
									type: 'button',
									className: 'mgrBtn mgrBtnDanger',
									onClick: function () { setConfirming(server.id); },
								}, t('action.delete'))),
						!toolsOpen ? null : h('div', { className: 'mgrToolList' },
							server.tools.length === 0 ? h('div', { className: 'mgrMeta' }, t('mcp.toolsEmpty')) : server.tools.map(function (tool) {
								return h('div', { className: 'mgrToolRow', key: tool.public },
									h('div', { className: 'mgrToolName' }, tool.public),
									tool.description === '' ? null : h('div', { className: 'mgrToolDesc' }, tool.description));
							})),
						!toolsOpen || server.stderr.length === 0 ? null : h('div', null,
							h('div', { className: 'mgrLabel', style: { margin: '10px 0 6px' } }, t('mcp.stderr')),
							h('pre', { className: 'mgrPre' }, server.stderr.join('\n'))));
				}),
				editing === null ? null : h(McpForm, {
					mode: editing.mode,
					server: editing.server,
					credentials: mcp.credentials,
					t: t,
					onClose: function () { setEditing(null); },
					onSubmit: function (payload) {
						return props.onSave(payload).then(function () { setEditing(null); });
					},
				}));
		}

		//#endregion

		//#region search view

		/**
		 * One configurable search channel.
		 *
		 * The switch is saved immediately; the rest of the form is saved on
		 * demand so typing a key never changes the live search config halfway.
		 * Keys are write-only: the input clears after a save and the Host never
		 * sends a value back.
		 *
		 * @param {object} props - Channel view, translator and callbacks.
		 * @returns {object} React node.
		 */
		function SearchChannelRow(props) {
			var t = props.t;
			var channel = props.channel;
			var [open, setOpen] = useState(false);
			var [apiKey, setApiKey] = useState('');
			var [baseUrl, setBaseUrl] = useState(channel.baseUrl);
			var [saving, setSaving] = useState(false);
			var [testing, setTesting] = useState(false);
			var [test, setTest] = useState(null);
			var [formError, setFormError] = useState('');

			useEffect(function () {
				setBaseUrl(channel.baseUrl);
			}, [channel.baseUrl]);

			var descKey = 'search.channel.' + channel.id + '.desc';
			var description = t(descKey);
			if (typeof description !== 'string' || description === '' || description === descKey) {
				description = channel.description;
			}

			var keyBadge;
			if (channel.keyConfigured) {
				keyBadge = h(Badge, { tone: 'Ok' }, channel.keySource === 'env' ? t('search.channel.keyEnv') : channel.keySource === 'host' ? t('search.channel.keyHost') : t('search.channel.keyConfigured'));
			} else if (channel.requiresKey) {
				keyBadge = h(Badge, { tone: 'Warn' }, t('search.channel.keyMissing'));
			} else {
				keyBadge = h(Badge, { tone: 'Ok' }, t('search.channel.keyless'));
			}
			var freeBadge = channel.free === true ? h(Badge, { tone: 'Ok' }, t('search.free')) : null;
			var cooldownBadge = Number(channel.cooldownMs) > 0
				? h(Badge, { tone: 'Warn' }, t('search.cooldown', { s: Math.ceil(Number(channel.cooldownMs) / 1000) }))
				: null;

			function fail(reason) {
				setFormError(messageOf(reason));
			}

			function toggle(enabled) {
				setSaving(true);
				setFormError('');
				return props.onSave({ id: channel.id, enabled: enabled }).catch(fail).then(function () {
					setSaving(false);
				});
			}

			function move(direction) {
				setSaving(true);
				setFormError('');
				return props.onMove(channel.id, direction).catch(fail).then(function () {
					setSaving(false);
				});
			}

			function save() {
				setSaving(true);
				setFormError('');
				setTest(null);
				return props.onSave({
					id: channel.id,
					baseUrl: baseUrl,
					apiKey: apiKey,
				}).then(function () {
					setApiKey('');
				}).catch(fail).then(function () {
					setSaving(false);
				});
			}

			function clearKey() {
				setSaving(true);
				setFormError('');
				setTest(null);
				return props.onSave({ id: channel.id, clearKey: true }).then(function () {
					setApiKey('');
				}).catch(fail).then(function () {
					setSaving(false);
				});
			}

			function runTest() {
				setTesting(true);
				setTest(null);
				setFormError('');
				return props.onTest(channel.id, props.defaultQuery).then(function (value) {
					setTest(value);
				}).catch(function (reason) {
					setTest({ ok: false, id: channel.id, label: channel.label, count: 0, sources: [], failure: { code: '', message: messageOf(reason) } });
				}).then(function () {
					setTesting(false);
				});
			}

			var testSources = test !== null && Array.isArray(test.sources) ? test.sources : [];
			var testView = test === null ? null : h('div', { className: classes('mgrSearchTest', test.ok === true ? 'mgrSearchTestOk' : 'mgrSearchTestError') },
				h('div', { className: 'mgrSearchTestTitle' },
					test.ok === true
						? t('search.channel.testOk', { n: test.count, ms: test.elapsedMs })
						: t('search.channel.testFail') + (test.failure && test.failure.code ? ' · ' + test.failure.code : '')),
				test.query ? h('div', { className: 'mgrHint' }, t('search.channel.testQuery', { query: test.query })) : null,
				test.ok === true
					? (testSources.length === 0
						? h('div', { className: 'mgrHint' }, t('search.noResults'))
						: testSources.map(function (source, index) {
							return h('div', { className: 'mgrSearchTestItem', key: source.url + '#' + index }, (index + 1) + '. ' + (source.title === '' ? source.url : source.title));
						}))
					: h('div', { className: 'mgrHint' }, test.failure && test.failure.message ? test.failure.message : ''));

			var keyField;
			if (channel.keySupported === false) {
				keyField = h('div', { className: 'mgrField mgrSearchChannelField' },
					h('span', { className: 'mgrLabel' }, t('search.channel.apiKey')),
					h('div', { className: 'mgrHint' }, t('search.channel.noKeyNeeded')));
			} else {
				keyField = h('div', { className: 'mgrField mgrSearchChannelField' },
					h('span', { className: 'mgrLabel' }, t('search.channel.apiKey')),
					h('input', {
						className: 'mgrInput',
						type: 'password',
						value: apiKey,
						placeholder: channel.keyConfigured
							? (channel.keySource === 'env' ? t('search.channel.apiKeyEnvKeep') : channel.keySource === 'host' ? t('search.channel.apiKeyHostKeep') : t('search.channel.apiKeyKeep'))
							: (channel.requiresKey ? t('search.channel.apiKeyNew') : (channel.id === 'searxng' ? t('search.channel.apiKeyOptional') : t('search.channel.apiKeyOptionalFree'))),
						autoComplete: 'new-password',
						spellCheck: false,
						disabled: saving || channel.keyWritable !== true,
						onChange: function (event) { setApiKey(event.target.value); },
					}),
					h('span', { className: 'mgrFieldHint' },
						channel.keyWritable !== true
							? t('search.channel.noCredentials')
							: (channel.envName ? t('search.channel.envHint', { env: channel.envName }) : '')));
			}

			return h('div', { className: 'mgrSearchChannel' },
				h('div', { className: 'mgrSearchChannelHead' },
					h('div', { className: 'mgrSearchChannelMain' },
						h('div', { className: 'mgrSearchChannelName' }, channel.label),
						h('div', { className: 'mgrSearchChannelDesc' }, description),
						h('div', { className: 'mgrSearchChannelBadges' }, freeBadge, keyBadge, cooldownBadge)),
					h('div', { className: 'mgrSearchChannelActions' },
						h('div', { className: 'mgrSearchOrder' },
							h('button', {
								type: 'button',
								className: 'mgrBtn',
								title: t('search.moveUp'),
								'aria-label': t('search.moveUp'),
								disabled: saving || props.canMoveUp !== true,
								onClick: function () { void move('up'); },
							}, '↑'),
							h('button', {
								type: 'button',
								className: 'mgrBtn',
								title: t('search.moveDown'),
								'aria-label': t('search.moveDown'),
								disabled: saving || props.canMoveDown !== true,
								onClick: function () { void move('down'); },
							}, '↓')),
						h(Switch, {
							checked: channel.enabled,
							disabled: saving,
							label: t('search.channel.enable'),
							onChange: function (next) { void toggle(next); },
						}),
						h('button', {
							type: 'button',
							className: 'mgrBtn',
							disabled: testing || saving,
							onClick: runTest,
						}, testing ? t('search.channel.testing') : t('search.channel.test')),
						h('button', {
							type: 'button',
							className: 'mgrBtn',
							onClick: function () { setOpen(!open); },
						}, open ? t('search.channel.hide') : t('search.channel.configure')))),
				open === false ? null : h('div', { className: 'mgrSearchChannelBody' },
					h('div', { className: 'mgrSearchChannelGrid' },
						keyField,
						h('div', { className: 'mgrField mgrSearchChannelField' },
							h('span', { className: 'mgrLabel' }, t('search.channel.baseUrl')),
							h('input', {
								className: 'mgrInput',
								type: 'text',
								value: baseUrl,
								placeholder: channel.defaultBaseUrl,
								spellCheck: false,
								disabled: saving,
								onChange: function (event) { setBaseUrl(event.target.value); },
							}),
							h('span', { className: 'mgrFieldHint' }, t('search.channel.baseUrlHint', { url: channel.defaultBaseUrl })))),
					h('div', { className: 'mgrSearchChannelFoot' },
						h('button', { type: 'button', className: 'mgrBtn mgrBtnPrimary', disabled: saving, onClick: save },
							saving ? t('search.channel.saving') : t('search.channel.save')),
						channel.keyConfigured === true && channel.keySource === 'record' && channel.keyWritable === true
							? h('button', { type: 'button', className: 'mgrBtn mgrBtnDanger', disabled: saving, onClick: clearKey }, t('search.channel.clearKey'))
							: null,
						h('span', { className: 'mgrSpacer' }),
						h('span', { className: 'mgrHint' }, t('search.channel.testHint')))),
				formError === '' && test === null
					? null
					: h('div', { className: 'mgrSearchChannelResult' },
						formError === '' ? null : h('div', { className: 'mgrFormError' }, formError),
						testView));
		}

		/**
		 * The web-search tab.
		 *
		 * The search box fans out to every enabled channel; the channel list
		 * below owns the switches, base URLs and write-only API keys. Results
		 * render as plain text and HTTP(S) links only.
		 *
		 * @param {object} props - Status, query state, result and callbacks.
		 * @returns {object} React node.
		 */
		function SearchSection(props) {
			var t = props.t;
			var status = props.status;
			var result = props.result;
			var error = props.error;
			var busy = props.busy;
			var channels = status !== null && Array.isArray(status.channels) ? status.channels : [];
			var enabled = 0;
			for (var index = 0; index < channels.length; index += 1) {
				if (channels[index].enabled === true) enabled += 1;
			}
			var maxResults = status !== null && Number.isFinite(status.maxResults) ? status.maxResults : 20;
			var perChannel = status !== null && Number.isFinite(status.perChannelResults) ? status.perChannelResults : 10;
			var available = status !== null && enabled > 0;
			var mode = status !== null && status.mode === 'fallback' ? 'fallback' : 'merge';
			var cooldowns = status !== null && status.cooldowns !== null && typeof status.cooldowns === 'object' ? status.cooldowns : {};
			var hasCooldown = Object.keys(cooldowns).length > 0;
			var statusError = status !== null && typeof status.error === 'string' ? status.error : '';
			var sources = result === null || !Array.isArray(result.sources) ? [] : result.sources;
			var channelResults = result === null || !Array.isArray(result.channels) ? [] : result.channels;
			var content = result !== null && typeof result.content === 'string' ? result.content : '';
			var allFailed = channelResults.length > 0 && channelResults.every(function (channel) { return channel.ok !== true; });

			function submit() {
				if (!busy && available) props.onSearch();
			}

			function onKeyDown(event) {
				// Enter also confirms an IME candidate; searching there would
				// fire before the Chinese/Japanese text is committed.
				if (event.isComposing === true || event.keyCode === 229) return;
				if (event.key !== 'Enter' || event.shiftKey) return;
				event.preventDefault();
				submit();
			}

			var chips = channelResults.map(function (channel) {
				var failed = channel.ok !== true;
				return h('span', {
					className: classes('mgrSearchChip', failed && 'mgrSearchChipError'),
					key: channel.id,
					title: failed && channel.error ? channel.error.message : '',
				}, failed
					? t('search.chipFail', { label: channel.label, code: channel.error ? channel.error.code : 'error' })
					: t('search.chipOk', { label: channel.label, n: channel.count }));
			});

			var resultView = result === null ? null : h('div', { className: 'mgrSearchResults' },
				h('div', { className: 'mgrSearchSummary' },
					h('span', null, t('search.resultCount', { n: sources.length, ms: result.elapsedMs || 0 })),
					result.cached === true ? h(Badge, { tone: 'Ok' }, t('search.cached')) : null),
				chips.length === 0 ? null : h('div', { className: 'mgrSearchChips' }, chips),
				sources.length === 0 && content === ''
					? null
					: h('div', { className: 'mgrHint', style: { margin: '4px 0 10px' } }, t('search.external')),
				content === ''
					? null
					: h('div', { className: 'mgrSearchAnswer' },
						h('div', { className: 'mgrSearchAnswerTitle' }, t('search.answer')),
						h('div', { className: 'mgrSearchAnswerBody' }, content)),
				sources.length === 0
					? h('div', { className: 'mgrEmpty' }, result.allCooling === true ? t('search.allCooling') : allFailed ? t('search.allFailed') : t('search.noResults'))
					: h('div', { className: 'mgrSearchList' },
						sources.map(function (source, rank) {
							var host = hostOf(source.url);
							return h('div', { className: 'mgrSearchResult', key: source.url + '#' + rank },
								h('div', { className: 'mgrSearchResultHead' },
									h('span', { className: 'mgrSearchRank' }, String(rank + 1)),
									h('a', {
										className: 'mgrSearchLink',
										href: source.url,
										target: '_blank',
										rel: 'noopener noreferrer',
										title: t('search.open'),
									}, source.title === '' ? source.url : source.title),
									h('span', { className: 'mgrSearchChannelTag' }, source.channelLabel || source.channel || ''),
									host === '' ? null : h('span', { className: 'mgrSearchHost' }, host)),
								source.snippet === '' ? null : h('div', { className: 'mgrSearchSnippet' }, source.snippet),
								source.publishedAt === '' ? null : h('div', { className: 'mgrSearchDate' }, source.publishedAt));
						})));

			var channelView = status === null || channels.length === 0 ? null : h('div', { className: 'mgrSearchChannels' },
				h('div', { className: 'mgrSearchChannelsHead' },
					h('span', { className: 'mgrSearchChannelsTitle' }, t('search.channels')),
					h('span', { className: 'mgrCount' }, t('search.channelsCount', { enabled: enabled, total: channels.length }))),
				channels.map(function (channel, index) {
					return h(SearchChannelRow, {
						key: channel.id,
						channel: channel,
						t: t,
						defaultQuery: props.query.trim() === '' ? 'DeepSeek Harness' : props.query.trim(),
						onSave: props.onSave,
						onTest: props.onTest,
						onMove: props.onMove,
						canMoveUp: index > 0,
						canMoveDown: index < channels.length - 1,
					});
				}));

			return h('div', null,
				h('div', { className: 'mgrSearchBar' },
					h('input', {
						className: 'mgrInput',
						type: 'search',
						value: props.query,
						placeholder: t('search.placeholder'),
						'aria-label': t('search.placeholder'),
						enterKeyHint: 'search',
						autoFocus: true,
						disabled: !available,
						onChange: function (event) { props.setQuery(event.target.value); },
						onKeyDown: onKeyDown,
					})),
				h('div', { className: 'mgrHint', style: { marginBottom: '10px' } },
					(mode === 'fallback' ? t('search.noteFallback') : t('search.noteMerge')) + ' ' + t('search.maxResults', { n: maxResults, per: perChannel })),
				status === null ? null : h('div', { className: 'mgrSearchControls' },
					h('span', { className: 'mgrLabel' }, t('search.mode')),
					h('button', {
						type: 'button',
						className: classes('mgrBtn', mode === 'merge' && 'mgrBtnPrimary'),
						disabled: !available,
						onClick: function () { if (mode !== 'merge') void props.onMode('merge'); },
					}, t('search.modeMerge')),
					h('button', {
						type: 'button',
						className: classes('mgrBtn', mode === 'fallback' && 'mgrBtnPrimary'),
						disabled: !available,
						onClick: function () { if (mode !== 'fallback') void props.onMode('fallback'); },
					}, t('search.modeFallback')),
					h('span', { className: 'mgrHint' }, mode === 'fallback' ? t('search.modeFallbackHint') : t('search.modeMergeHint')),
					h('label', { className: 'mgrSearchTimeWrap' },
						h('span', { className: 'mgrHint' }, t('search.time')),
						h('select', {
							className: 'mgrInput mgrSearchTime',
							value: props.timeRange || '',
							'aria-label': t('search.time'),
							onChange: function (event) { props.onTimeRange(event.target.value); },
						},
							h('option', { value: '' }, t('search.timeAny')),
							h('option', { value: 'day' }, t('search.timeDay')),
							h('option', { value: 'week' }, t('search.timeWeek')),
							h('option', { value: 'month' }, t('search.timeMonth')),
							h('option', { value: 'year' }, t('search.timeYear')))),
					hasCooldown ? h('button', {
						type: 'button',
						className: 'mgrBtn',
						onClick: function () { void props.onResetCooldowns(); },
					}, t('search.resetCooldowns')) : null),
				status === null ? h(Loading, { label: t('state.loading') }) : null,
				status !== null && statusError !== ''
					? h('div', { className: 'mgrErrorBox' }, h('span', null, t('search.statusError', { error: statusError })))
					: null,
				status !== null && enabled === 0 && statusError === ''
					? h('div', { className: 'mgrWarn' }, h('span', null, t('search.enabledNone')))
					: null,
				error === null ? null : h('div', { className: 'mgrErrorBox' },
					h('span', null,
						h('b', null, t('search.failed') + (typeof error.code === 'string' && error.code !== '' ? ' · ' + error.code : '')),
						h('br'),
						error.message)),
				busy ? h(Loading, { label: t('search.running') }) : null,
				!busy && result !== null ? resultView : null,
				!busy && result === null && error === null && status !== null && available
					? h('div', { className: 'mgrEmpty' }, t('search.emptyIdle'))
					: null,
				channelView);
		}

		//#endregion

		//#region lan view

		/**
		 * The QR code of the access link.
		 *
		 * The Host sends the module matrix as rows of `0` and `1`; the panel
		 * draws it as plain rectangles, so no image and no markup from the
		 * network ever reaches the page.
		 *
		 * @param {object} props - `rows` and `label`.
		 * @returns {object} React node.
		 */
		function QrCode(props) {
			var rows = props.rows;
			if (!Array.isArray(rows) || rows.length === 0) return null;
			var size = rows.length;
			var cells = [];
			for (var y = 0; y < size; y += 1) {
				var row = rows[y];
				if (typeof row !== 'string') continue;
				for (var x = 0; x < row.length; x += 1) {
					if (row[x] !== '1') continue;
					cells.push(h('rect', { key: x + '-' + y, x: x, y: y, width: 1, height: 1, fill: '#000' }));
				}
			}
			return h('svg', {
				className: 'mgrQr',
				viewBox: '0 0 ' + size + ' ' + size,
				role: 'img',
				'aria-label': props.label,
				shapeRendering: 'crispEdges',
			},
				h('rect', { x: 0, y: 0, width: size, height: size, fill: '#fff' }),
				cells);
		}

		/**
		 * The LAN access panel.
		 *
		 * @param {object} props - `t`, `state`, `busy`, `onToggle`, `onCopy`.
		 * @returns {object} React node.
		 */
		function LanSection(props) {
			var t = props.t;
			var state = props.state;
			var enabled = state !== null && state.enabled === true;
			var running = state !== null && state.running === true;
			var certificate = state === null || state.certificate === undefined ? null : state.certificate;
			return h('div', null,
				h('div', { className: 'mgrLanCard' },
					h('div', { className: 'mgrLanRow' },
						h('div', { className: 'mgrLanRowMain' },
							h('div', { className: 'mgrLanTitle' }, t('lan.switch')),
							h('div', { className: 'mgrLanHint' }, t('lan.switchHint'))),
						h(Switch, {
							checked: enabled,
							disabled: props.busy === true,
							label: t('lan.switch'),
							onChange: props.onToggle,
						})),
					enabled ? h('div', { className: 'mgrLanRow mgrLanRowSub' },
						h('div', { className: 'mgrLanRowMain' },
							h('div', { className: 'mgrLanTitle' }, t('lan.secure')),
							h('div', { className: 'mgrLanHint' }, t('lan.secureHint'))),
						h(Switch, {
							checked: state.secure === true,
							disabled: props.busy === true,
							label: t('lan.secure'),
							onChange: props.onToggleSecure,
						})) : null),
				state !== null && state.error !== ''
					? h('div', { className: 'mgrErrorBox' },
						h('span', null, t('lan.error') + '：' + state.error))
					: null,
				running && typeof state.url === 'string' && state.url !== ''
					? h('div', { className: 'mgrLanCard' },
						h('div', { className: 'mgrLanGrid' },
							h('div', { className: 'mgrQrBox' },
								h(QrCode, { rows: state.matrix, label: t('lan.qr') }),
								h('div', { className: 'mgrQrCaption' }, t('lan.qr'))),
							h('div', { className: 'mgrLanMain' },
								h('div', { className: 'mgrLanTitle' }, t('lan.url')),
								h('div', { className: 'mgrLanUrl' }, state.url),
								h('div', { className: 'mgrLanActions' },
									h('button', {
										type: 'button',
										className: 'mgrBtn',
										onClick: function () { props.onCopy(state.url); },
									}, t('lan.copy'))),
								h('div', { className: 'mgrLanMeta' },
									h('div', { className: 'mgrLanMetaRow' },
										h('span', { className: 'mgrLanMetaKey' }, t('lan.address')),
										h('span', { className: 'mgrLanMetaValue' }, state.address + ':' + String(state.port))),
									h('div', { className: 'mgrLanMetaRow' },
										h('span', { className: 'mgrLanMetaKey' }, t('lan.upstream')),
										h('span', { className: 'mgrLanMetaValue' }, state.upstream)),
									certificate ? h('div', { className: 'mgrLanMetaRow' },
										h('span', { className: 'mgrLanMetaKey' }, t('lan.certificate')),
										h('span', { className: 'mgrLanMetaValue' }, certificate.fingerprint)) : null,
									certificate ? h('div', { className: 'mgrLanMetaRow' },
										h('span', { className: 'mgrLanMetaKey' }, t('lan.certificateValid')),
										h('span', { className: 'mgrLanMetaValue' }, certificate.validTo)) : null))),
						state.secure === true ? h('div', { className: 'mgrLanTrust' },
							h('div', { className: 'mgrLanTitle' }, t('lan.trust')),
							h('div', { className: 'mgrLanHint' }, t('lan.trustHint')),
							h('div', { className: 'mgrLanActions' },
								h('button', {
									type: 'button',
									className: 'mgrBtn mgrBtnPrimary',
									onClick: function () { props.onDownloadCa(); },
								}, t('lan.downloadCa'))),
							h('div', { className: 'mgrLanHint mgrLanSteps' }, t('lan.ios')),
							h('div', { className: 'mgrLanHint mgrLanSteps' }, t('lan.android'))) : null,
						state.secure === true ? h('div', { className: 'mgrWarn' }, h('span', null, t('lan.certWarning'))) : null,
						h('div', { className: 'mgrWarn' }, h('span', null, t('lan.tokenWarning'))))
					: h('div', { className: 'mgrLanCard' },
						h('div', { className: 'mgrLanHint' }, t('lan.off')),
						state !== null && Array.isArray(state.addresses) && state.addresses.length > 0
							? h('div', { className: 'mgrLanMeta' },
								h('div', { className: 'mgrLanMetaRow' },
									h('span', { className: 'mgrLanMetaKey' }, t('lan.addresses')),
									h('span', { className: 'mgrLanMetaValue' }, state.addresses.join(', '))))
							: null));
		}

		//#endregion

		//#region modes view

		/**
		 * The modes panel: the agent presets this plugin ships.
		 *
		 * A switch registers the preset with the Host registry or drops it
		 * again. The composition is shown read-only, in the order the rows are
		 * mounted, so the difference to the standard preset is inspectable
		 * without reading the source.
		 *
		 * @param {object} props - `t`, `modes`, `busy`, `onToggle`.
		 * @returns {object} React node.
		 */
		function ModesSection(props) {
			var t = props.t;
			var state = props.modes;
			if (state === null || state === undefined || state.modes.length === 0) {
				return h('div', { className: 'mgrLanHint' }, t('modes.empty'));
			}
			return h('div', null,
				state.available !== true
					? h('div', { className: 'mgrWarn' }, h('span', null, t('modes.unavailable')))
					: null,
				h('div', { className: 'mgrLanHint mgrModeIntro' }, t('modes.hint')),
				state.modes.map(function (mode) {
					var stateLabel = mode.error !== ''
						? t('modes.failed')
						: mode.pending === true
							? t('modes.pending')
							: mode.registered === true ? t('modes.registered') : t('modes.unregistered');
					return h('div', { className: 'mgrLanCard', key: mode.id },
						h('div', { className: 'mgrLanRow' },
							h('div', { className: 'mgrLanRowMain' },
								h('div', { className: 'mgrLanTitle' },
									mode.name,
									h('span', { className: 'mgrModeTag' }, t('modes.owned'))),
								h('div', { className: 'mgrLanHint' }, mode.description)),
							h(Switch, {
								checked: mode.enabled === true,
								disabled: props.busy === true || state.available !== true,
								label: mode.name,
								onChange: function (next) { props.onToggle(mode.id, next); },
							})),
						mode.error === ''
							? null
							: h('div', { className: 'mgrErrorBox' }, h('span', null, t('modes.failed') + '：' + mode.error)),
						h('div', { className: 'mgrModeMeta' },
							h('span', {
								className: classes('mgrModeState', mode.error !== '' && 'mgrModeStateBad'),
							}, stateLabel),
							h('span', { className: 'mgrSpacer' }),
							h('span', null, String(mode.plugins.length) + ' ' + t('modes.rows'))),
						h('details', { className: 'mgrModeDetails' },
							h('summary', null, t('modes.composition')),
							h('div', { className: 'mgrModeRows' },
								mode.plugins.map(function (row) {
									return h('div', { className: 'mgrModeRow', key: row.id },
										h('span', { className: 'mgrModeRowId' }, row.id),
										h('span', { className: 'mgrModeRowPlugin' }, row.plugin),
										row.children.length === 0
											? null
											: h('span', { className: 'mgrModeRowChild' }, '（' + row.children.join('、') + '）'));
								})),
							mode.removed.length === 0
								? null
								: h('div', { className: 'mgrLanHint mgrModeRemoved' }, t('modes.removed') + '：' + mode.removed.join('、'))));
				}));
		}

		//#endregion

		//#region panel

		/**
		 * The management page.
		 *
		 * @param {object} props - Client context and translator.
		 * @returns {object} React node.
		 */
		function Panel(props) {
			var ctx = props.ctx;
			var t = props.t;
			var call = useCallback(function (endpoint, payload) { return callHost(ctx, endpoint, payload); }, [ctx]);
			var [tab, setTab] = useState('skills');
			var [data, setData] = useState(null);
			var [lan, setLan] = useState(null);
			var [error, setError] = useState('');
			var [busy, setBusy] = useState(false);
			var [toast, setToast] = useState(null);
			var [query, setQuery] = useState('');
			var [openCats, setOpenCats] = useState({});
			var [detail, setDetail] = useState(null);
			var [creating, setCreating] = useState(false);
			var [searchStatus, setSearchStatus] = useState(null);
			var [searchQuery, setSearchQuery] = useState('');
			var [searchResult, setSearchResult] = useState(null);
			var [searchError, setSearchError] = useState(null);
			var [searchBusy, setSearchBusy] = useState(false);
			var [searchTimeRange, setSearchTimeRange] = useState('');

			var searchRequest = useCallback(function (payload) {
				// Channel calls have their own 20s budget; the wider browser
				// budget covers the fan-out and a slow local event loop.
				return callHost(ctx, 'search-query', payload, 60000);
			}, [ctx]);

			var applyOverview = useCallback(function (value) {
				setData(value);
				setError('');
				// The overview carries the switch state; the full status with
				// the link and the code arrives from `lan-status`.
				setLan(function (current) {
					return current === null && value !== null && value.lan !== undefined ? value.lan : current;
				});
			}, []);

			var load = useCallback(function () {
				return call('overview').then(applyOverview).catch(function (reason) {
					setError(messageOf(reason));
				});
			}, [call, applyOverview]);

			useEffect(function () {
				void load();
			}, [load]);

			useEffect(function () {
				if (tab !== 'mcp') return undefined;
				var timer = setInterval(function () {
					call('mcp-status').then(function (mcp) {
						setData(function (current) {
							return current === null ? current : { ...current, mcp: mcp };
						});
					}).catch(function () {});
				}, 4000);
				return function () { clearInterval(timer); };
			}, [tab, call, applyOverview]);

			useEffect(function () {
				if (tab !== 'lan') return undefined;
				var readLan = function () {
					return call('lan-status').then(function (value) {
						setLan(value);
					}).catch(function () {});
				};
				void readLan();
				var timer = setInterval(readLan, 3000);
				return function () { clearInterval(timer); };
			}, [tab, call]);

			useEffect(function () {
				if (tab !== 'search') return undefined;
				var active = true;
				call('search-status').then(function (value) {
					if (active) setSearchStatus(value);
				}).catch(function (reason) {
					if (!active) return;
					setSearchStatus({
						channels: [],
						enabledCount: 0,
						maxResults: 20,
						perChannelResults: 10,
						error: messageOf(reason),
					});
				});
				return function () { active = false; };
			}, [tab, call]);

			useEffect(function () {
				if (toast === null || toast.error === true) return undefined;
				var timer = setTimeout(function () { setToast(null); }, 4000);
				return function () { clearTimeout(timer); };
			}, [toast]);

			function notify(message, isError) {
				setToast({ message: message, error: isError === true });
			}

			function run(promise, done) {
				setBusy(true);
				return promise.then(function (value) {
					if (done) done(value);
					return value;
				}).catch(function (reason) {
					notify(messageOf(reason), true);
					throw reason;
				}).then(function (value) {
					setBusy(false);
					return value;
				}, function (reason) {
					setBusy(false);
					throw reason;
				});
			}

			function refresh() {
				void run(call('skills-refresh'), function (value) {
					applyOverview(value);
					notify(t('state.refreshed'), false);
				}).catch(function () {});
			}

			function toggleCategory(name, enabled) {
				void run(call('skill-toggle', { category: name, enabled: enabled }), function (value) {
					applyOverview(value);
					notify(t('state.saved'), false);
				}).catch(function () {});
			}

			function toggleSkill(category, name, enabled) {
				void run(call('skill-toggle', { category: category, name: name, enabled: enabled }), function (value) {
					applyOverview(value);
					notify(t('state.saved'), false);
				}).catch(function () {});
			}

			function toggleMode(id, enabled) {
				void run(call('mode-toggle', { id: id, enabled: enabled }), function (value) {
					applyOverview(value);
					notify(enabled ? t('modes.on') : t('modes.off'), false);
				}).catch(function () {});
			}

			function createSkill(payload) {
				return call('skill-create', payload).then(function (value) {
					applyOverview(value.overview);
					setCreating(false);
					notify(t('state.created'), false);
				});
			}

			function mcpToggle(id, enabled) {
				void run(call('mcp-toggle', { id: id, enabled: enabled }), function (value) {
					applyOverview(value.overview);
					notify(t('state.saved'), false);
				}).catch(function () {});
			}

			function mcpReconnect(id) {
				void run(call('mcp-reconnect', { id: id }), function (value) {
					applyOverview(value.overview);
					notify(t('state.saved'), false);
				}).catch(function () {});
			}

			function mcpRemove(id) {
				return call('mcp-remove', { id: id }).then(function (value) {
					applyOverview(value);
					notify(t('state.deleted'), false);
				}).catch(function (reason) {
					notify(messageOf(reason), true);
					throw reason;
				});
			}

			function mcpSave(payload) {
				return call('mcp-save', payload).then(function (value) {
					applyOverview(value.overview);
					notify(t('state.saved'), false);
				});
			}

			function saveSearchChannel(payload) {
				return call('search-save', payload).then(function (value) {
					setSearchStatus(value);
					notify(t('state.saved'), false);
					return value;
				}).catch(function (reason) {
					notify(messageOf(reason), true);
					throw reason;
				});
			}

			function testSearchChannel(id, query) {
				return call('search-test', { id: id, query: query }).then(function (value) {
					// A failed test can start a cooldown; refresh the row badges.
					call('search-status').then(function (status) {
						setSearchStatus(status);
					}).catch(function () { /* keep the test result */ });
					return value;
				});
			}

			function moveSearchChannel(id, direction) {
				if (searchStatus === null || !Array.isArray(searchStatus.order)) return Promise.resolve();
				var order = searchStatus.order.slice();
				var index = order.indexOf(id);
				var target = direction === 'up' ? index - 1 : index + 1;
				if (index < 0 || target < 0 || target >= order.length) return Promise.resolve();
				order[index] = order[target];
				order[target] = id;
				return call('search-order', { ids: order }).then(function (value) {
					setSearchStatus(value);
					return value;
				}).catch(function (reason) {
					notify(messageOf(reason), true);
					throw reason;
				});
			}

			function setSearchMode(mode) {
				return call('search-mode', { mode: mode }).then(function (value) {
					setSearchStatus(value);
					return value;
				}).catch(function (reason) {
					notify(messageOf(reason), true);
					throw reason;
				});
			}

			function resetSearchCooldowns() {
				return call('search-cooldowns-clear').then(function (value) {
					setSearchStatus(value);
					setSearchResult(null);
					return value;
				}).catch(function (reason) {
					notify(messageOf(reason), true);
					throw reason;
				});
			}

			function searchWeb() {
				var text = searchQuery.trim();
				if (text === '') {
					setSearchError({ code: '', message: t('search.queryRequired') });
					return Promise.resolve();
				}
				setSearchBusy(true);
				setSearchError(null);
				setSearchResult(null);
				return searchRequest({ query: text, maxResults: 20, ...(searchTimeRange === '' ? {} : { timeRange: searchTimeRange }) }).then(function (value) {
					setSearchResult(value);
					return call('search-status').then(function (status) {
						setSearchStatus(status);
					}).catch(function () { /* search already succeeded; a stale status is harmless */ });
				}).catch(function (reason) {
					var code = reason !== null && typeof reason === 'object' && typeof reason.code === 'string' ? reason.code : '';
					setSearchError({ code: code, message: messageOf(reason) });
				}).then(function () {
					setSearchBusy(false);
				});
			}

			function lanToggle(enabled) {
				return run(call('lan-toggle', { enabled: enabled, secure: lan !== null && lan.secure === true }), function (value) {
					setLan(value);
					notify(t('state.saved'), false);
				}).catch(function () {});
			}

			function lanToggleSecure(secure) {
				return run(call('lan-toggle', { enabled: lan !== null && lan.enabled === true, secure: secure }), function (value) {
					setLan(value);
					notify(t('state.saved'), false);
				}).catch(function () {});
			}

			function lanDownloadCa() {
				return call('lan-ca').then(function (value) {
					if (value === null || value === undefined || typeof value.der !== 'string' || value.der === '') {
						throw new Error(t('lan.error'));
					}
					var binary = atob(value.der);
					var bytes = new Uint8Array(binary.length);
					for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
					var blob = new Blob([bytes], { type: 'application/x-x509-ca-cert' });
					var url = URL.createObjectURL(blob);
					var anchor = document.createElement('a');
					anchor.href = url;
					anchor.download = value.name;
					document.body.appendChild(anchor);
					anchor.click();
					anchor.remove();
					setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
					notify(t('lan.caDownloaded'), false);
				}).catch(function (reason) {
					notify(messageOf(reason), true);
				});
			}

			function lanCopy(url) {
				if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
					navigator.clipboard.writeText(url).then(function () {
						notify(t('lan.copied'), false);
					}).catch(function () {
						notify(t('lan.url') + ': ' + url, false);
					});
					return;
				}
				notify(t('lan.url') + ': ' + url, false);
			}

			var skillsCount = data === null ? 0 : data.skills.totals.skills;
			var mcpCount = data === null ? 0 : data.mcp.servers.length;
			var modesOn = data === null || data.modes === undefined ? 0 : data.modes.modes.filter(function (mode) { return mode.enabled === true; }).length;
			return h('div', { className: 'mgrRoot' },
				h('div', { className: 'mgrHead' },
					h('div', { className: 'mgrHeadMain' },
						h('h1', { className: 'mgrTitle' },
							t('panel'),
							data === null || data.version === '' ? null : h('span', { className: 'mgrVersion' }, 'v' + data.version)),
						h('div', { className: 'mgrSubtitle' },
							data === null ? t('state.loading') : t('subtitle') + ' · ' + data.dataDir)),
					h('div', { className: 'mgrHeadActions' },
						h('button', { type: 'button', className: 'mgrBtn', onClick: refresh, disabled: data === null || busy }, t('action.refresh')))),
				h('div', { className: 'mgrTabs', role: 'tablist' },
					h('button', {
						type: 'button',
						role: 'tab',
						'aria-selected': tab === 'skills',
						className: classes('mgrTab', tab === 'skills' && 'mgrTabActive'),
						onClick: function () { setTab('skills'); },
					}, t('tab.skills'), h('span', { className: 'mgrTabCount' }, String(skillsCount))),
					h('button', {
						type: 'button',
						role: 'tab',
						'aria-selected': tab === 'mcp',
						className: classes('mgrTab', tab === 'mcp' && 'mgrTabActive'),
						onClick: function () { setTab('mcp'); },
					}, t('tab.mcp'), h('span', { className: 'mgrTabCount' }, String(mcpCount))),
					h('button', {
						type: 'button',
						role: 'tab',
						'aria-selected': tab === 'search',
						className: classes('mgrTab', tab === 'search' && 'mgrTabActive'),
						onClick: function () { setTab('search'); },
					}, t('tab.search')),
					h('button', {
						type: 'button',
						role: 'tab',
						'aria-selected': tab === 'modes',
						className: classes('mgrTab', tab === 'modes' && 'mgrTabActive'),
						onClick: function () { setTab('modes'); },
					}, t('tab.modes'), h('span', { className: 'mgrTabCount' }, String(modesOn))),
					h('button', {
						type: 'button',
						role: 'tab',
						'aria-selected': tab === 'lan',
						className: classes('mgrTab', tab === 'lan' && 'mgrTabActive'),
						onClick: function () { setTab('lan'); },
					}, t('tab.lan'), lan !== null && lan.running === true
						? h('span', { className: 'mgrDot mgrDot-ready' })
						: null)),
				h('div', { className: 'mgrBody' },
					error === '' ? null : h('div', { className: 'mgrErrorBox' },
						h('span', null, t('error.banner') + '：' + error),
						h('span', { className: 'mgrSpacer' }),
						h('button', { type: 'button', className: 'mgrBtn', onClick: function () { void load(); } }, t('action.retry'))),
					data === null
						? (error === '' ? h(Loading, { label: t('state.loading') }) : null)
						: (tab === 'skills'
							? h(SkillsSection, {
								t: t,
								skills: data.skills,
								catalog: data.catalog,
								query: query,
								setQuery: setQuery,
								openCats: openCats,
								busy: busy,
								toggleCategory: function (name) {
									setOpenCats(function (current) {
										var next = { ...current };
										next[name] = current[name] !== true;
										return next;
									});
								},
								onToggleCategory: toggleCategory,
								onToggleSkill: toggleSkill,
								onOpenSkill: function (category, skill) { setDetail({ category: category, name: skill.name }); },
								onRefresh: refresh,
								onNew: function () { setCreating(true); },
							})
							: tab === 'mcp'
								? h(McpSection, {
									t: t,
									mcp: data.mcp,
									busy: busy,
									onToggle: mcpToggle,
									onReconnect: mcpReconnect,
									onRemove: mcpRemove,
									onSave: mcpSave,
								})
								: tab === 'search'
									? h(SearchSection, {
										t: t,
										status: searchStatus,
										query: searchQuery,
										setQuery: setSearchQuery,
										onSearch: searchWeb,
										onSave: saveSearchChannel,
										onTest: testSearchChannel,
										onMove: moveSearchChannel,
										onMode: setSearchMode,
										onResetCooldowns: resetSearchCooldowns,
										timeRange: searchTimeRange,
										onTimeRange: setSearchTimeRange,
										busy: searchBusy,
										result: searchResult,
										error: searchError,
									})
									: tab === 'modes'
										? h(ModesSection, {
											t: t,
											modes: data.modes,
											busy: busy,
											onToggle: toggleMode,
										})
										: h(LanSection, {
									t: t,
									state: lan,
									busy: busy,
									onToggle: lanToggle,
									onToggleSecure: lanToggleSecure,
									onCopy: lanCopy,
									onDownloadCa: lanDownloadCa,
								}))),
				detail === null ? null : h(SkillDetail, {
					category: detail.category,
					name: detail.name,
					call: call,
					t: t,
					onClose: function () { setDetail(null); },
				}),
				creating === false ? null : h(SkillCreate, {
					skills: data === null ? { categories: [], roots: [] } : data.skills,
					t: t,
					onClose: function () { setCreating(false); },
					onSubmit: createSkill,
				}),
				toast === null ? null : h('div', { className: classes('mgrToast', toast.error && 'mgrToastError'), role: 'status' },
					h('span', { className: 'mgrToastText' }, toast.message),
					h('button', {
						type: 'button',
						className: 'mgrToastClose',
						'aria-label': t('action.close'),
						onClick: function () { setToast(null); },
					}, '×')));
		}

		//#endregion

		//#region plugin

		var inject = ['slots', 'locale', 'connection'];

		/**
		 * Register the sidebar entry and the main panel.
		 *
		 * @param {object} ctx - Client context.
		 * @returns {void}
		 */
		function apply(ctx) {
			ctx.effect(function () {
				return ctx.locale.register(NS, { zh: zh, en: en });
			}, 'dsh-manager: dictionaries');
			var t = ctx.locale.bind(NS);

			ctx.effect(function () {
				var style = document.createElement('style');
				style.dataset.plugin = 'dsh-manager';
				style.textContent = css;
				document.head.appendChild(style);
				return function () { style.remove(); };
			}, 'dsh-manager: styles');

			ctx.effect(function () {
				return ctx.slots.inject('main', function () {
					return ctx.slots.register({
						name: 'main',
						key: PANEL_ID,
						locale: NS,
						inject: function () { return { ctx: ctx, t: t }; },
					}, Panel);
				});
			}, 'dsh-manager: main panel');

			ctx.effect(function () {
				return ctx.slots.inject('sidebar.panellist', function () {
					return ctx.slots.register({
						name: 'sidebar.panellist',
						id: PANEL_ID,
						order: PANEL_ORDER,
						locale: NS,
						label: function () { return t('panel'); },
					}, ManagerIcon);
				});
			}, 'dsh-manager: sidebar entry');
		}

		/**
		 * Sidebar mark: three sliders in the current text color.
		 *
		 * @param {object} props - `size`, `active`.
		 * @returns {object} React node.
		 */
		function ManagerIcon(props) {
			var size = props.size ?? 18;
			return h('svg', {
				viewBox: '0 0 24 24',
				width: size,
				height: size,
				fill: 'none',
				stroke: 'currentColor',
				strokeWidth: 1.7,
				strokeLinecap: 'round',
				'aria-hidden': true,
			},
				h('path', { d: 'M4 6h8' }),
				h('path', { d: 'M17 6h3' }),
				h('circle', { cx: 14.5, cy: 6, r: 2.5, fill: 'currentColor', stroke: 'none' }),
				h('path', { d: 'M4 12h2' }),
				h('path', { d: 'M11 12h9' }),
				h('circle', { cx: 8.5, cy: 12, r: 2.5, fill: 'currentColor', stroke: 'none' }),
				h('path', { d: 'M4 18h10' }),
				h('path', { d: 'M19 18h1' }),
				h('circle', { cx: 16.5, cy: 18, r: 2.5, fill: 'currentColor', stroke: 'none' }));
		}

		//#endregion

		return {
			inject: inject,
			apply: apply,
		};
	},
});
