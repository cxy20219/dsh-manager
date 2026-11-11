/*
 * dsh-manager — browser half.
 *
 * One sidebar entry opens one management page with two tabs:
 * 技能 (hierarchical categories under ~/.agents/skills) and MCP (stdio servers).
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
			'subtitle': '技能分类、MCP 服务与局域网访问',
			'tab.skills': '技能',
			'tab.mcp': 'MCP',
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
			'lan.certWarning': '证书是本机自签的，手机浏览器会提示"不安全"，选择继续访问即可。',
			'lan.noAddress': '没有检测到局域网 IPv4 地址，请先连上局域网。',
			'lan.error': '开启失败',
			'lan.addresses': '检测到的地址',
		};

		var en = {
			'panel': 'Manager',
			'subtitle': 'Skill categories, MCP servers and LAN access',
			'tab.skills': 'Skills',
			'tab.mcp': 'MCP',
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
			'lan.certWarning': 'The certificate is self-signed, so a phone browser calls the page unsafe; continue anyway.',
			'lan.noAddress': 'No LAN IPv4 address was found; connect to a network first.',
			'lan.error': 'Could not start',
			'lan.addresses': 'Detected addresses',
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
		].join('\n');

		//#endregion

		//#region helpers

		/**
		 * Call one `/api/manager` endpoint on the Host.
		 *
		 * @param {object} ctx - Client context.
		 * @param {string} endpoint - Endpoint name.
		 * @param {object} payload - JSON payload.
		 * @returns {Promise<object>} The endpoint's value.
		 */
		function callHost(ctx, endpoint, payload) {
			if (ctx.get('connection') === undefined) return Promise.reject(new Error('连接不可用'));
			var options = {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload ?? {}),
				credentials: 'same-origin',
			};
			if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
				options.signal = AbortSignal.timeout(30000);
			}
			return fetch(API_PREFIX + '/' + endpoint, options).then(function (response) {
				return response.json().then(function (value) {
					// The error envelope is an object with a code and a message.
					// A plain `error` string in a payload is data, not a failure.
					var error = value !== null && typeof value === 'object' && value.error !== null && typeof value.error === 'object'
						? value.error
						: undefined;
					if (!response.ok || error !== undefined) {
						throw new Error((error && (error.message || error.code)) || ('HTTP ' + response.status));
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
						}))),
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
						h('div', { className: 'mgrWarn' }, h('span', null, t('lan.certWarning'))),
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

			function lanToggle(enabled) {
				return run(call('lan-toggle', { enabled: enabled }), function (value) {
					setLan(value);
					notify(t('state.saved'), false);
				}).catch(function () {});
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
								: h(LanSection, {
									t: t,
									state: lan,
									busy: busy,
									onToggle: lanToggle,
									onCopy: lanCopy,
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
