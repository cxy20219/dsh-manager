import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { apply } from '../index.js'
import { ENDPOINTS } from '../src/remote.js'
import { SEARCH_CHANNELS } from '../src/search-providers.js'

const skill = (name, description) => `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`

async function post(routes, endpoint, payload) {
	const route = routes.find((entry) => entry.path === `/api/manager/${endpoint}`)
	assert.ok(route, `missing route ${endpoint}`)
	const response = await route.fetch(new Request('http://127.0.0.1/api', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload ?? {}),
	}))
	return { status: response.status, value: await response.json() }
}

test('the Host half serves skills, toggles sources, and stores MCP rows', async () => {
	const dshHome = await mkdtemp(join(tmpdir(), 'dsh-manager-host-'))
	const dataDir = await mkdtemp(join(tmpdir(), 'dsh-manager-data-'))
	// The vendored kernel discovers the `dsh` root at <DSH_HOME>/skills.
	await mkdir(join(dshHome, 'skills', 'demo-skill'), { recursive: true })
	await writeFile(join(dshHome, 'skills', 'demo-skill', 'SKILL.md'), skill('demo-skill', '演示技能'))
	const savedDshHome = process.env.DSH_HOME
	const savedAgentsHome = process.env.DSH_AGENTS_HOME
	process.env.DSH_HOME = dshHome
	process.env.DSH_AGENTS_HOME = join(dshHome, '.agents')

	const routes = []
	const effects = []
	let provider
	let searchServer
	/** The commands the vendored rewind feature registered. */
	const registeredCommands = new Map()
	/** What the merged registry offers; the test changes it to simulate a shadow. */
	let catalogEntries = [
		{ name: 'demo-skill', description: '演示技能', provider: 'manager-external', invocation: { modelInvocable: true, userInvocable: true } },
		{ name: 'builtin-skill', description: '内置技能', provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: true } },
	]
	const warnings = [];
	/**
	 * Run one effect the way the Host does: a generator is driven to
	 * completion and the values it yields become cleanups.
	 *
	 * @param {Function} fn - The effect body.
	 * @returns {Function} The disposer.
	 */
	function runEffect(fn) {
		const cleanups = []
		const result = fn()
		if (result !== undefined && typeof result.next === 'function') {
			let step = result.next()
			while (!step.done) {
				if (typeof step.value === 'function') cleanups.push(step.value)
				step = result.next()
			}
		} else if (typeof result === 'function') {
			cleanups.push(result)
		}
		const dispose = () => {
			for (const cleanup of cleanups.reverse()) {
				try {
					cleanup()
				} catch {
					// Ignore teardown noise.
				}
			}
		}
		effects.push(dispose)
		return dispose
	}

	const ctx = {
		logger: { info() {}, warn(message) { warnings.push(message); } },
		skills: {
			registerProvider(create) {
				provider = create({ signal: new AbortController().signal, invalidate() {} })
				return () => {}
			},
			async list() {
				return catalogEntries
			},
		},
		get(name) {
			// The vendored rewind host configures a settings entry on mount.
			if (name === 'settings') {
				return {
					configure() { return () => {} },
					entry() { return { clear() {}, update() {} } },
				}
			}
			if (name === 'connection') {
				return {
					fetch: {
						register(route) {
							routes.push(route)
							return async () => {}
						},
					},
				}
			}
			// The vendored kernel resolves these through ctx.get, exactly as the
			// real Host does; without them it cannot register its routes.
			if (name === 'skills') return ctx.skills
			if (name === 'tools') return { register: () => () => {} }
			if (name === 'sessions') return undefined
			if (name === 'agents') return undefined
			return undefined
		},
		effect(fn) {
			return runEffect(fn)
		},
		// The Host injects a service once it exists; the fake answers with the
		// same `get` the rest of the fixture uses.
		inject(names, callback) {
			// The scope carries the requested services as properties, the way
			// the Host's own injection does.
			const scope = {
				get: (name) => ctx.get(name),
				effect(fn) {
					return runEffect(fn)
				},
				on: (...args) => ctx.on(...args),
			}
			for (const name of names) scope[name] = ctx.get(name)
			callback(scope)
		},
		// The vendored kernel subscribes to agent lifecycle events; the real Host
		// provides these, so the fake context has to as well.
		on() {
			return () => {}
		},
		emit() {},
	}

	// The Host exposes an injected service as a property of the scope, which
	// is how the vendored rewind half reaches the command registry.
	ctx.commands = {
		async register(definition) {
			registeredCommands.set(definition.name, definition)
			return async () => { registeredCommands.delete(definition.name) }
		},
	}
	ctx.settings = {
		async configure() {},
		async update() {},
		async mutate() {},
	}

	try {
		await apply(ctx, { dataDir })
		// The panel's own endpoints, plus the vendored kernel's 44 routes that
		// share the same /api/manager prefix.
		assert.equal(routes.filter((route) => ENDPOINTS.some((name) => route.path === `/api/manager/${name}`)).length, ENDPOINTS.length)
		assert.ok(routes.length > ENDPOINTS.length, 'the kernel registered its routes too')
		// The manager's own routes live under its prefix; the vendored rewind
		// feature keeps the two paths upstream publishes.
		const vendored = ['/api/dsh-rewind/preview', '/api/dsh-rewind/candidates'];
		assert.ok(
			routes.every((route) => route.path.startsWith('/api/manager/') || vendored.includes(route.path)),
			'every route lives under the plugin prefix',
		)
		assert.ok(provider !== undefined, 'the kernel registered a skill provider')

		const overview = await post(routes, 'overview')
		assert.equal(overview.status, 200)
		// The kernel scans every known agent source on this machine, so only the
		// skills the fixture owns are asserted; the rest of the assertion is that
		// the fixture skill is projected correctly.
		const fixtureCategory = overview.value.skills.categories.find((category) =>
			category.skills.some((entry) => entry.name === 'demo-skill'),
		)
		assert.ok(fixtureCategory, 'the fixture skill is projected')
		assert.equal(fixtureCategory.name, 'dsh')
		assert.equal(fixtureCategory.skills.find((entry) => entry.name === 'demo-skill').ok, true)
		// The fake Host now provides a tools service (the kernel needs one to
		// register `create_skill`), so MCP rows can register tools.
		assert.equal(overview.value.mcp.available, true)
		assert.deepEqual(overview.value.mcp.servers, [])
		// Catalog accounting mixes the fake registry with whatever the kernel
		// actually discovered on this machine, so only the fake provider's own
		// contribution is asserted here.
		assert.equal(overview.value.catalog.total, 2)
		assert.equal(overview.value.catalog.visible, 2)
		// The fake registry lists one entry under the kernel's provider name; the
		// overview must attribute it to this plugin, not to another provider.
		assert.equal(overview.value.catalog.managed, 1)
		assert.ok(overview.value.catalog.external.includes('builtin-skill'))

		// A higher-priority provider wins the name: the manager's copy is active
		// in its own scan but never reaches the agent, so the panel must say so.
		catalogEntries = [
			{ name: 'builtin-skill', description: '内置技能', provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: true } },
		]
		const shadowed = await post(routes, 'overview')
		assert.ok(shadowed.value.catalog.missing.includes('demo-skill'))
		catalogEntries = [
			{ name: 'demo-skill', description: '演示技能', provider: 'manager-external', invocation: { modelInvocable: true, userInvocable: true } },
			{ name: 'builtin-skill', description: '内置技能', provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: true } },
		]

		// The kernel is an *overlay* provider: it only lists skills that need to
		// differ from a native provider (disabled, policy-tweaked, or shadowed).
		// A plain healthy skill in the default source is left to the native
		// filesystem provider, so it is intentionally absent here.
		const listed = await provider.list({})
		assert.ok(Array.isArray(listed))

		const toggled = await post(routes, 'skill-toggle', { category: 'dsh', enabled: false })
		assert.equal(toggled.status, 200)
		const afterToggle = await post(routes, 'overview')
		const dshAfter = afterToggle.value.skills.categories.find((category) => category.name === 'dsh')
		assert.equal(dshAfter.disabled, true, 'the dsh source is disabled after the toggle')

		const saved = await post(routes, 'mcp-save', {
			name: 'demo',
			command: 'node',
			args: ['-e', 'process.exit(0)'],
			enabled: false,
		})
		assert.equal(saved.status, 200)
		assert.equal(saved.value.server.name, 'demo')
		assert.equal(saved.value.server.state, 'stopped')
		const status = await post(routes, 'mcp-status')
		assert.equal(status.value.servers.length, 1)

		const searchStatus = await post(routes, 'search-status')
		assert.equal(searchStatus.status, 200)
		assert.equal(searchStatus.value.channels.length, SEARCH_CHANNELS.length)
		assert.equal(searchStatus.value.mode, 'merge')
		assert.equal(searchStatus.value.order.length, SEARCH_CHANNELS.length)
		// The one-time free fallback seed enables Bing and Exa.
		assert.equal(searchStatus.value.enabledCount, 2)
		assert.equal(searchStatus.value.channels.find((channel) => channel.id === 'bing').enabled, true)
		assert.equal(searchStatus.value.channels.find((channel) => channel.id === 'exa').enabled, true)
		assert.ok(searchStatus.value.channels.some((channel) => channel.id === 'exa' && channel.requiresKey === false))
		assert.ok(searchStatus.value.channels.some((channel) => channel.id === 'bing' && channel.keyMode === 'none' && channel.free === true))
		assert.ok(searchStatus.value.channels.some((channel) => channel.id === 'brave' && channel.requiresKey === true))
		assert.ok(searchStatus.value.channels.some((channel) => channel.id === 'searxng' && channel.requiresKey === false))
		assert.ok(searchStatus.value.channels.some((channel) => channel.id === 'deepseek' && channel.requiresKey === true))
		assert.ok(searchStatus.value.channels.some((channel) => channel.id === 'minimax' && channel.requiresKey === true))

		// Keep the rest of this fixture deterministic and offline.
		await post(routes, 'search-save', { id: 'bing', enabled: false })
		await post(routes, 'search-save', { id: 'exa', enabled: false })

		const savedSearch = await post(routes, 'search-save', { id: 'brave', enabled: true })
		assert.equal(savedSearch.status, 200)
		assert.equal(savedSearch.value.enabledCount, 1)
		assert.equal(savedSearch.value.channels.find((channel) => channel.id === 'brave').enabled, true)

		const savedKey = await post(routes, 'search-save', { id: 'brave', apiKey: 'secret' })
		assert.equal(savedKey.status, 400)
		assert.match(savedKey.value.error.message, /凭证服务/)

		const savedBraveKey = process.env.BRAVE_API_KEY
		delete process.env.BRAVE_API_KEY
		try {
			const searched = await post(routes, 'search-query', { query: '  dsh manager  ' })
			assert.equal(searched.status, 200)
			assert.equal(searched.value.query, 'dsh manager')
			assert.equal(searched.value.sources.length, 0)
			const brave = searched.value.channels.find((channel) => channel.id === 'brave')
			assert.equal(brave.ok, false)
			assert.equal(brave.error.code, 'config')

			const tested = await post(routes, 'search-test', { id: 'brave' })
			assert.equal(tested.status, 200)
			assert.equal(tested.value.ok, false)
			assert.equal(tested.value.failure.code, 'config')
		} finally {
			if (savedBraveKey === undefined) delete process.env.BRAVE_API_KEY
			else process.env.BRAVE_API_KEY = savedBraveKey
		}

		const savedOrder = await post(routes, 'search-order', { ids: ['bing', 'minimax'] })
		assert.equal(savedOrder.status, 200)
		assert.equal(savedOrder.value.order[0], 'bing')
		const savedMode = await post(routes, 'search-mode', { mode: 'fallback' })
		assert.equal(savedMode.status, 200)
		assert.equal(savedMode.value.mode, 'fallback')
		const autoMode = await post(routes, 'search-mode', { mode: 'auto' })
		assert.equal(autoMode.status, 200)
		assert.equal(autoMode.value.mode, 'auto')
		await post(routes, 'search-mode', { mode: 'merge' })
		const safeOff = await post(routes, 'search-safe-search', { safeSearch: false })
		assert.equal(safeOff.status, 200)
		assert.equal(safeOff.value.safeSearch, false)
		await post(routes, 'search-safe-search', { safeSearch: true })
		const testedAll = await post(routes, 'search-test-all', {})
		assert.equal(testedAll.status, 200)
		assert.ok(Array.isArray(testedAll.value.results))
		assert.ok(testedAll.value.results.every((entry) => typeof entry.ok === 'boolean'))
		const cleared = await post(routes, 'search-cooldowns-clear')
		assert.equal(cleared.status, 200)
		assert.deepEqual(cleared.value.cooldowns, {})
		const rejectedKeylessKey = await post(routes, 'search-save', { id: 'bing', apiKey: 'nope' })
		assert.equal(rejectedKeylessKey.status, 400)
		assert.match(rejectedKeylessKey.value.error.message, /不需要 API Key/)

		await post(routes, 'search-save', { id: 'brave', enabled: false })

		searchServer = createServer((_request, response) => {
			response.writeHead(200, { 'content-type': 'application/json' })
			response.end(JSON.stringify({
				results: [{ url: 'https://native.example/1', title: 'Native', content: 'native snippet' }],
				answer: 'native answer',
			}))
		})
		await new Promise((resolve) => searchServer.listen(0, '127.0.0.1', resolve))
		const address = searchServer.address()
		assert.ok(address !== null && typeof address === 'object')
		const savedNative = await post(routes, 'search-save', {
			id: 'searxng',
			enabled: true,
			baseUrl: `http://127.0.0.1:${address.port}`,
		})
		assert.equal(savedNative.status, 200)
		const native = await post(routes, 'search-query', { query: 'native' })
		assert.equal(native.status, 200)
		assert.equal(native.value.sources.length, 1)
		assert.equal(native.value.sources[0].url, 'https://native.example/1')
		assert.equal(native.value.sources[0].channel, 'searxng')
		assert.equal(native.value.channels.find((channel) => channel.id === 'searxng').ok, true)
		assert.match(native.value.content, /native answer/u)

		// The panel's time selector travels through the same endpoint.
		const timed = await post(routes, 'search-query', { query: 'native', timeRange: 'week' })
		assert.equal(timed.status, 200)
		assert.equal(timed.value.timeRange, 'week')

		// A blocked domain is normalized by the Host and filters the result set.
		const blocked = await post(routes, 'search-blocked-domains', { domains: 'https://www.native.example/path?q=1\nnot a domain' })
		assert.equal(blocked.status, 200)
		assert.deepEqual(blocked.value.blockedDomains, ['native.example'])
		const filtered = await post(routes, 'search-query', { query: 'native' })
		assert.equal(filtered.status, 200)
		assert.equal(filtered.value.sources.length, 0)
		await post(routes, 'search-blocked-domains', { domains: [] })
		const restored = await post(routes, 'search-query', { query: 'native' })
		assert.equal(restored.value.sources.length, 1)
		await post(routes, 'search-save', { id: 'searxng', enabled: false })

		const rejected = await post(routes, 'mcp-save', {
			id: saved.value.server.id,
			name: 'demo',
			command: 'node',
			args: [],
			env: { DEMO_TOKEN: 'x' },
			enabled: false,
		})
		assert.equal(rejected.status, 400)
		assert.match(rejected.value.error.message, /凭证服务/)

		const removed = await post(routes, 'mcp-remove', { id: saved.value.server.id })
		assert.equal(removed.status, 200)
		assert.deepEqual(removed.value.mcp.servers, [])

		// The preference editor owns $DSH_HOME/AGENTS.md and keeps the
		// authoritative copy in the manager's data directory.
		const preferences = await post(routes, 'preferences')
		assert.equal(preferences.status, 200)
		assert.equal(preferences.value.readable, true)
		assert.equal(preferences.value.content, '')
		assert.equal(preferences.value.agentsPath, join(dshHome, 'AGENTS.md'))
		assert.ok(preferences.value.path.startsWith(dataDir), 'the data file lives in the manager data directory')
		assert.equal(preferences.value.cap, 65536)
		const savedPreferences = await post(routes, 'preferences-save', { content: '# 规则\n\n- 先说结论\n' })
		assert.equal(savedPreferences.status, 200)
		assert.equal(savedPreferences.value.content, '# 规则\n\n- 先说结论')
		assert.match(await readFile(join(dshHome, 'AGENTS.md'), 'utf8'), /先说结论/, 'DSH reads the injected file')
		const oversized = await post(routes, 'preferences-save', { content: 'x'.repeat(65537) })
		assert.equal(oversized.status, 400)

		// The tool catalog: every module's tools, with the description and the
		// parameter schema the agent receives.
		const tools = await post(routes, 'tools-list')
		assert.equal(tools.status, 200)
		assert.deepEqual(tools.value.groups.map((group) => group.id), ['skills', 'mcp', 'search', 'lan'])
		const skillTools = tools.value.groups.find((group) => group.id === 'skills').tools
		assert.equal(skillTools.length, 1)
		assert.equal(skillTools[0].name, 'create_skill')
		assert.match(skillTools[0].description, /Create a new local DSH skill/)
		assert.deepEqual(Object.keys(skillTools[0].parameters.properties).sort(), ['body', 'description', 'name'])
		const searchTools = tools.value.groups.find((group) => group.id === 'search').tools
		const webSearch = searchTools.find((tool) => tool.name === 'web_search')
		assert.ok(webSearch !== undefined, 'the search bridge registered web_search')
		assert.deepEqual(webSearch.parameters.required, ['query'])
		assert.ok(webSearch.parameters.properties.query.description !== '')
		assert.equal(tools.value.groups.find((group) => group.id === 'lan').tools.length, 0)
		// The UI-enhancement switch belongs to the manager and is persisted in
		// the manager's own settings.
		const uiStatus = await post(routes, 'ui-status')
		assert.equal(uiStatus.status, 200, JSON.stringify(uiStatus.value))
		assert.equal(uiStatus.value.available, true)
		assert.equal(uiStatus.value.features.length, 2)
		const rewindFeature = uiStatus.value.features.find((feature) => feature.id === 'rewind')
		assert.equal(rewindFeature.title, '对话回退')
		assert.equal(rewindFeature.enabled, true, 'the feature is on by default')
		assert.equal(rewindFeature.defaultEnabled, true)
		const historyFeature = uiStatus.value.features.find((feature) => feature.id === 'composer-history')
		assert.equal(historyFeature.title, '输入框历史')
		assert.equal(historyFeature.enabled, true, 'on by default as well')
		assert.equal(historyFeature.defaultEnabled, true)
		assert.equal(historyFeature.clientOnly, true, 'it runs in the browser, not on the Host')
		const uiToggled = await post(routes, 'ui-toggle', { id: 'rewind', enabled: false })
		assert.equal(uiToggled.status, 200, JSON.stringify(uiToggled.value))
		assert.equal(uiToggled.value.features.find((feature) => feature.id === 'rewind').enabled, false)
		const historyOff = await post(routes, 'ui-toggle', { id: 'composer-history', enabled: false })
		assert.equal(historyOff.status, 200, JSON.stringify(historyOff.value))
		assert.equal(historyOff.value.features.find((feature) => feature.id === 'composer-history').enabled, false)
		await post(routes, 'ui-toggle', { id: 'composer-history', enabled: true })
		const uiAfter = await post(routes, 'ui-status')
		assert.equal(uiAfter.value.features[0].enabled, false, 'the switch is persisted')

		// The vendored rewind feature brings its own commands, and the switch
		// decides whether they act or only answer.
		assert.ok(registeredCommands.has('rewind'), 'the rewind command is registered: ' + JSON.stringify(warnings))
		assert.ok(registeredCommands.has('undo'), 'the undo alias is registered')
		const rewindCommand = registeredCommands.get('rewind')
		const off = await rewindCommand.handler({ rawInput: '3', args: ['3'] })
		assert.equal(off.kind, 'error', 'a disabled feature refuses to rewind')
		assert.match(off.text, /已关闭/)

		// The browser reports whether the conversation surface mounted, so the
		// panel can say why the button is missing.
		const report = await post(routes, 'ui-client-status', { scope: 'mount', mounted: false, reason: 'services-missing' })
		assert.equal(report.status, 200)
		assert.equal(report.value.mount.mounted, false)
		assert.equal(report.value.mount.reason, 'services-missing')
		await post(routes, 'ui-client-status', { scope: 'row', mounted: true, reason: 'row-action-mounted' })
		const afterReport = await post(routes, 'ui-status')
		assert.equal(afterReport.value.client.mount.mounted, false)
		assert.equal(afterReport.value.client.mount.reason, 'services-missing')
		assert.equal(afterReport.value.client.row.mounted, true)
		assert.equal(afterReport.value.client.row.reason, 'row-action-mounted')

		const counted = await post(routes, 'overview')
		assert.equal(
			counted.value.tools.total,
			tools.value.groups.reduce((sum, group) => sum + group.tools.length, 0),
			'the tab counter matches the catalog',
		)
	} finally {
		if (searchServer !== undefined) {
			await new Promise((resolve) => searchServer.close(resolve))
		}
		for (const dispose of effects) {
			try {
				await dispose()
			} catch {
				// Ignore teardown noise.
			}
		}
		if (savedAgentsHome === undefined) delete process.env.DSH_AGENTS_HOME
		else process.env.DSH_AGENTS_HOME = savedAgentsHome
		if (savedDshHome === undefined) delete process.env.DSH_HOME
		else process.env.DSH_HOME = savedDshHome
		await rm(dshHome, { recursive: true, force: true })
		await rm(dataDir, { recursive: true, force: true })
	}
})
