import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
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
	const registeredPresets = new Map()
	let provider
	let searchServer
	/** What the merged registry offers; the test changes it to simulate a shadow. */
	let catalogEntries = [
		{ name: 'demo-skill', description: '演示技能', provider: 'manager-external', invocation: { modelInvocable: true, userInvocable: true } },
		{ name: 'builtin-skill', description: '内置技能', provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: true } },
	]
	const ctx = {
		logger: { info() {}, warn() {} },
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
			if (name === 'agentPresets') {
				return {
					async register(definition) {
						registeredPresets.set(definition.id, definition)
						return async () => {
							registeredPresets.delete(definition.id)
						}
					},
					async list() {
						return [...registeredPresets.keys()].map((id) => ({ id }))
					},
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
			const dispose = fn()
			effects.push(dispose)
			return () => {}
		},
		// The vendored kernel subscribes to agent lifecycle events; the real Host
		// provides these, so the fake context has to as well.
		on() {
			return () => {}
		},
		emit() {},
	}

	try {
		await apply(ctx, { dataDir })
		// The panel's own endpoints, plus the vendored kernel's 44 routes that
		// share the same /api/manager prefix.
		assert.equal(routes.filter((route) => ENDPOINTS.some((name) => route.path === `/api/manager/${name}`)).length, ENDPOINTS.length)
		assert.ok(routes.length > ENDPOINTS.length, 'the kernel registered its routes too')
		assert.ok(
			routes.every((route) => route.path.startsWith('/api/manager/')),
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
		assert.ok(overview.value.catalog.external.includes('builtin-skill'))

		// The mode is registered detached from this row's own activation, so
		// wait for the mount to land before reading it back.
		let modes = overview.value.modes
		for (let attempt = 0; attempt < 100 && modes.modes[0]?.registered !== true; attempt += 1) {
			await new Promise((resolve) => setTimeout(resolve, 10))
			modes = (await post(routes, 'overview')).value.modes
		}
		assert.equal(modes.available, true)
		assert.equal(modes.modes[0].id, 'simple')
		assert.equal(modes.modes[0].enabled, true)
		assert.equal(modes.modes[0].error, '')
		assert.equal(registeredPresets.size, 1)
		assert.ok(registeredPresets.get('simple').plugins.length > 10)

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

		const switchedOff = await post(routes, 'mode-toggle', { id: 'simple', enabled: false })
		assert.equal(switchedOff.status, 200)
		assert.equal(switchedOff.value.modes.modes[0].enabled, false)
		assert.equal(switchedOff.value.modes.modes[0].registered, false)
		assert.equal(registeredPresets.size, 0)
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
