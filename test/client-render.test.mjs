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
		const handler = handlers[endpoint]
		return reply(200, true, handler === undefined ? null : handler(payload))
	}

	// ---- React stand-in -----------------------------------------------------

	const effects = []
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
		window: { __ModuleLoader__: { load(definition) { moduleExports.definition = definition } } },
		document: {
			createElement() { return { dataset: {}, textContent: '', remove() {}, click() {}, appendChild() {} } },
			head: { appendChild() {} },
			body: { appendChild() {}, removeChild() {} },
			addEventListener() {},
			removeEventListener() {},
		},
		navigator: {},
		URL,
		AbortSignal,
		fetch: fakeFetch,
		setInterval() { return 0 },
		clearInterval() {},
		setTimeout() { return 0 },
		clearTimeout() {},
		atob() { return '' },
		console,
	}
	vm.createContext(sandbox)
	vm.runInContext(SOURCE, sandbox, { filename: 'client.js' })
	const definition = moduleExports.definition
	assert.ok(definition !== undefined, 'client module did not register')

	let main = null
	const plugin = definition.factory((name) => {
		if (name === 'react') return react
		throw new Error(`unexpected require: ${name}`)
	})
	plugin.apply({
		effect(fn) {
			const dispose = fn()
			if (typeof dispose === 'function') dispose()
		},
		locale: { register() { return () => {} }, bind() { return (key) => key } },
		slots: {
			inject(_slot, callback) { callback() },
			register(slot, component) {
				if (slot.name === 'main') main = component
				return () => {}
			},
		},
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

	function renderRoot() {
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
		text,
		click,
		input,
		select,
		settle,
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
	assert.match(text, /search\.sub\.channels/)
	assert.match(text, /search\.sub\.filter/)
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
	assert.match(text, /search\.modeMerge/)
	assert.match(text, /search\.modeAuto/)
	assert.equal(app.input('search.channelFilterPlaceholder').props.type, 'search')
	assert.match(text, /search\.testTitle/)
	assert.match(text, /Exa/)
	assert.match(text, /search\.channel\.configure/)
	assert.doesNotMatch(text, /search\.emptyIdle/)
	assert.doesNotMatch(text, /search\.blockedSave/)
	assert.match(text, /search\.submit/, 'the query form stays visible across sub-tabs')

	await app.click('search.sub.filter')
	text = app.text()
	assert.match(text, /search\.blocked/)
	assert.match(text, /search\.filterScope/)
	assert.match(text, /search\.blockedSave/)
	assert.doesNotMatch(text, /search\.modeMerge/)

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
	assert.match(text, /search\.modeMerge/)
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

test('creating a skill posts to the kernel after the dialog is filled', async () => {
	const app = await createApp()
	await app.mount()
	await app.settle()
	await app.click('skx.create')
	assert.match(app.text(), /skx.createTitle/)
	const [name] = app.findVisible((node) => node.type === 'input' && node.props.className === 'mgrInput')
	name.props.onChange({ target: { value: 'new-skill' } })
	await app.settle()
	await app.click('skx.createSubmit')
	const sent = app.requests.filter((entry) => entry.endpoint === 'create').at(-1)
	assert.deepEqual(sent.payload, { root: 'dsh', name: 'new-skill', description: '', body: '' })
})
