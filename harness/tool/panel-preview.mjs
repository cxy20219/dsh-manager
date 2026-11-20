/**
 * Render the panel's client half offline, in a browser.
 *
 * The desktop app's web UI only answers with the token the app printed, so a
 * browser that was not opened from that URL cannot open the real panel. This
 * tool renders the same `client.js` against a fake Host instead: the real
 * component tree, the real CSS, the real locale strings, and fixture answers
 * for the `/api/manager` endpoints. It is for looking at the panel, not for
 * testing it — `npm test` stays the source of truth for behaviour.
 *
 * What it needs:
 *
 *   - React 18 UMD builds (a local copy, see `--react-dir`);
 *   - the Host theme CSS, extracted from `app.asar` with the running
 *     Electron runtime (`DSH_NODE_EXECUTABLE`), because the panel only uses
 *     `--dsw-alias-*` variables.
 *
 * Usage:
 *
 *   node harness/tool/panel-preview.mjs [--port 8123] [--tab tools]
 *
 * The script prints the URL it serves; open it, then look at the panel.
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SEARCH_CHANNELS } from '../../src/search-providers.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const CLIENT = join(ROOT, 'client.js')

/**
 * Read one option.
 *
 * @param {string[]} argv - Process arguments.
 * @param {string} name - Option name.
 * @param {string} fallback - Value when the option is absent.
 * @returns {string} The option value.
 */
function option(argv, name, fallback) {
	const index = argv.indexOf(name)
	if (index < 0 || index + 1 >= argv.length) return fallback
	return argv[index + 1]
}

/**
 * Extract one JavaScript literal by its assignment.
 *
 * The panel's dictionaries and its CSS array are plain literals, so they can
 * be read back out of the source instead of being maintained twice.
 *
 * @param {string} source - The file source.
 * @param {string} name - The variable name.
 * @returns {unknown} The evaluated value.
 */
function literal(source, name) {
	// The panel's own dictionary is indented inside the factory; the vendored
	// rewind client has a `var zh = {…}` of its own at column zero, and reading
	// that one silently leaves every panel label untranslated.
	const marker = `\t\tvar ${name} = `
	const start = source.indexOf(marker)
	if (start < 0) throw new Error(`client.js has no "${name}"`)
	const bodyStart = start + marker.length
	const open = source[bodyStart]
	const close = open === '{' ? '}' : ']'
	let depth = 0
	let quote = ''
	for (let index = bodyStart; index < source.length; index += 1) {
		const char = source[index]
		if (quote !== '') {
			if (char === '\\') { index += 1; continue }
			if (char === quote) quote = ''
			continue
		}
		if (char === '"' || char === "'") { quote = char; continue }
		if (char === open) depth += 1
		else if (char === close) {
			depth -= 1
			if (depth === 0) {
				const text = source.slice(bodyStart, index + 1)
				return new Function(`return (${text});`)()
			}
		}
	}
	throw new Error(`client.js: "${name}" is not closed`)
}

/**
 * Copy the Host theme stylesheets out of the installation.
 *
 * The panel only uses `--dsw-*` variables, and they are spread over several
 * files: `design-platform.css` holds the colours, `base.css` the radii and
 * the font. All of them are copied, so the preview looks like the real panel.
 *
 * @param {string} destination - Where to write the stylesheets.
 * @returns {boolean} True when the stylesheets were copied.
 */
function extractTheme(destination) {
	const runtime = process.env.DSH_NODE_EXECUTABLE
	const local = process.env.DSH_THEME_CSS_FILE
	if (local !== undefined && local !== '' && existsSync(local)) {
		copyFileSync(local, join(destination, 'design-platform.css'))
		return true
	}
	if (runtime === undefined || runtime === '') return false
	const source = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/src/styles'
	// `cpSync` does not walk into an archive, so the runtime copies file by file.
	const script = `const fs=require('node:fs'),path=require('node:path');
const src=${JSON.stringify(source)},dst=${JSON.stringify(destination)};
fs.mkdirSync(dst,{recursive:true});
for (const name of fs.readdirSync(src)) { if (name.endsWith('.css')) fs.copyFileSync(path.join(src,name),path.join(dst,name)); }`
	try {
		execFileSync(runtime, ['-e', script], {
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
			stdio: 'pipe',
		})
		return true
	} catch {
		return false
	}
}

/**
 * The channel rows the preview's `search-status` fixture answers with.
 *
 * The list comes from the real channel table, so the free / key / paid split
 * the panel counts is the one the Host would count. Only the switch and the
 * key state are made up: the preview needs a mix of on, off, keyed and
 * key-missing rows to look at.
 *
 * @returns {object[]} Channel views in the `search-status` shape.
 */
function previewChannels() {
	const on = new Set(['minimax', 'deepseek', 'openai', 'bing', 'ddg', 'exa', 'tavily', 'you', 'baidu-html'])
	const keyed = new Set(['minimax', 'deepseek', 'openai', 'exa', 'tavily', 'brave', 'jina', 'gemini'])
	return SEARCH_CHANNELS.map((channel) => ({
		id: channel.id,
		label: channel.label,
		description: channel.description,
		keyMode: channel.keyMode,
		requiresKey: channel.keyMode === 'required',
		keySupported: channel.keyMode !== 'none',
		keyOptional: channel.keyMode === 'optional',
		free: channel.free === true,
		defaultBaseUrl: channel.defaultBaseUrl,
		envName: channel.envName,
		enabled: on.has(channel.id),
		baseUrl: '',
		keyConfigured: keyed.has(channel.id),
		keyCount: keyed.has(channel.id) ? 1 : 0,
		keySource: keyed.has(channel.id) ? 'record' : '',
		keyWritable: channel.keyMode !== 'none',
		cooldownMs: 0,
	}))
}

/**
 * The fixture the preview answers the panel's endpoints with.
 *
 * @returns {object} The endpoint answers.
 */
function fixtures() {
	return {		overview: {
			version: '0.1.0',
			dataDir: '/tmp/dsh-manager',
			skills: { totals: { skills: 3, categories: 1, enabled: 3 }, categories: [], roots: [], conflicts: [] },
			catalog: { total: 3, visible: 3, managed: 3, external: [], missing: [], unavailable: false, error: '' },
			kernel: { mounted: true, routes: 48, error: '' },
			// One connected and one stopped server, so the MCP page renders its rows
			// (and its switches) instead of the empty state.
			mcp: {
				available: true,
				credentials: true,
				note: '',
				servers: [
					{
						id: 'demo-echo',
						name: 'demo-echo',
						enabled: true,
						state: 'ready',
						command: 'npx',
						args: ['-y', '@demo/echo'],
						cwd: '',
						envKeys: ['DEMO_KEY'],
						error: '',
						tools: [{ name: 'echo', description: 'Echo the input back.', parameters: null }],
					},
					{
						id: 'demo-files',
						name: 'demo-files',
						enabled: false,
						state: 'stopped',
						command: 'npx',
						args: ['-y', '@demo/files'],
						cwd: '',
						envKeys: [],
						error: '',
						tools: [],
					},
				],
			},
			lan: { enabled: false, running: false, address: '', port: 0, upstream: '', error: '' },
			modes: { available: true, modes: [] },
			tools: { total: 4 },
		},
		// The skill kernel answers its own envelope: `{ ok: true, data }`.
		state: {
			ok: true,
			data: {
				roots: [
					{
						key: 'dsh',
						label: 'DSH',
						path: '/Users/me/.dsh/skills',
						exists: true,
						mutable: true,
						enabled: true,
						skills: [
							{
								name: 'skill-creator',
								description: '创建、修改和校验可复用的 DSH 技能。',
								enabled: true,
								loadable: true,
								effectiveModelInvocable: true,
								customNote: '写新 skill 时先用它。',
							},
							{
								name: 'office-xlsx',
								description: 'Read, create, edit, and validate Excel workbooks, data, and formulas (.xlsx).',
								enabled: true,
								loadable: true,
								effectiveModelInvocable: true,
							},
							{
								name: 'broken-example',
								description: 'An entry whose frontmatter does not parse.',
								enabled: false,
								loadable: false,
								effectiveModelInvocable: false,
								path: '/Users/me/.dsh/skills/broken-example/SKILL.md',
								diagnostics: [{ level: 'error', code: 'diagnostic.name.invalid', params: { name: 'broken-example' } }],
							},
						],
					},
					{
						key: 'agents',
						label: '共享',
						path: '/Users/me/.agents/skills',
						exists: true,
						mutable: true,
						enabled: true,
						skills: [
							{
								name: 'humanizer-zh',
								description: '统一处理中文内容质量：错别字、语病、标点、术语与格式。',
								enabled: true,
								loadable: true,
								effectiveModelInvocable: true,
							},
						],
					},
				],
				trash: [],
				warnings: [],
			},
		},
		detail: {
			ok: true,
			data: {
				name: 'skill-creator',
				declaredName: 'skill-creator',
				description: '创建、修改和校验可复用的 DSH 技能。',
				descriptionTokens: 26,
				bodyTokens: 418,
				customNote: '写新 skill 时先用它。',
				path: '/Users/me/.dsh/skills/skill-creator/SKILL.md',
				body: '# skill-creator\n\n创建技能时先写 description，再写正文。',
				document: '---\nname: skill-creator\ndescription: 创建、修改和校验可复用的 DSH 技能。\n---\n\n# skill-creator\n',
				diagnostics: [],
				loadable: true,
				sourceReadOnly: false,
			},
		},
		// Project skills are read per workspace.
		workspaces: {
			ok: true,
			data: {
				items: [
					{ path: '/Users/me/projects/demo', name: 'demo', available: true, skillCount: 2 },
					{ path: '/Users/me/projects/other', name: 'other', available: false, skillCount: 0 },
				],
			},
		},
		'workspace-skills': {
			ok: true,
			data: {
				roots: [
					{
						key: 'project-dsh',
						label: '.dsh/skills',
						skills: [
							{ name: 'deploy-checklist', description: '部署前按这个清单走一遍。', enabled: true, loadable: true },
							{ name: 'release-notes', description: '按提交历史生成发布说明。', enabled: true, loadable: true },
						],
					},
				],
			},
		},
		'ui-status': {
			available: true,
			client: { mounted: true, reason: 'mounted', at: 0 },
			features: [
				{
					id: 'rewind',
					bundle: 'dsh-rewind-plugin',
					defaultEnabled: true,
					installed: true,
					available: true,
					enabled: true,
					title: { en: 'Conversation rewind', zh: '对话回退' },
					description: { en: 'Rewind the conversation in place, optionally restoring workspace files.', zh: '把对话回退到更早的消息，可选一并还原工作区文件。' },
					version: '0.22.2',
				},
				{
					id: 'composer-history',
					bundle: '',
					defaultEnabled: true,
					installed: true,
					available: true,
					enabled: true,
					clientOnly: true,
					title: { en: 'Composer history', zh: '输入框历史' },
					description: { en: 'Walk back through recently sent messages with ↑/↓ and send an edited one again.', zh: '在输入框按 ↑/↓ 翻出最近发送的消息，可以改完再发。' },
					version: '',
				},
			],
			featuresById: {},
		},
		'ui-toggle': {
			available: true,
			features: [
				{
					id: 'rewind',
					bundle: 'dsh-rewind-plugin',
					defaultEnabled: true,
					installed: true,
					available: true,
					enabled: false,
					title: { en: 'Conversation rewind', zh: '对话回退' },
					description: { en: 'Rewind the conversation in place, optionally restoring workspace files.', zh: '把对话回退到更早的消息，可选一并还原工作区文件。' },
					version: '0.22.2',
				},
			],
		},
		// Without this the search tab always rendered "读取搜索渠道失败" and the
		// settings pane looked empty.
		'search-status': {
			available: true,
			mode: 'merge',
			maxResults: 20,
			perChannelResults: 10,
			safeSearch: true,
			blockedDomains: [],
			cooldowns: {},
			error: '',
			channels: previewChannels(),
			enabledCount: previewChannels().filter((channel) => channel.enabled).length,
			order: previewChannels().map((channel) => channel.id),
		},
		preferences: {
			path: '/Users/me/.dsh/manager/system/AGENTS.md',
			agentsPath: '/Users/me/.dsh/AGENTS.md',
			mode: 'link',
			destination: '/Users/me/.dsh/manager/system/AGENTS.md',
			exists: true,
			readable: true,
			content: '# 全局偏好\n\n- 先说结论，再给方案\n- 改动前先读代码',
			bytes: 78,
			totalBytes: 79,
			cap: 65536,
		},
		'tools-list': {			groups: [
				{
					id: 'skills',
					tools: [
						{
							name: 'create_skill',
							description: 'Create a new local DSH skill in DSH_HOME/skills. Use only when the user explicitly asks to create or save a reusable skill.',
							parameters: {
								type: 'object',
								required: ['name', 'description', 'body'],
								properties: {
									name: { type: 'string', description: 'Skill name; it will be normalized to kebab-case.' },
									description: { type: 'string', description: 'A concise routing description for when to use the skill.' },
									body: { type: 'string', description: 'Markdown instructions that form the skill body.' },
								},
							},
							source: 'skills',
						},
					],
				},
				{
					id: 'mcp',
					tools: [
						{
							name: 'mcp__demo__echo',
							description: 'Echo the input back to the caller.',
							parameters: {
								type: 'object',
								required: ['text'],
								properties: {
									text: { type: 'string', description: 'Text to echo.' },
									times: { type: 'number', description: 'How many times to repeat it.' },
								},
							},
							source: 'demo',
						},
					],
				},
				{
					id: 'search',
					tools: [
						{
							name: 'web_search',
							description: "Search the web with the manager's enabled channels. One query, or up to three merged; narrow with timeRange, choose channels with sites.",
							parameters: {
								type: 'object',
								required: ['query'],
								properties: {
									query: { type: 'string', description: 'What to search for.' },
									queries: { type: 'array', items: { type: 'string' }, description: 'Extra queries merged with `query`.' },
									timeRange: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: 'Only results from this window.' },
									sites: { type: 'array', items: { type: 'string' }, description: 'Channel ids; omit for every enabled channel.' },
									maxResults: { type: 'number', description: 'Results to return, 1-20. Defaults to 8.' },
								},
							},
							source: 'search',
						},
						{
							name: 'search_source',
							description: 'Ask one named source directly instead of the open web. The target decides what the query means — package, DOI, repo, ticker, country, city or place.',
							parameters: {
								type: 'object',
								required: ['target', 'query'],
								properties: {
									target: { type: 'string', description: 'Which source to ask.', enum: ['github', 'hn', 'wikipedia', 'npm', 'arxiv', 'pypi', 'nvd'] },
									query: { type: 'string', description: 'What that source understands.' },
								},
							},
							source: 'search',
						},
						{ name: 'research', description: 'Research a question across several queries; `fromCache` only searches pages fetched earlier.', parameters: null, source: 'search' },
						{ name: 'video_search', description: 'Search videos across Bing Videos and DuckDuckGo Videos.', parameters: null, source: 'search' },
						{ name: 'weather', description: 'Current weather and a 1-7 day forecast from Open-Meteo.', parameters: null, source: 'search' },
					],
				},
				{ id: 'lan', tools: [] },
			],
		},
	}
}

const argv = process.argv.slice(2)
const port = Number(option(argv, '--port', '8123'))
const out = resolve(option(argv, '--out', join(process.env.TMPDIR ?? '/tmp', 'dsh-panel-preview')))
const reactDir = resolve(option(argv, '--react-dir', join(process.env.TMPDIR ?? '/tmp', 'dsh-preview-cache', 'node_modules')))
const startTab = option(argv, '--tab', 'tools')

mkdirSync(out, { recursive: true })

const source = readFileSync(CLIENT, 'utf8')
const zh = literal(source, 'zh')
const en = literal(source, 'en')
const css = literal(source, 'css').join('\n')

const react = join(reactDir, 'react', 'umd', 'react.production.min.js')
const reactDom = join(reactDir, 'react-dom', 'umd', 'react-dom.production.min.js')
for (const file of [react, reactDom]) {
	if (!existsSync(file)) throw new Error(`missing ${file}; install react@18 react-dom@18 into ${reactDir}`)
}
copyFileSync(react, join(out, 'react.js'))
copyFileSync(reactDom, join(out, 'react-dom.js'))
copyFileSync(CLIENT, join(out, 'client.js'))
writeFileSync(join(out, 'panel.css'), css)

const themed = extractTheme(join(out, 'theme'))
if (!themed) console.warn('[preview] no theme stylesheets; the panel renders with unset colours')

const answers = fixtures()
writeFileSync(join(out, 'fixtures.js'), `window.__DSH_PREVIEW_FIXTURES__ = ${JSON.stringify(answers)};\n`)
writeFileSync(join(out, 'i18n.js'), `window.__DSH_PREVIEW_DICTS__ = ${JSON.stringify({ zh, en })};\n`)

writeFileSync(join(out, 'index.html'), `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>dsh-manager panel preview</title>
<link rel="stylesheet" href="theme/base.css">
<link rel="stylesheet" href="theme/design-platform.css">
<link rel="stylesheet" href="theme/corner-shape.css">
<link rel="stylesheet" href="theme/focus.css">
<link rel="stylesheet" href="panel.css">
<style>
	html, body, #root { height: 100%; margin: 0; }
	body { background: var(--dsw-alias-bg-base); }
	#root { padding: 0; }
</style>
</head>
<body data-ds-dark-theme>
<div id="root"></div>
<script src="react.js"></script>
<script src="react-dom.js"></script>
<script src="fixtures.js"></script>
<script src="i18n.js"></script>
<script>
	window.__ModuleLoader__ = {
		load(definition) { window.__DSH_PREVIEW_DEFINITION__ = definition; },
	};
</script>
<script src="client.js"></script>
<script>
(function () {
	var dicts = window.__DSH_PREVIEW_DICTS__;
	var fixtures = window.__DSH_PREVIEW_FIXTURES__;
	var lang = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'zh';
	var dict = dicts[lang];

	function t(key, vars) {
		var text = dict[key];
		if (text === undefined) return key;
		if (vars === undefined || vars === null) return text;
		return text.replace(/\\{(\\w+)\\}/g, function (match, name) {
			return vars[name] === undefined ? match : String(vars[name]);
		});
	}

	window.fetch = function (input) {
		var url = String(input && input.url ? input.url : input);
		var endpoint = url.split('/api/manager/')[1];
		if (endpoint === undefined) return Promise.reject(new Error('preview: unknown endpoint ' + url));
		var body = fixtures[endpoint];
		if (body === undefined) body = { error: { code: 'dsh-manager/preview', message: 'no fixture for ' + endpoint } };
		return Promise.resolve({
			ok: true,
			status: 200,
			text: function () { return Promise.resolve(JSON.stringify(body)); },
			json: function () { return Promise.resolve(body); },
		});
	};

	var definition = window.__DSH_PREVIEW_DEFINITION__;
	if (definition === undefined) throw new Error('preview: the client module did not register');
	var plugin = definition.factory(function (name) {
		if (name === 'react') return window.React;
		throw new Error('preview: unexpected require ' + name);
	});

	var Main = null;
	var ctx = {
		effect: function (fn) { var dispose = fn(); if (typeof dispose === 'function') dispose(); },
		locale: {
			register: function () { return function () {}; },
			bind: function () { return t; },
		},
		slots: {
			inject: function (slot, callback) { return callback(); },
			register: function (slot, component) {
				if (slot.name === 'main') Main = component;
				return function () {};
			},
		},
		get: function (name) {
			if (name === 'connection') return { fetch: { register: function () { return function () {}; } } };
			return undefined;
		},
	};
	plugin.apply(ctx);
	if (Main === null) throw new Error('preview: the panel did not register');

	window.ReactDOM.createRoot(document.getElementById('root')).render(
		window.React.createElement(Main, { ctx: ctx, t: t }),
	);

	var wanted = ${JSON.stringify(startTab)};
	setTimeout(function () {
		var buttons = Array.prototype.slice.call(document.querySelectorAll('button'));
		var target = buttons.filter(function (button) { return (button.textContent || '').indexOf(wanted) >= 0; })[0];
		if (target !== undefined) target.click();
	}, 400);
}());
</script>
</body>
</html>
`)

const server = createServer((request, response) => {
	const name = (request.url ?? '/').split('?')[0]
	const file = name === '/' ? 'index.html' : name.replace(/^\//, '')
	const path = join(out, file)
	if (!existsSync(path)) {
		response.writeHead(404)
		response.end('not found')
		return
	}
	const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
	const type = types[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream'
	response.writeHead(200, { 'content-type': `${type}; charset=utf-8` })
	response.end(readFileSync(path))
})

server.listen(port, '127.0.0.1', () => {
	console.log(`[preview] http://127.0.0.1:${port}/ (tab: ${startTab})`)
})
