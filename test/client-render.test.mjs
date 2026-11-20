/**
 * Panel render tests.
 *
 * The browser half is a single ES module that registers a React component with
 * the Host's module loader, so it never imports `react` at the top: it asks the
 * loader for it. These tests run the real module inside a `vm` context with a
 * tiny React stand-in — element tree, instance-scoped `useState`, `useEffect`
 * with dependency deduplication — and then click the rendered buttons the way
 * an operator would. That makes layout regressions (a pane that stops showing,
 * a search button that stops firing) fail here instead of in the panel.
 *
 * The stand-in deliberately does not implement the React scheduler: state
 * updates are visible after the next `settle()` render, which is all a
 * synchronous click test needs.
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const SOURCE = await readFile(new URL('../client.js', import.meta.url), 'utf8')

/**
 * One channel view, in the shape `search-status` returns.
 *
 * @param {string} id - Channel id.
 * @param {string} label - Channel label.
 * @param {object} [extra] - Field overrides.
 * @returns {object} The channel view.
 */
function makeChannel(id, label, extra = {}) {
	return {
		id,
		label,
		description: `${label} description.`,
		keyMode: 'none',
		requiresKey: false,
		keySupported: false,
		keyOptional: false,
		free: true,
		defaultBaseUrl: '',
		envName: '',
		enabled: false,
		baseUrl: '',
		keyConfigured: false,
		keySource: '',
		keyWritable: true,
		cooldownMs: 0,
		...extra,
	}
}

/** A four-channel list: two enabled, two off. */
function makeChannels() {
	return [
		makeChannel('exa', 'Exa', {
			keyMode: 'optional',
			keySupported: true,
			keyOptional: true,
			keyConfigured: true,
			keySource: 'record',
			enabled: true,
			defaultBaseUrl: 'https://api.exa.ai',
			envName: 'EXA_API_KEY',
			description: 'Semantic search.',
		}),
		makeChannel('tavily', 'Tavily', {
			keyMode: 'optional',
			keySupported: true,
			keyOptional: true,
			enabled: true,
			defaultBaseUrl: 'https://api.tavily.com',
			envName: 'TAVILY_API_KEY',
			description: 'AI-optimized search.',
		}),
		makeChannel('bing', 'Bing', {
			defaultBaseUrl: 'https://www.bing.com',
			description: 'HTML search.',
		}),
		makeChannel('searxng', 'SearXNG', {
			keyMode: 'optional',
			keySupported: true,
			keyOptional: true,
			defaultBaseUrl: 'http://127.0.0.1:8080',
			envName: 'SEARXNG_API_KEY',
			description: 'Self-hosted metasearch.',
		}),
	]
}

/**
 * The `search-status` payload.
 *
 * @param {object[]} channels - Channel views.
 * @param {object} [extra] - Field overrides.
 * @returns {object} The status view.
 */
function makeStatus(channels, extra = {}) {
	return {
		channels,
		enabledCount: channels.filter((channel) => channel.enabled === true).length,
		maxResults: 20,
		perChannelResults: 10,
		mode: 'merge',
		order: channels.map((channel) => channel.id),
		safeSearch: true,
		blockedDomains: ['csdn.net'],
		cooldowns: {},
		cacheTtlMs: 300000,
		...extra,
	}
}

/** The `search-query` payload. */
function makeResult() {
	return {
		query: 'DeepSeek Harness',
		elapsedMs: 123,
		maxResults: 20,
		timeRange: '',
		sources: [
			{
				url: 'https://exa.example/1',
				title: 'Exa result',
				snippet: 'Exa snippet',
				publishedAt: '2026-01-01',
				channel: 'exa',
				channelLabel: 'Exa',
			},
			{
				url: 'https://tavily.example/1',
				title: 'Tavily result',
				snippet: 'Tavily snippet',
				publishedAt: '',
				channel: 'tavily',
				channelLabel: 'Tavily',
			},
		],
		channels: [
			{ id: 'exa', label: 'Exa', ok: true, count: 1, elapsedMs: 100 },
			{ id: 'tavily', label: 'Tavily', ok: false, count: 0, elapsedMs: 50, error: { code: 'auth', message: 'Tavily API key rejected' } },
		],
		content: 'A channel answer.',
	}
}

/** The `overview` payload the panel needs before it renders any tab. */
function makeOverview() {
	return {
		version: '0.1.0',
		dataDir: '/tmp/dsh-manager',
		skills: {
			totals: { skills: 0, categories: 0, enabled: 0 },
			categories: [],
			roots: [{ path: '/tmp/skills', exists: true }],
			conflicts: [],
		},
		catalog: { total: 0, visible: 0, managed: 0, external: [], missing: [], unavailable: false, error: '' },
		kernel: { mounted: true, routes: 48, error: '' },
		mcp: { available: true, servers: [], credentials: true, note: '' },
		lan: { enabled: false, running: false, address: '', port: 0, upstream: '', error: '' },
		modes: { available: true, modes: [] },
		tools: { total: 4 },
	}
}

/**
 * The `tools-list` payload: one group per module.
 *
 * @returns {object} The catalog view.
 */
function makeToolsCatalog() {
	return {
		groups: [
			{
				id: 'skills',
				tools: [
					{
						name: 'create_skill',
						description: 'Create a new local DSH skill.',
						parameters: {
							type: 'object',
							required: ['name'],
							properties: { name: { type: 'string', description: 'Skill name.' } },
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
						description: 'Echo the input.',
						parameters: {
							type: 'object',
							properties: { text: { type: 'string', description: 'Text to echo.' } },
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
						description: 'Search the web.',
						parameters: {
							type: 'object',
							required: ['queries'],
							properties: {
								queries: { type: 'array', items: { type: 'string' }, description: 'One to three queries.' },
							},
						},
						source: 'search',
					},
				],
			},
			{ id: 'lan', tools: [] },
		],
	}
}

/**
 * Load `client.js` in a sandbox and return a clickable application.
 *
 * @param {object} [options] - Fixture overrides: `channels`, `mode`,
 *   `failQuery`, `failStatus`.
 * @returns {Promise<object>} The application handle.
 */
/** The kernel `state` payload the skills workspace reads. */
function makeKernelState(overrides = {}) {
	return {
		roots: [
			{
				key: 'dsh',
				label: 'DSH',
				path: '/tmp/dsh/skills',
				exists: true,
				mutable: true,
				enabled: true,
				skills: [
					{ name: 'demo-skill', description: 'Demo description', enabled: true, loadable: true, effectiveModelInvocable: true },
				],
			},
		],
		trash: [],
		warnings: [],
		...overrides,
	}
}

/** The kernel `detail` payload for one skill. */
function makeKernelDetail(payload) {
	return {
		name: payload.name,
		declaredName: payload.name,
		description: 'Demo description',
		descriptionTokens: 4,
		bodyTokens: 12,
		customNote: '',
		path: '/tmp/dsh/skills/' + payload.name + '/SKILL.md',
		body: '# Demo body',
		document: '---\nname: demo-skill\n---\n\n# Demo body\n',
		diagnostics: [],
		loadable: true,
		sourceReadOnly: false,
	}
}

async function createApp(options = {}) {
	const channels = options.channels ?? makeChannels()
	const status = makeStatus(channels, options.status ?? {})
	const result = makeResult()
	const requests = []
	const kernelState = options.kernelState ?? makeKernelState()
	const handlers = {
		overview: () => makeOverview(),
		// Kernel routes answer the kernel envelope `{ ok, data }`; host actions
		// above answer the bare value the panel reads.
		state: () => ({ ok: true, data: kernelState }),
		detail: (payload) => ({ ok: true, data: makeKernelDetail(payload) }),
		'skill-note': () => ({ ok: true, data: {} }),
		create: () => ({ ok: true, data: {} }),
		enable: () => ({ ok: true, data: {} }),
		disable: () => ({ ok: true, data: {} }),
		'source-enable': () => ({ ok: true, data: {} }),
		'source-disable': () => ({ ok: true, data: {} }),
		'workspaces': () => ({ ok: true, data: { items: [] } }),
		'workspace-skills': () => ({ ok: true, data: { roots: [] } }),
		'trash-restore': () => ({ ok: true, data: {} }),
		'trash-delete': () => ({ ok: true, data: {} }),
		'clawhub/list': () => ({
			ok: true,
			data: { items: [{ ownerHandle: 'owner', slug: 'tool', displayName: 'Tool', summary: 'Tool summary', stats: { downloads: 10, installs: 3, stars: 2 } }] },
		}),
		'clawhub/search': () => ({
			ok: true,
			data: { results: [{ ownerHandle: 'owner', slug: 'hit', displayName: 'Hit', summary: 'Hit summary' }] },
		}),
		'search-status': () => {
			if (options.failStatus === true) {
				return { error: { code: 'dsh-manager/unavailable', message: '搜索服务未注册' } }
			}
			return status
		},
		preferences: () => ({
			path: '/tmp/dsh-manager/system/AGENTS.md',
			agentsPath: '/tmp/dsh/AGENTS.md',
			mode: 'link',
			destination: '/tmp/dsh-manager/system/AGENTS.md',
			exists: true,
			readable: true,
			content: '# 全局规则\n\n- 先说结论',
			bytes: 30,
			totalBytes: 31,
			cap: 65536,
		}),
		'preferences-save': (payload) => ({
			path: '/tmp/dsh-manager/system/AGENTS.md',
			agentsPath: '/tmp/dsh/AGENTS.md',
			mode: 'link',
			destination: '/tmp/dsh-manager/system/AGENTS.md',
			exists: true,
			readable: true,
			content: String(payload.content ?? '').replace(/\s+$/, ''),
			bytes: 30,
			totalBytes: 31,
			cap: 65536,
		}),
		'ui-status': () => ({
			available: true,
			features: [
				{
					id: 'rewind',
					title: '对话回退',
					description: '把对话回退到更早的消息，可选一并还原工作区文件。',
					enabled: true,
					defaultEnabled: true,
					mounted: true,
					version: '0.22.2',
				},
				{
					id: 'composer-history',
					title: '输入框历史',
					description: '在输入框按 ↑/↓ 翻出最近发送的消息，可以改完再发。',
					enabled: true,
					defaultEnabled: true,
					mounted: true,
					clientOnly: true,
					version: '',
				},
			],
		}),
		'ui-toggle': (payload) => ({
			available: true,
			features: [
				{
					id: 'rewind',
					title: '对话回退',
					description: '把对话回退到更早的消息，可选一并还原工作区文件。',
					enabled: payload.enabled === true,
					defaultEnabled: true,
					mounted: true,
					version: '0.22.2',
				},
			],
		}),
		candidates: () => ({
			ok: true,
			value: {
				candidates: [
					{ seq: 12, time: 1700000000000, preview: 'first question' },
					{ seq: 9, time: 1699999999000, preview: 'older question' },
				],
			},
		}),
		'tools-list': () => {
			if (options.failTools === true) {
				return { error: { code: 'dsh-manager/tools-offline', message: '工具目录不可用' } }
			}
			return makeToolsCatalog()
		},
		'search-query': (payload) => ({ ...result, query: payload.query, timeRange: payload.timeRange ?? '' }),
		'search-test-all': () => ({
			ok: 1,
			total: 2,
			results: [
				{ id: 'exa', label: 'Exa', ok: true, count: 3 },
				{ id: 'tavily', label: 'Tavily', ok: false, count: 0, failure: { code: 'auth', message: 'bad key' } },
			],
		}),
		'search-save': () => status,
		'search-mode': (payload) => ({ ...status, mode: payload.mode }),
		'search-safe-search': (payload) => ({ ...status, safeSearch: payload.safeSearch }),
		'search-blocked-domains': () => status,
		'search-cooldowns-clear': () => status,
	}

	/**
	 * The Host's `/api/manager` seam, mocked per endpoint.
	 *
	 * @param {string} input - Request URL.
	 * @param {object} init - Request options.
	 * @returns {Promise<object>} A fetch-like response.
	 */
	async function fakeFetch(input, init) {
		const url = String(input)
		// Every route this plugin owns lives under `/api/manager/`; the rest is
		// the kernel path (`state`, `clawhub/list`, …) or the host action.
		const endpoint = url.includes('/api/manager/')
			? url.split('/api/manager/')[1].split('?')[0]
			: url.includes('dsh-rewind/')
				? url.split('dsh-rewind/')[1].split('?')[0]
				: url.slice(url.lastIndexOf('/') + 1)
		const payload = typeof init?.body === 'string' && init.body !== '' ? JSON.parse(init.body) : {}
		requests.push({ endpoint, payload, url })
		// `client.js` reads the raw body and parses it itself so a non-JSON
		// answer (an unloaded plugin, an authenticating proxy) becomes a readable
		// error instead of `Unexpected token`. The stand-in therefore has to
		// expose the same body through `text()`; `json()` stays for older paths.
		const reply = (status, ok, value) => ({
			ok,
			status,
			json: async () => value,
			text: async () => JSON.stringify(value),
		})
		if (options.failQuery === true && endpoint === 'search-query') {
			return reply(400, false, { error: { code: 'dsh-manager/search-offline', message: '搜索请求被拒绝' } })
		}
		if (options.failSaveId !== undefined && endpoint === 'search-save' && payload.id === options.failSaveId) {
			return reply(500, false, { error: { code: 'dsh-manager/search-save-failed', message: '渠道开关保存失败' } })
		}
		// A save that never lands, so a test can look at the panel mid-batch.
		if (options.stallSave === true && endpoint === 'search-save') {
			return new Promise(() => {})
		}
		const handler = handlers[endpoint]
		return reply(200, true, handler === undefined ? null : handler(payload))
	}

	// ---- React stand-in -----------------------------------------------------

	const effects = []
	/** Cleanups of the plugin scope, run when the test tears down. */
	const scopeCleanups = []
	/** Slot registrations, so a test can render one on its own. */
	const slotRegistrations = new Map()
	/** The entries of a slot, as the chat UI would register them. */
	const slotEntries = new Map()
	/** Pending timers, so a test can run the retries. */
	const timers = []
	/** Slots another client package has declared; the panel's own two are there from the start. */
	const declaredSlots = new Set(['main', 'sidebar.panellist'])
	/** Injections waiting for their slot to be declared. */
	const pendingInjections = []
	const instances = new WeakMap()
	const hookKinds = new WeakMap()
	let currentComponent = null
	let currentKinds = null
	let hookCursor = 0
	let rootTree = null

	/**
	 * Record one hook kind for the component being rendered.
	 *
	 * React throws when the number or order of hooks changes between renders;
	 * a stand-in that stores hooks by index would otherwise silently misread
	 * the previous values, so the kinds are compared per component instead.
	 *
	 * @param {string} kind - Hook kind.
	 */
	function recordHook(kind) {
		if (currentKinds !== null) currentKinds.push(kind)
	}

	function instanceOf() {
		let instance = instances.get(currentComponent)
		if (instance === undefined) {
			instance = { state: [], effects: [], refs: [] }
			instances.set(currentComponent, instance)
		}
		return instance
	}

	function useState(initial) {
		recordHook('state')
		const instance = instanceOf()
		const index = hookCursor
		hookCursor += 1
		if (index >= instance.state.length) instance.state.push(initial)
		return [
			instance.state[index],
			(next) => {
				instance.state[index] = typeof next === 'function' ? next(instance.state[index]) : next
			},
		]
	}

	function useEffect(fn, deps) {
		recordHook('effect')
		const instance = instanceOf()
		const index = hookCursor
		hookCursor += 1
		const key = JSON.stringify(deps ?? [], (_key, value) => (typeof value === 'function' ? 'fn' : value))
		if (instance.effects[index]?.key === key) return
		instance.effects[index] = { key }
		effects.push({ run: fn })
	}

	function useCallback(fn) {
		recordHook('callback')
		return fn
	}

	function useRef(value) {
		recordHook('ref')
		const instance = instanceOf()
		const index = hookCursor
		hookCursor += 1
		if (instance.refs[index] === undefined) instance.refs[index] = { current: value }
		return instance.refs[index]
	}

	function createElement(type, props, ...children) {
		const flat = children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false)
		return {
			type,
			props: { ...(props ?? {}), children: flat.length === 0 ? undefined : flat.length === 1 ? flat[0] : flat },
			children: flat,
		}
	}

	const react = { createElement, useState, useEffect, useCallback, useRef }

	// ---- module load --------------------------------------------------------

	const moduleExports = {}
	const sandbox = {
		// `window` is the page object itself, the way it is in the browser: the
		// panel hangs state like the rewind bridge off it.
		window: null,
		document: {
			createElement() { return { dataset: {}, textContent: '', remove() {}, click() {}, appendChild() {} } },
			head: { appendChild() {} },
			body: { appendChild() {}, removeChild() {} },
			// The panel and its features hang page-level listeners here; the tests
			// dispatch through the same registry.
			listeners: new Map(),
			addEventListener(type, fn) {
				const list = this.listeners.get(type) ?? []
				list.push(fn)
				this.listeners.set(type, list)
			},
			removeEventListener(type, fn) {
				const list = (this.listeners.get(type) ?? []).filter((entry) => entry !== fn)
				this.listeners.set(type, list)
			},
		},
		navigator: {},
		URL,
		AbortSignal,
		Event: class Event {
			constructor(type, init) { this.type = type; Object.assign(this, init) }
		},
		fetch: fakeFetch,
		setInterval() { return 0 },
		clearInterval() {},
		setTimeout(fn, delay) {
			// The harness keeps the timers so a retry loop can be stepped by hand.
			timers.push({ fn, delay })
			return timers.length
		},
		clearTimeout() {},
		atob() { return '' },
		console,
	}
	sandbox.window = sandbox
	// The composer history listens on window as well as on the document.
	sandbox.addEventListener = (type, fn) => sandbox.document.addEventListener(type, fn)
	sandbox.removeEventListener = (type, fn) => sandbox.document.removeEventListener(type, fn)
	sandbox.localStorage = {
		store: new Map(),
		getItem(key) { return this.store.has(key) ? this.store.get(key) : null },
		setItem(key, value) { this.store.set(key, String(value)) },
	}
	sandbox.window.__ModuleLoader__ = { load(definition) { moduleExports.definition = definition } }
	vm.createContext(sandbox)
	vm.runInContext(SOURCE, sandbox, { filename: 'client.js' })
	const definition = moduleExports.definition
	assert.ok(definition !== undefined, 'client module did not register')

	let main = null
	const plugin = definition.factory((name) => {
		if (name === 'react') return react
		throw new Error(`unexpected require: ${name}`)
	})
	const fakeSlots = {
		inject(slot, callback) {
			// A slot has to be declared before it can be injected into.
			if (!declaredSlots.has(slot)) {
				pendingInjections.push({ slot, callback })
				return () => {}
			}
			return callback()
		},
		register(slot, component) {
			if (slot.name === 'main') main = component
			else slotRegistrations.set(slot.id ?? slot.name, { slot, component })
			return () => {}
		},
		entries(key) {
			return slotEntries.get(key) ?? []
		},
		subscribe() {
			return () => {}
		},
	}
	plugin.apply({
		effect(fn) {
			// A plugin scope's cleanup runs when the scope is torn down, not on
			// the next render; keeping it out of the React effect queue lets a
			// retry loop survive, the way it does in the Host.
			const dispose = fn()
			if (typeof dispose === 'function') scopeCleanups.push(dispose)
		},
		locale: { register() { return () => {} }, bind() { return (key) => key } },
		slots: fakeSlots,
		// The vendored rewind half mounts only when these are present.
		sessions: {
			list: { getSnapshot() { return { byId: { 'session-1': { retainedBy: { mainView: 1 } } } } } },
			binding(id) {
				if (id !== 'session-1') return undefined;
				return { session: { getSnapshot() { return { subagent: null } }, command() { return Promise.resolve({ ok: true }) } } };
			},
		},
		commandUi: {},
		get(name) {
			if (name === 'connection') return { fetch: { register() { return () => {} } } }
			return undefined
		},
	})
	assert.ok(main !== null, 'main panel was not registered')

	const ctx = {
		get(name) {
			if (name === 'connection') return { fetch: { register() { return () => {} } } }
			return undefined
		},
	}
	const translate = (key) => key

	// ---- render and interaction helpers ------------------------------------

	function renderNode(node) {
		if (node === null || node === undefined || typeof node === 'boolean') return null
		if (typeof node === 'string' || typeof node === 'number') return String(node)
		if (Array.isArray(node)) return node.map(renderNode).filter((child) => child !== null)
		if (typeof node.type === 'function') {
			const previousComponent = currentComponent
			const previousCursor = hookCursor
			const previousKinds = currentKinds
			currentComponent = node.type
			hookCursor = 0
			currentKinds = []
			let rendered
			try {
				rendered = node.type(node.props ?? {})
			} finally {
				const kinds = currentKinds.join(',')
				const before = hookKinds.get(node.type)
				assert.ok(
					before === undefined || before === kinds,
					`${node.type.name || 'component'} changed its hook order: ${before} → ${kinds}`,
				)
				hookKinds.set(node.type, kinds)
				currentComponent = previousComponent
				hookCursor = previousCursor
				currentKinds = previousKinds
			}
			return renderNode(rendered)
		}
		return {
			type: node.type,
			props: node.props ?? {},
			children: (node.children ?? []).map(renderNode).filter((child) => child !== null),
		}
	}

	/** A component rendered on its own, outside the main panel. */
	let standalone = null;

	function renderRoot() {
		if (standalone !== null) {
			rootTree = renderNode(createElement(standalone.component, standalone.props));
			return;
		}
		rootTree = renderNode(createElement(main, { ctx, t: translate }))
	}

	/** Let promises settle and effects run, then render again. */
	async function settle() {
		for (let round = 0; round < 8; round += 1) {
			renderRoot()
			const queued = effects.splice(0)
			for (const entry of queued) entry.run()
			await new Promise((resolve) => setImmediate(resolve))
		}
	}

	function textOf(node) {
		if (node === null || node === undefined) return ''
		if (typeof node === 'string') return node
		if (Array.isArray(node)) return node.map(textOf).filter((part) => part !== '').join(' ')
		if (node.props !== undefined && node.props.style !== undefined && node.props.style.display === 'none') return ''
		return textOf(node.children)
	}

	function findVisible(predicate) {
		const found = []
		const visit = (node) => {
			if (node === null || node === undefined || typeof node !== 'object') return
			if (Array.isArray(node)) {
				for (const child of node) visit(child)
				return
			}
			if (node.props !== undefined && node.props.style !== undefined && node.props.style.display === 'none') return
			if (predicate(node) === true) found.push(node)
			visit(node.children)
		}
		visit(rootTree)
		return found
	}

	function text() {
		return textOf(rootTree)
	}

	/** Click the first visible button whose text contains `label`. */
	async function click(label) {
		const matches = findVisible((node) => node.type === 'button' && textOf(node).includes(label))
		assert.ok(matches.length > 0, `no visible button containing "${label}"`)
		matches[0].props.onClick()
		await settle()
	}

	/** Every visible button whose text contains `label`, in drawing order. */
	function buttons(label) {
		return findVisible((node) => node.type === 'button' && textOf(node).includes(label))
	}


	/** The visible input carrying `placeholder`. */
	function input(placeholder) {
		const [node] = findVisible((candidate) => candidate.type === 'input' && candidate.props.placeholder === placeholder)
		assert.ok(node !== undefined, `no input with placeholder "${placeholder}"`)
		return node
	}

	/** The visible select carrying `label`. */
	function select(label) {
		const [node] = findVisible((candidate) => candidate.type === 'select' && candidate.props['aria-label'] === label)
		assert.ok(node !== undefined, `no select labelled "${label}"`)
		return node
	}

	const app = {
		requests,
		sandbox,
		slotRegistrations,
		slots: fakeSlots,
		text,
		click,
		buttons,
		/**
		 * Declare a slot, the way another client package would.
		 *
		 * @param {string} name - Slot name.
		 * @returns {number} How many waiting injections ran.
		 */
		declareSlot(name) {
			declaredSlots.add(name)
			const waiting = pendingInjections.filter((entry) => entry.slot === name)
			for (const entry of waiting) entry.callback()
			pendingInjections.splice(0, pendingInjections.length)
			return waiting.length
		},
		/**
		 * Put entries into a slot, the way another client package would.
		 *
		 * @param {string} key - Slot name.
		 * @param {object[]} entries - The entries.
		 * @returns {void}
		 */
		setSlotEntries(key, entries) {
			slotEntries.set(key, entries)
		},
		slotEntries,
		/**
		 * Run the pending timers once.
		 *
		 * @returns {number} How many ran.
		 */
		runTimers() {
			const pending = timers.splice(0, timers.length)
			for (const timer of pending) timer.fn()
			return pending.length
		},
		input,
		select,
		settle,
		/**
		 * Dispatch a page-level event to the listeners the plugin registered.
		 *
		 * @param {string} type - Event type.
		 * @param {object} event - Event object.
		 * @returns {void}
		 */
		dispatch(type, event) {
			for (const listener of sandbox.document.listeners.get(type) ?? []) listener(event)
		},
		findVisible,
		textOf,
		/** Click a node found by the test (for rows that are not <button>). */
		async clickNode(node) {
			node.props.onClick()
			await settle()
			return app
		},
		/** Click the last visible button carrying `label` (dialog footer wins). */
		async clickLast(label) {
			const matches = findVisible((node) => node.type === 'button' && textOf(node).includes(label))
			assert.ok(matches.length > 0, `no visible button containing "${label}"`)
			matches[matches.length - 1].props.onClick()
			await settle()
			return app
		},
		/** The first visible textarea. */
		textarea() {
			const [node] = findVisible((candidate) => candidate.type === 'textarea')
			assert.ok(node !== undefined, 'no visible textarea')
			return node
		},
		/**
		 * The checkbox inside the visible label whose text carries `label`.
		 *
		 * @param {string} label - Locale key of the label text.
		 * @returns {object} The checkbox node.
		 */
		checkbox(label) {
			const labels = findVisible((node) => node.type === 'label' && textOf(node).includes(label))
			assert.ok(labels.length > 0, `no visible label containing "${label}"`)
			const inputs = []
			const visit = (node) => {
				if (node === null || node === undefined || typeof node !== 'object') return
				if (Array.isArray(node)) {
					for (const child of node) visit(child)
					return
				}
				if (node.type === 'input') inputs.push(node)
				visit(node.children)
			}
			visit(labels[0])
			assert.ok(inputs.length > 0, `label "${label}" wraps no checkbox`)
			return inputs[0]
		},
		async mount() {
			await settle()
			return app
		},
		/**
		 * Render one component on its own and return its tree.
		 *
		 * @param {Function} component - The component.
		 * @param {object} [props] - Its props.
		 * @returns {object} The rendered tree.
		 */
		renderComponent(component, props) {
			standalone = { component, props }
			renderRoot()
			return rootTree
		},
		async openSearch() {
			await click('tab.search')
			return app
		},
		async typeQuery(value) {
			input('search.placeholder').props.onChange({ target: { value } })
			await settle()
			return app
		},
		async chooseTimeRange(value) {
			select('search.time').props.onChange({ target: { value } })
			await settle()
			return app
		},
		searchButton() {
			const [node] = findVisible((candidate) => candidate.type === 'button' && candidate.props.className.includes('mgrSearchGo'))
			assert.ok(node !== undefined, 'no search button')
			return node
		},
	}
	return app
}

test('search tab opens on the results pane and the other panes stay hidden', async () => {
	const app = await (await createApp()).mount()
	await app.openSearch()
	const text = app.text()
	assert.match(text, /search\.sub\.results/)
	assert.match(text, /search\.sub\.settings/)
	assert.match(text, /search\.sub\.settings/)
	assert.match(text, /search\.emptyIdle/)
	assert.match(text, /search\.modeCurrent/)
	assert.doesNotMatch(text, /search\.modeMerge/, 'the channel pane must not be on screen')
	assert.doesNotMatch(text, /search\.blockedSave/, 'the filter pane must not be on screen')
})

test('each sub-tab swaps the body without losing the search form', async () => {
	const app = await (await createApp()).mount()
	await app.openSearch()

	await app.click('search.sub.channels')
	let text = app.text()
	assert.equal(app.input('search.channelFilterPlaceholder').props.type, 'search')
	assert.match(text, /search\.testTitle/)
	assert.match(text, /Exa/)
	assert.match(text, /search\.channel\.configure/)
	assert.doesNotMatch(text, /search\.emptyIdle/)
	assert.doesNotMatch(text, /search\.modeMerge/, 'the mode switches live in 设置, not above the channel list')
	assert.match(text, /search\.submit/, 'the query form stays visible across sub-tabs')

	await app.click('search.sub.settings')
	text = app.text()
	assert.match(text, /search\.modeMerge/, 'the mode switches are settings')
	assert.match(text, /search\.modeAuto/)
	assert.match(text, /search\.blocked/)
	assert.match(text, /search\.filterScope/)
	assert.match(text, /search\.blockedSave/)

	await app.click('search.sub.results')
	text = app.text()
	assert.match(text, /search\.emptyIdle/)
	assert.doesNotMatch(text, /search\.blockedSave/)
})

test('the search button runs the query and lands on the results pane', async () => {
	const app = await (await createApp()).mount()
	await app.openSearch()
	await app.typeQuery('DeepSeek Harness')
	await app.click('search.submit')

	const sent = app.requests.filter((entry) => entry.endpoint === 'search-query')
	assert.equal(sent.length, 1)
	assert.equal(sent[0].payload.query, 'DeepSeek Harness')

	const text = app.text()
	assert.match(text, /search\.resultCount/)
	assert.match(text, /Exa result/)
	assert.match(text, /Tavily result/)
	assert.match(text, /search\.chipOk/)
	assert.match(text, /search\.chipFail/)
	assert.match(text, /A channel answer\./)
	assert.match(text, /search\.external/)
	assert.doesNotMatch(text, /search\.modeMerge/, 'a finished search brings the results back')
})

test('the time filter rides along with the query', async () => {
	const app = await (await createApp()).mount()
	await app.openSearch()
	await app.typeQuery('deepseek')
	await app.chooseTimeRange('week')
	await app.click('search.submit')

	const sent = app.requests.filter((entry) => entry.endpoint === 'search-query')
	assert.equal(sent.length, 1)
	assert.equal(sent[0].payload.timeRange, 'week')
})

test('an empty query cannot be submitted', async () => {
	const app = await (await createApp()).mount()
	await app.openSearch()
	assert.equal(app.searchButton().props.disabled, true)
})

test('with no enabled channel the panel warns and jumps to the channel pane', async () => {
	const channels = makeChannels().map((channel) => ({ ...channel, enabled: false }))
	const app = await (await createApp({ channels })).mount()
	await app.openSearch()
	let text = app.text()
	assert.match(text, /search\.enabledNone/)
	assert.match(text, /search\.enabledNoneAction/)
	assert.equal(app.searchButton().props.disabled, true)

	await app.click('search.enabledNoneAction')
	text = app.text()
	// The warning is about channels, so it lands on the channel list — the mode
	// switches now live in 设置.
	assert.match(text, /search\.channels\b/)
	assert.equal(app.input('search.channelFilterPlaceholder').props.type, 'search')
	assert.doesNotMatch(text, /search\.emptyIdle/)
})

test('a failed search shows the error envelope on the results pane', async () => {
	const app = await (await createApp({ failQuery: true })).mount()
	await app.openSearch()
	await app.typeQuery('deepseek')
	await app.click('search.submit')
	const text = app.text()
	assert.match(text, /search\.failed/)
	assert.match(text, /dsh-manager\/search-offline/)
	assert.match(text, /搜索请求被拒绝/)
})

test('the channel check renders one chip per enabled channel', async () => {
	const app = await (await createApp()).mount()
	await app.openSearch()
	await app.click('search.sub.channels')
	await app.click('search.testAll')

	const sent = app.requests.filter((entry) => entry.endpoint === 'search-test-all')
	assert.equal(sent.length, 1)
	const text = app.text()
	assert.match(text, /search\.testAllSummary/)
	assert.match(text, /search\.chipOk/)
	assert.match(text, /search\.chipFail/)
})

test('an open channel form survives a trip to another sub-tab', async () => {
	const app = await (await createApp()).mount()
	await app.openSearch()
	await app.click('search.sub.channels')
	await app.click('search.channel.configure')

	let text = app.text()
	assert.match(text, /search\.channel\.apiKey/)
	assert.match(text, /search\.channel\.baseUrl/)
	assert.match(text, /search\.channel\.save/)
	assert.match(text, /search\.channel\.testHint/)
	assert.match(text, /search\.channel\.hide/)
	assert.match(text, /search\.channel\.envHint/)

	await app.click('search.sub.results')
	assert.doesNotMatch(app.text(), /search\.channel\.apiKey/)
	await app.click('search.sub.channels')
	text = app.text()
	assert.match(text, /search\.channel\.apiKey/, 'the pane stays mounted, so the form does not collapse')
})

test('the channel filter narrows the list and the enabled-only box hides the rest', async () => {
	const app = await (await createApp()).mount()
	await app.openSearch()
	await app.click('search.sub.channels')

	app.input('search.channelFilterPlaceholder').props.onChange({ target: { value: 'tavily' } })
	await app.settle()
	let text = app.text()
	assert.match(text, /Tavily/)
	assert.doesNotMatch(text, /SearXNG/, 'a filtered-out row must not render')
	assert.match(text, /search\.filteredCount/)

	app.input('search.channelFilterPlaceholder').props.onChange({ target: { value: '' } })
	app.checkbox('search.onlyEnabled').props.onChange({ target: { checked: true } })
	await app.settle()
	text = app.text()
	assert.match(text, /Exa/)
	assert.match(text, /Tavily/)
	assert.doesNotMatch(text, /SearXNG/, 'enabled-only hides the disabled rows')
})

// ---- bulk channel switches ----------------------------------------------

/**
 * One paid channel: needs a key, is not free.
 *
 * @param {string} id - Channel id.
 * @param {string} label - Channel label.
 * @param {object} [extra] - Field overrides.
 * @returns {object} The channel view.
 */
function makePaidChannel(id, label, extra = {}) {
	return makeChannel(id, label, {
		keyMode: 'required',
		requiresKey: true,
		keySupported: true,
		keyOptional: false,
		free: false,
		...extra,
	})
}

/** A mixed list: one on, two free off, one paid with a key, one paid without. */
function makeBulkChannels() {
	return [
		makeChannel('bing', 'Bing', { free: true }),
		makeChannel('exa', 'Exa', { keySupported: true, keyOptional: true, keyConfigured: true, keySource: 'record', enabled: true }),
		makeChannel('tavily', 'Tavily', { keySupported: true, keyOptional: true, free: true }),
		makePaidChannel('brave', 'Brave'),
		makePaidChannel('openai', 'OpenAI', { keyConfigured: true, keySource: 'env' }),
	]
}

/**
 * The channel switches a bulk run sent, in order.
 *
 * @param {object} app - The mounted panel.
 * @returns {object[]} `{id, enabled}` payloads.
 */
function bulkSaves(app) {
	return app.requests
		.filter((entry) => entry.endpoint === 'search-save')
		.map((entry) => ({ id: entry.payload.id, enabled: entry.payload.enabled }))
}

/**
 * The bulk switch on the channel page.
 *
 * @param {object} app - The mounted panel.
 * @returns {object} The switch node.
 */
function bulkSwitch(app) {
	const [node] = app.findVisible((candidate) => candidate.props?.role === 'switch'
		&& candidate.props?.['aria-label'] === 'search.bulkUsable')
	assert.ok(node !== undefined, 'no bulk switch on the channel page')
	return node
}

/**
 * Flip the bulk switch once.
 *
 * @param {object} app - The mounted panel.
 * @returns {Promise<void>} Resolves after the batch settled.
 */
async function flipBulkSwitch(app) {
	// The row switches stop the click from reaching the row; this one is not
	// inside a row but the handler still reads the event.
	bulkSwitch(app).props.onClick({ stopPropagation() {} })
	await app.settle()
}

test('the channel head carries the free, keyed and key-missing counts', async () => {
	const app = await (await createApp({ channels: makeBulkChannels() })).mount()
	await app.openSearch()
	await app.click('search.sub.channels')

	const text = app.text()
	assert.match(text, /search\.channelsCount/)
	assert.match(text, /search\.statFree/)
	assert.match(text, /search\.statKeyed/)
	assert.match(text, /search\.statKeyMissing/)
})

test('the bulk switch reads on only when every usable channel is on', async () => {
	const mixed = await (await createApp({ channels: makeBulkChannels() })).mount()
	await mixed.openSearch()
	await mixed.click('search.sub.channels')
	assert.equal(bulkSwitch(mixed).props['aria-checked'], false, 'a usable channel is still off')

	// A paid channel without a key stays off and must not keep the switch off.
	const allUsableOn = makeBulkChannels().map((channel) => ({
		...channel,
		enabled: channel.free === true || channel.keyConfigured === true,
	}))
	const full = await (await createApp({ channels: allUsableOn })).mount()
	await full.openSearch()
	await full.click('search.sub.channels')
	assert.equal(bulkSwitch(full).props['aria-checked'], true, 'every usable channel is on')
})

test('turning the bulk switch on enables every usable channel', async () => {
	const app = await (await createApp({ channels: makeBulkChannels() })).mount()
	await app.openSearch()
	await app.click('search.sub.channels')
	await flipBulkSwitch(app)

	assert.deepEqual(bulkSaves(app), [
		{ id: 'bing', enabled: true },
		{ id: 'tavily', enabled: true },
		{ id: 'openai', enabled: true },
	], 'the free channels and the paid one that has a key')
})

test('turning the bulk switch off turns every channel off', async () => {
	// Brave is paid and has no key: it never comes on by itself, but a user can
	// switch it on by hand, and then "off" has to take it down as well.
	const channels = makeBulkChannels().map((channel) => ({
		...channel,
		enabled: channel.free === true || channel.keyConfigured === true || channel.id === 'brave',
	}))
	const app = await (await createApp({ channels })).mount()
	await app.openSearch()
	await app.click('search.sub.channels')
	assert.equal(bulkSwitch(app).props['aria-checked'], true, 'every usable channel is on')
	await flipBulkSwitch(app)

	assert.deepEqual(bulkSaves(app), [
		{ id: 'bing', enabled: false },
		{ id: 'exa', enabled: false },
		{ id: 'tavily', enabled: false },
		{ id: 'brave', enabled: false },
		{ id: 'openai', enabled: false },
	], 'nothing on the list stays on')
})

test('a paid channel without a key is never turned on by the bulk switch', async () => {
	const app = await (await createApp({ channels: makeBulkChannels() })).mount()
	await app.openSearch()
	await app.click('search.sub.channels')
	await flipBulkSwitch(app)

	const switched = bulkSaves(app).map((entry) => entry.id)
	assert.ok(switched.includes('openai'), 'a paid channel that has a key is usable')
	assert.ok(!switched.includes('brave'), 'a paid channel without a key would only fail')
})

test('the bulk switch is disabled while a batch is running', async () => {
	// The save never lands: the switch has to stay off-limits and say so.
	const app = await (await createApp({ channels: makeBulkChannels(), stallSave: true })).mount()
	await app.openSearch()
	await app.click('search.sub.channels')
	bulkSwitch(app).props.onClick({ stopPropagation() {} })
	await app.settle()

	assert.equal(bulkSwitch(app).props.disabled, true, 'a second click must not start a second batch')
	assert.match(app.text(), /search\.enabling/, 'the panel says the batch is running')
})

test('one channel failing does not stop the rest of a batch', async () => {
	const app = await (await createApp({ channels: makeBulkChannels(), failSaveId: 'bing' })).mount()
	await app.openSearch()
	await app.click('search.sub.channels')
	await flipBulkSwitch(app)

	assert.deepEqual(bulkSaves(app), [
		{ id: 'bing', enabled: true },
		{ id: 'tavily', enabled: true },
		{ id: 'openai', enabled: true },
	], 'the failing channel is skipped, the next ones still run')
	assert.match(app.text(), /search\.bulkPartial/, 'the panel says the batch was partial')
})

test('the enabled rows are drawn first and the arrows follow the drawn list', async () => {
	const channels = [
		makeChannel('bing', 'Bing', { free: true }),
		makeChannel('exa', 'Exa', { enabled: true }),
	]
	const app = await (await createApp({ channels })).mount()
	await app.openSearch()
	await app.click('search.sub.channels')

	const text = app.text()
	assert.ok(text.indexOf('Exa') >= 0 && text.indexOf('Bing') >= 0, 'both rows render')
	assert.ok(text.indexOf('Exa') < text.indexOf('Bing'), 'the enabled row comes first')

	// Drawn order is [Exa, Bing]: the first arrow up is dead, the last one down
	// is dead, and the arrows in between are live.
	const ups = app.buttons('↑')
	assert.equal(ups.length, 2)
	assert.equal(ups[0].props.disabled, true, 'the first drawn row cannot move up')
	assert.equal(ups[1].props.disabled, false)
	const downs = app.buttons('↓')
	assert.equal(downs[0].props.disabled, false)
	assert.equal(downs[1].props.disabled, true, 'the last drawn row cannot move down')
})

// ---- tool catalog -------------------------------------------------------

test('the tools tab lists the first section with descriptions and parameters', async () => {
	const app = await (await createApp()).mount()
	await app.click('tab.tools')

	const sent = app.requests.filter((entry) => entry.endpoint === 'tools-list')
	assert.equal(sent.length, 1, 'the catalog was not read')
	let text = app.text()
	assert.match(text, /tools.group.skills/)
	assert.match(text, /tools.group.mcp/)
	assert.match(text, /tools.group.search/)
	assert.match(text, /tools.group.lan/)
	assert.doesNotMatch(text, /tools\.group\.modes/, 'the modes section is gone with the preset registry')
	assert.match(text, /create_skill/)
	assert.match(text, /Create a new local DSH skill\./)
	assert.match(text, /Skill name\./)
	assert.match(text, /tools.required/, 'a required parameter is marked')
	assert.doesNotMatch(text, /mcp__demo__echo/, 'another section must not be on screen')
	assert.doesNotMatch(text, /web_search/)
})

test('each tool section swaps the body without losing the others', async () => {
	const app = await (await createApp()).mount()
	await app.click('tab.tools')

	await app.click('tools.group.mcp')
	let text = app.text()
	assert.match(text, /mcp__demo__echo/)
	assert.match(text, /Echo the input\./)
	assert.match(text, /Text to echo\./)
	assert.doesNotMatch(text, /create_skill/)

	await app.click('tools.group.search')
	text = app.text()
	assert.match(text, /web_search/)
	assert.match(text, /One to three queries\./)
	assert.doesNotMatch(text, /mcp__demo__echo/)

	await app.click('tools.group.lan')
	text = app.text()
	assert.match(text, /tools.empty.lan/)
	assert.doesNotMatch(text, /web_search/)

	await app.click('tools.group.skills')
	assert.match(app.text(), /create_skill/)
})

test('a failed catalog read shows the error instead of an empty page', async () => {
	const app = await (await createApp({ failTools: true })).mount()
	await app.click('tab.tools')
	const text = app.text()
	assert.match(text, /tools.failed/)
	assert.match(text, /工具目录不可用/)
})

// ---- skills workspace ---------------------------------------------------

test('the skills workspace renders the kernel roots and their skills', async () => {
	const app = await createApp()
	await app.mount()
	await app.settle()
	const text = app.text()
	assert.match(text, /DSH/)
	assert.match(text, /demo-skill/)
	assert.ok(app.requests.some((entry) => entry.endpoint === 'state'), 'the kernel state was not read')
})

test('a skill row opens the detail pane and a saved note shows immediately', async () => {
	const app = await createApp()
	await app.mount()
	await app.settle()
	const [row] = app.findVisible((node) => node.props?.role === 'button' && app.textOf(node).includes('demo-skill'))
	assert.ok(row !== undefined, 'no skill row')
	await app.clickNode(row)
	assert.match(app.text(), /Demo description/)
	await app.click('skx.editNote')
	app.textarea().props.onChange({ target: { value: 'remember this' } })
	await app.settle()
	await app.click('skx.save')
	const sent = app.requests.filter((entry) => entry.endpoint === 'skill-note').at(-1)
	assert.deepEqual(sent.payload, { root: 'dsh', name: 'demo-skill', note: 'remember this' })
	assert.match(app.text(), /remember this/, 'the saved note must be visible without another fetch')
})

test('moving a skill to the trash asks first and then calls delete', async () => {
	const app = await createApp()
	await app.mount()
	await app.settle()
	const [row] = app.findVisible((node) => node.props?.role === 'button' && app.textOf(node).includes('demo-skill'))
	await app.clickNode(row)
	await app.click('skx.trash')
	assert.match(app.text(), /skx.confirmTrashTitle/)
	assert.ok(app.requests.every((entry) => entry.endpoint !== 'delete'), 'delete must wait for confirmation')
	await app.click('skx.trashConfirm')
	assert.ok(app.requests.some((entry) => entry.endpoint === 'delete'))
})

test('permanent delete in the trash asks first', async () => {
	const kernelState = makeKernelState({
		trash: [{ id: 'trash-1', name: 'old-skill', root: 'dsh', deletedAt: '2026-01-01T00:00:00.000Z' }],
	})
	const app = await createApp(({ kernelState }))
	await app.mount()
	await app.settle()
	await app.click('skx.tab.trash')
	await app.settle()
	assert.match(app.text(), /old-skill/)
	await app.click('skx.purge')
	assert.match(app.text(), /skx.purgeConfirmTitle/)
	assert.ok(app.requests.every((entry) => entry.endpoint !== 'trash-delete'), 'purge must wait for confirmation')
	await app.clickLast('skx.purge')
	assert.ok(app.requests.some((entry) => entry.endpoint === 'trash-delete'))
})

test('the skills page is four sub-tabs over one merged, search-first list', async () => {
	const app = await createApp()
	await app.mount()
	await app.settle()

	assert.equal(
		app.findVisible((node) => node.props?.className === 'mgrSubTabs skxSubTabs').length,
		1,
		'the four sections need one sub-tab row',
	)
	assert.equal(
		app.findVisible((node) => String(node.props?.className ?? '').includes('skxRail') || String(node.props?.className ?? '').includes('skxSourceRow')).length,
		0,
		'the source column is gone',
	)
	assert.equal(app.findVisible((node) => node.type === 'input' && node.props.type === 'search').length, 1)

	await app.click('skx.tab.trash')
	assert.match(app.text(), /skx.trashEmpty/)
	assert.doesNotMatch(app.text(), /demo-skill/, 'another section must not show the skill list')

	await app.click('skx.tab.installed')
	assert.match(app.text(), /demo-skill/)
})

test('a source whose directory is absent is dropped instead of listed', async () => {
	const kernelState = makeKernelState({
		roots: [
			...makeKernelState().roots,
			{
				key: 'cursor',
				label: 'Cursor',
				path: '/tmp/absent/.cursor/skills',
				exists: false,
				mutable: false,
				enabled: true,
				skills: [{ name: 'cursor-only', description: 'From an absent source.', enabled: true, loadable: true }],
			},
		],
	})
	const app = await createApp({ kernelState })
	await app.mount()
	await app.settle()

	assert.doesNotMatch(app.text(), /Cursor/, 'an absent source is not offered at all')
	assert.doesNotMatch(app.text(), /cursor-only/, 'nor are its skills')
	assert.match(app.text(), /skx\.sourcesButton/, 'the source dialog still lists what exists')
})

test('a row switches its own source, and filtering narrows the merged list', async () => {
	const kernelState = makeKernelState({
		roots: [
			...makeKernelState().roots,
			{
				key: 'agents',
				label: '公共 Agent',
				path: '/tmp/agents/skills',
				exists: true,
				mutable: true,
				enabled: true,
				skills: [
					{ name: 'humanizer-zh', description: '统一处理中文内容质量。', enabled: true, loadable: true, effectiveModelInvocable: true },
				],
			},
		],
	})
	const app = await createApp({ kernelState })
	await app.mount()
	await app.settle()

	// The list is merged, so every row says which source it came from.
	assert.match(app.text(), /humanizer-zh/)
	assert.match(app.text(), /公共 Agent/)

	app.input('skx.search').props.onChange({ target: { value: 'humanizer' } })
	await app.settle()
	assert.match(app.text(), /humanizer-zh/, 'the query keeps the matching row')
	assert.doesNotMatch(app.text(), /demo-skill/, 'and drops the rest')

	const [row] = app.findVisible((node) => node.type === 'li' && app.textOf(node).includes('humanizer-zh'))
	assert.ok(row !== undefined, 'no result row')
	const [toggle] = app.findVisible((node) => node.props?.role === 'switch' && String(node.props?.['aria-label'] ?? '').includes('humanizer-zh'))
	assert.ok(toggle !== undefined, 'the hit has to be switchable in place')
	// The switch stops the click from also selecting the row, so it wants an event.
	toggle.props.onClick({ stopPropagation() {} })
	await app.settle()

	const sent = app.requests.filter((entry) => entry.endpoint === 'disable').at(-1)
	assert.deepEqual(sent.payload, { root: 'agents', name: 'humanizer-zh' }, 'the switch belongs to the hit’s own source')
})

/**
 * A two-source workspace: the built-in one plus a second writable root.
 *
 * @returns {object} The kernel `state` payload.
 */
function makeTwoSourceState() {
	return makeKernelState({
		roots: [
			...makeKernelState().roots,
			{
				key: 'agents',
				label: '公共 Agent',
				path: '/tmp/agents/skills',
				exists: true,
				mutable: true,
				enabled: true,
				skills: [
					{ name: 'humanizer-zh', description: '统一处理中文内容质量。', enabled: true, loadable: true, effectiveModelInvocable: true },
				],
			},
		],
	})
}

test('the source dialog switches a whole source and names what it costs', async () => {
	const app = await createApp({ kernelState: makeTwoSourceState() })
	await app.mount()
	await app.settle()

	await app.click('skx.sourcesButton')
	assert.match(app.text(), /skx\.sourcesTitle/)
	assert.match(app.text(), /skx\.sourcesHint/)

	const [toggle] = app.findVisible((node) => node.props?.role === 'switch' && String(node.props?.['aria-label'] ?? '').includes('公共 Agent'))
	assert.ok(toggle !== undefined, 'each source needs its own switch')
	toggle.props.onClick({ stopPropagation() {} })
	await app.settle()

	const sent = app.requests.filter((entry) => entry.endpoint === 'source-disable').at(-1)
	assert.deepEqual(sent.payload, { root: 'agents' })
})

test('a skill the host refuses stays out of the list and is explained in the 异常 panel', async () => {
	const kernelState = makeKernelState({
		roots: [
			{
				...makeKernelState().roots[0],
				skills: [
					...makeKernelState().roots[0].skills,
					{
						name: '烟花三月ETF-perspective',
						description: 'A skill whose name cannot become kebab-case.',
						enabled: false,
						loadable: false,
						effectiveModelInvocable: false,
						path: '/tmp/dsh/skills/烟花三月ETF-perspective/SKILL.md',
						diagnostics: [{ level: 'error', code: 'diagnostic.name.invalid', params: { name: '烟花三月ETF-perspective' } }],
					},
				],
			},
		],
	})
	const app = await createApp({ kernelState })
	await app.mount()
	await app.settle()

	assert.doesNotMatch(app.text(), /烟花三月/, 'a refused skill is not part of the list')
	assert.match(app.text(), /skx\.brokenButton/, 'the panel reports how many there are')

	await app.click('skx.brokenButton')
	assert.match(app.text(), /skx\.brokenTitle/)
	assert.match(app.text(), /烟花三月ETF-perspective/, 'the panel names it')
	assert.match(app.text(), /skx\.diag\.nameInvalid/, 'and says why the host refuses it')
	assert.match(app.text(), /\/tmp\/dsh\/skills\/烟花三月ETF-perspective\/SKILL\.md/, 'and where the file is')
})

test('rescanning from the toolbar re-reads the scan and there is no footer bar', async () => {
	const app = await createApp()
	await app.mount()
	await app.settle()

	assert.equal(
		app.findVisible((node) => String(node.props?.className ?? '') === 'skxFoot').length,
		0,
		'the bottom bar is gone; the source count lives on its button',
	)

	const before = app.requests.filter((entry) => entry.endpoint === 'state').length
	const [rescan] = app.findVisible((node) => node.type === 'button'
		&& app.textOf(node) === 'action.refresh'
		&& String(node.props?.className ?? '').includes('skxBtnSmall'))
	assert.ok(rescan !== undefined, 'the toolbar needs its own rescan button')
	rescan.props.onClick()
	await app.settle()
	const after = app.requests.filter((entry) => entry.endpoint === 'state').length
	assert.ok(after > before, 'rescanning must re-read the kernel state')
})

test('the manual-only badge marks a model-invocable skill, not a switched-off one', async () => {
	const kernelState = makeKernelState({
		roots: [{
			...makeKernelState().roots[0],
			skills: [
				{ name: 'auto-skill', description: 'The model may call it.', enabled: true, loadable: true, effectiveModelInvocable: true, modelInvocable: true },
				{ name: 'manual-skill', description: 'Only the user may call it.', enabled: true, loadable: true, effectiveModelInvocable: false, modelInvocable: false },
				{ name: 'off-skill', description: 'It is switched off.', enabled: false, loadable: true, effectiveModelInvocable: false, modelInvocable: true },
			],
		}],
	})
	const app = await createApp({ kernelState })
	await app.mount()
	await app.settle()

	const badgesOf = (name) => app.findVisible((node) => node.type === 'li'
		&& app.textOf(node).includes(name)
		&& app.textOf(node).includes('skx.manualOnly'));
	assert.equal(badgesOf('manual-skill').length, 1, 'a skill the model may not call is marked');
	assert.equal(badgesOf('off-skill').length, 0, 'a switched-off skill is not "manual only"');
	assert.equal(badgesOf('auto-skill').length, 0);
})

test('the UI-enhancement tab sits between 搜索 and 偏好 and switches the feature', async () => {
	const app = await (await createApp()).mount()
	const tabs = app.findVisible((node) => String(node.props?.className ?? '').includes('mgrTabs'))
		.flatMap((bar) => bar.children ?? [])
		.map((button) => app.textOf(button));
	const indexOf = (label) => tabs.findIndex((text) => text.includes(label));
	assert.ok(indexOf('tab.ui') > indexOf('tab.search'), 'UI 增强 comes after 联网搜索');
	assert.ok(indexOf('tab.ui') < indexOf('tab.preferences'), 'UI 增强 comes before 偏好');
	assert.equal(indexOf('tab.modes'), -1, '模式 is gone: the manager no longer ships agent presets');

	await app.click('tab.ui')
	const text = app.text()
	assert.match(text, /对话回退/, 'the feature shows its own name');
	assert.match(text, /把对话回退到更早的消息/, 'and its own description');
	assert.match(text, /ui.defaultOn/);
	assert.match(text, /ui.hint/);

	const [toggle] = app.findVisible((node) => node.props?.role === 'switch' && String(node.props?.['aria-label'] ?? '').includes('对话回退'))
	assert.ok(toggle !== undefined, 'the feature needs a switch')
	toggle.props.onClick({ stopPropagation() {} })
	await app.settle()

	const sent = app.requests.filter((entry) => entry.endpoint === 'ui-toggle').at(-1)
	assert.deepEqual(sent.payload, { id: 'rewind', enabled: false })
})

test('the vendored rewind factory still hands its exports back', async () => {
	// The bundle is upstream's factory body; losing its last line makes the
	// factory return undefined, and the failure only shows up in the browser.
	const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
	const start = source.indexOf('/* rewind-client:start')
	const end = source.indexOf('/* rewind-client:end */')
	assert.ok(start >= 0 && end > start, 'the vendored region must exist')
	const region = source.slice(start, end)
	assert.match(region, /var module = \{ exports: \{\} \}/, 'the factory body is missing')
	assert.match(region, /return module\.exports;/, 'the factory must return its exports')
	assert.match(region, /function apply\(ctx\)/, 'the vendored half must expose apply')
})

test('the rewind row takeover gets its session from the manager bridge', async () => {
	// The vendored half takes the user row over and appends its button to the
	// row's action cluster (next to copy) — the original plugin's placement.
	// That takeover used to bail because this DSH renders the row without a
	// session id; the manager now publishes a bridge carrying the session it is
	// showing. The takeover renders inside the real chat UI, so what is locked
	// here is the bridge and the vendored hook into it.
	const app = await (await createApp()).mount()
	await app.settle()

	const bridge = app.sandbox.__dshManagerRewind
	assert.ok(bridge !== undefined, 'the mount must publish the rewind bridge')
	assert.equal(bridge.enabled(), true)
	assert.equal(bridge.session(), 'session-1', 'the viewed session is what the row needs')

	bridge.report()
	await app.settle()
	const report = app.requests.filter((entry) => entry.endpoint === 'ui-client-status').at(-1)
	assert.equal(report.payload.scope, 'row')
	assert.equal(report.payload.mounted, true)
	assert.equal(report.payload.reason, 'row-action-mounted')

	// `targetOf` is the only place that decides a row is ours.
	const region = SOURCE.slice(SOURCE.indexOf('/* rewind-client:start'), SOURCE.indexOf('/* rewind-client:end */'))
	assert.match(region, /__dshManagerRewind/, 'the vendored row target must consult the bridge')
	assert.match(region, /bridge\.session\(\)/, 'and take the session from it')
})

test('the vendored host reads its config whether it is plain or reactive', async () => {
	// The manager passes plain values; upstream's schema handed these three
	// fields over as observables and read them with `.get()`, which threw on
	// every rewind command. `configValue` is what keeps both shapes working.
	const host = await readFile(new URL('../rewind/index.js', import.meta.url), 'utf8')
	assert.match(host, /function configValue\(value\)/, 'the vendored host needs the plain-or-reactive reader')
	for (const field of ['fileCheckpointingEnabled', 'autoCleanupEnabled', 'autoCleanupMaxAgeDays']) {
		assert.doesNotMatch(
			host,
			new RegExp(`${field}\\??\\.get\\(\\)`),
			`${field} must not be read through .get() alone — the manager passes a plain value`,
		)
	}
})

test('the preferences tab edits the global AGENTS.md the host injects', async () => {
	const app = await (await createApp()).mount()
	await app.click('tab.preferences')

	assert.match(app.text(), /preferences\.hint/)
	assert.match(app.text(), /\/tmp\/dsh-manager\/system\/AGENTS\.md/, 'the data file is named')
	// The harness translator does not interpolate, so the entry path shows up
	// as its key; the data path above is the one rendered literally.
	assert.match(app.text(), /preferences\.link/, 'the file DSH reads is named next to it')

	const [textarea] = app.findVisible((node) => node.type === 'textarea')
	assert.equal(textarea.props.value, '# 全局规则\n\n- 先说结论')

	textarea.props.onChange({ target: { value: '# 全局规则\n\n- 先给方案' } })
	await app.settle()
	await app.clickLast('preferences.save')

	const sent = app.requests.filter((entry) => entry.endpoint === 'preferences-save').at(-1)
	assert.equal(sent.payload.content, '# 全局规则\n\n- 先给方案')
})

test('the input history walks back through sent messages and fills the composer', async () => {
	const app = await (await createApp()).mount()
	await app.settle()

	// The feature is on by default in the fixture, and the browser half reports it.
	const report = app.requests.filter((entry) => entry.endpoint === 'ui-client-status' && entry.payload.feature === 'composer-history').at(-1)
	assert.ok(report !== undefined, 'the browser half reports the history feature')
	assert.equal(report.payload.mounted, true)
	// The reason carries the live count so an empty history is visible.
	assert.match(report.payload.reason, /^(installed|seeded) · \d+ 条$/)

	// The composer is whatever textarea is not inside the manager panel.
	// A textarea that tracks its own caret, the way a real one does: filling it
	// moves the caret to the end, which is what lets ArrowDown walk forward.
	const textarea = {
		tagName: 'TEXTAREA',
		selectionStart: 0,
		selectionEnd: 0,
		closest: () => null,
		dispatchEvent() {},
		setSelectionRange(start, end) {
			this.selectionStart = start
			this.selectionEnd = end
		},
		get value() { return this._value ?? '' },
		set value(text) {
			this._value = String(text)
			this.selectionStart = this._value.length
			this.selectionEnd = this._value.length
		},
	}
	const keydown = (key, options = {}) => {
		let prevented = false
		app.dispatch('keydown', {
			key,
			target: textarea,
			shiftKey: options.shiftKey === true,
			isComposing: false,
			preventDefault() { prevented = true },
		})
		return prevented
	}

	textarea.value = '第一条消息'
	keydown('Enter')
	textarea.value = ''
	app.dispatch('input', { target: textarea })

	textarea.value = '第二条消息'
	keydown('Enter')
	textarea.value = ''
	app.dispatch('input', { target: textarea })

	// Up recalls the last one, up again the one before it.
	assert.equal(keydown('ArrowUp'), true, 'ArrowUp is consumed in the composer')
	assert.equal(textarea.value, '第二条消息')
	keydown('ArrowUp')
	assert.equal(textarea.value, '第一条消息')
	// Down walks forward and finally restores the empty draft.
	keydown('ArrowDown')
	assert.equal(textarea.value, '第二条消息')
	keydown('ArrowDown')
	assert.equal(textarea.value, '')
})

test('the input history also drives the rich (contenteditable) composer', async () => {
	const app = await (await createApp()).mount()
	await app.settle()

	// The conversation composer is a Lexical contenteditable div, not a textarea.
	const editor = {
		tagName: 'DIV',
		isContentEditable: true,
		innerText: '',
		closest: () => null,
		focus() {},
	}
	const inserted = []
	app.sandbox.document.execCommand = (command, _ui, value) => {
		inserted.push([command, value])
		return true
	}
	// execCommand writes through the editor, the way Lexical would render it.
	const originalExec = app.sandbox.document.execCommand
	app.sandbox.document.execCommand = (command, ui, value) => {
		if (command === 'insertText') editor.innerText = value
		if (command === 'delete') editor.innerText = ''
		return originalExec(command, ui, value)
	}
	app.sandbox.window.getSelection = () => ({
		removeAllRanges() {},
		addRange() {},
	})
	app.sandbox.document.createRange = () => ({ selectNodeContents() {} })

	const keydown = (key) => {
		let prevented = false
		app.dispatch('keydown', {
			key,
			target: editor,
			shiftKey: false,
			isComposing: false,
			preventDefault() { prevented = true },
		})
		return prevented
	}

	editor.innerText = '富文本里的第一条'
	keydown('Enter')
	editor.innerText = ''
	app.dispatch('input', { target: editor })

	assert.equal(keydown('ArrowUp'), true, 'the rich composer consumes ArrowUp when it is empty')
	assert.equal(editor.innerText, '富文本里的第一条', 'and the recalled text is put back into it')
	assert.deepEqual(inserted.at(-1), ['insertText', '富文本里的第一条'])
})

test('a sub-tab page does not repeat its own name as a page title', async () => {
	const app = await createApp()
	await app.mount()
	await app.settle()
	for (const [key, emptyKey] of [['skx.tab.project', 'skx.noWorkspaces'], ['skx.tab.trash', 'skx.trashEmpty']]) {
		await app.click(key)
		const titles = app.findVisible((node) => node.type === 'h2' && app.textOf(node) === key)
		assert.equal(titles.length, 0, `${key} is already the tab label; it must not be an h2 as well`)
		assert.match(app.text(), new RegExp(emptyKey))
	}
})

test('switching sub-tabs keeps the skill list filter', async () => {
	const app = await createApp()
	await app.mount()
	await app.settle()
	app.input('skx.search').props.onChange({ target: { value: 'demo' } })
	await app.settle()
	await app.click('skx.tab.project')
	await app.settle()
	await app.click('skx.tab.installed')
	await app.settle()
	assert.equal(app.input('skx.search').props.value, 'demo')
})

test('the discovery chart uses the kernel limit and no unsupported sort', async () => {
	const app = await createApp()
	await app.mount()
	await app.settle()
	await app.click('skx.tab.discover')
	await app.settle()
	const chart = app.requests.filter((entry) => entry.endpoint === 'clawhub/list').at(-1)
	assert.ok(chart !== undefined, 'the chart was not requested')
	assert.match(chart.url, /[?&]limit=10\b/)
	assert.doesNotMatch(chart.url, /sort=/)
	assert.match(app.text(), /Tool/)
})

test('the list spans the page and one skill opens over it instead of beside it', async () => {
	const app = await createApp()
	await app.mount()
	await app.settle()

	assert.equal(
		app.findVisible((node) => String(node.props?.className ?? '').includes('skxDetailCol')).length,
		0,
		'the detail column is gone',
	)
	assert.equal(app.findVisible((node) => node.type === 'button' && app.textOf(node).includes('skx.create')).length, 0)

	const [row] = app.findVisible((node) => node.type === 'li' && app.textOf(node).includes('demo-skill'))
	await app.clickNode(row)
	assert.equal(app.findVisible((node) => node.props?.role === 'dialog').length, 1, 'the skill opens in a dialog')
	assert.match(app.text(), /Demo description/)
	// Closing it puts the list back.
	await app.click('×')
	assert.equal(app.findVisible((node) => node.props?.role === 'dialog').length, 0)
})
