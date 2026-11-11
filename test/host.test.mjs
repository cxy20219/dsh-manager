import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { apply } from '../index.js'
import { ENDPOINTS } from '../src/remote.js'

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

test('the Host half serves skills, toggles categories, and stores MCP rows', async () => {
	const agentsHome = await mkdtemp(join(tmpdir(), 'dsh-manager-host-'))
	const dataDir = await mkdtemp(join(tmpdir(), 'dsh-manager-data-'))
	await mkdir(join(agentsHome, 'skills', 'dev', 'demo-skill'), { recursive: true })
	await writeFile(join(agentsHome, 'skills', 'dev', 'demo-skill', 'SKILL.md'), skill('demo-skill', '演示技能'))
	const savedAgentsHome = process.env.DSH_AGENTS_HOME
	process.env.DSH_AGENTS_HOME = agentsHome

	const routes = []
	const effects = []
	let provider
	/** What the merged registry offers; the test changes it to simulate a shadow. */
	let catalogEntries = [
		{ name: 'demo-skill', description: '演示技能', provider: 'manager', invocation: { modelInvocable: true, userInvocable: true } },
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
			return undefined
		},
		effect(fn) {
			const dispose = fn()
			effects.push(dispose)
			return () => {}
		},
	}

	try {
		await apply(ctx, { dataDir })
		assert.equal(routes.length, ENDPOINTS.length)
		assert.ok(provider !== undefined)

		const overview = await post(routes, 'overview')
		assert.equal(overview.status, 200)
		assert.equal(overview.value.skills.totals.skills, 1)
		assert.equal(overview.value.skills.totals.enabled, 1)
		assert.equal(overview.value.skills.categories[0].name, 'dev')
		assert.equal(overview.value.mcp.available, false)
		assert.deepEqual(overview.value.mcp.servers, [])
		assert.equal(overview.value.catalog.total, 2)
		assert.equal(overview.value.catalog.managed, 1)
		assert.equal(overview.value.catalog.visible, 2)
		assert.deepEqual(overview.value.catalog.external, ['builtin-skill'])
		assert.deepEqual(overview.value.catalog.missing, [])

		// A higher-priority provider wins the name: the manager's copy is active
		// in its own scan but never reaches the agent, so the panel must say so.
		catalogEntries = [
			{ name: 'builtin-skill', description: '内置技能', provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: true } },
		]
		const shadowed = await post(routes, 'overview')
		assert.deepEqual(shadowed.value.catalog.missing, ['demo-skill'])
		catalogEntries = [
			{ name: 'demo-skill', description: '演示技能', provider: 'manager', invocation: { modelInvocable: true, userInvocable: true } },
			{ name: 'builtin-skill', description: '内置技能', provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: true } },
		]

		const listed = await provider.list({})
		assert.deepEqual(listed.map((entry) => entry.name), ['demo-skill'])

		const toggled = await post(routes, 'skill-toggle', { category: 'dev', enabled: false })
		assert.equal(toggled.status, 200)
		assert.deepEqual(await provider.list({}), [])

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
	} finally {
		for (const dispose of effects) {
			try {
				await dispose()
			} catch {
				// Ignore teardown noise.
			}
		}
		if (savedAgentsHome === undefined) delete process.env.DSH_AGENTS_HOME
		else process.env.DSH_AGENTS_HOME = savedAgentsHome
		await rm(agentsHome, { recursive: true, force: true })
		await rm(dataDir, { recursive: true, force: true })
	}
})
