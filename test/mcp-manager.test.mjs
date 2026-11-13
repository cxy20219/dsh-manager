import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { createMcpManager } from '../src/mcp.js'
import { SettingsStore } from '../src/settings.js'

const server = fileURLToPath(new URL('./fixtures/fake-mcp-server.mjs', import.meta.url))

async function waitFor(predicate, timeoutMs = 5000) {
	const started = Date.now()
	for (;;) {
		if (predicate()) return
		if (Date.now() - started > timeoutMs) throw new Error('等待状态超时')
		await new Promise((resolve) => setTimeout(resolve, 25))
	}
}

test('registers discovered tools, calls them, and removes them on disable', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'dsh-manager-mcp-'))
	const store = new SettingsStore({
		path: join(dir, 'settings.json'),
		defaults: { skills: { roots: [] }, mcp: { servers: [] } },
	})
	await store.load()
	const defined = new Map()
	const records = new Map()
	const credentials = {
		async readRecord(key) {
			return records.get(key)
		},
		async modifyRecord(key, mutate) {
			records.set(key, await mutate(records.get(key)))
			return records.get(key)
		},
		async deleteRecord(key) {
			records.delete(key)
		},
	}
	const mcp = createMcpManager({
		ctx: {
			get(name) {
				if (name === 'tools') {
					return {
						register(definition) {
							defined.set(definition.name, definition)
							return () => defined.delete(definition.name)
						},
					}
				}
				if (name === 'credentials') return credentials
				return undefined
			},
		},
		settings: store,
		credentials,
		version: '0.0.0-test',
		logger: { warn() {} },
	})
	try {
		const saved = await mcp.save({
			name: 'fake',
			command: process.execPath,
			args: [server],
			env: { MCP_TEST_TOKEN: 'token-from-credentials' },
			enabled: true,
		})
		// `ready` is set when the connection negotiates, before the tool list
		// comes back; wait for the tools themselves, not the state flag.
		await waitFor(() => (mcp.describe().servers[0].tools ?? []).length === 3)
		assert.equal(saved.envKeys.length, 1)
		// Credential keys must be two `[a-z][a-z0-9-]*` segments.
		assert.match(saved.id, /^[a-z][a-z0-9-]*$/u)
		const names = [...defined.keys()].sort()
		assert.equal(names.length, 3)
		assert.ok(names.includes('mcp__fake__echo'))
		assert.ok(names.includes('mcp__fake__read_env'))
		assert.ok(names.some((name) => name.startsWith('mcp__fake__weird_name_')))

		const echo = defined.get('mcp__fake__echo')
		const result = await echo.execute({ text: '你好' }, { signal: new AbortController().signal })
		assert.equal(result.text, '你好')
		const content = echo.output.render({}, result)
		assert.deepEqual(content, [{ type: 'text', text: '你好' }])

		const readEnv = defined.get('mcp__fake__read_env')
		const envResult = await readEnv.execute({}, { signal: new AbortController().signal })
		assert.equal(envResult.text, 'token-from-credentials')

		// The environment values never enter the settings document.
		const persisted = await readFile(join(dir, 'settings.json'), 'utf8')
		assert.equal(persisted.includes('token-from-credentials'), false)
		assert.match(persisted, /envKeys/)

		await mcp.setEnabled({ id: saved.id, enabled: false })
		assert.equal(defined.size, 0)
		assert.equal(mcp.describe().servers[0].state, 'stopped')
	} finally {
		await mcp.dispose()
		await rm(dir, { recursive: true, force: true })
	}
})

test('surfaces a failing command as a connection error', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'dsh-manager-mcp-fail-'))
	const store = new SettingsStore({
		path: join(dir, 'settings.json'),
		defaults: { skills: { roots: [] }, mcp: { servers: [] } },
	})
	await store.load()
	const mcp = createMcpManager({
		ctx: { get() { return undefined } },
		settings: store,
		credentials: undefined,
		version: '0.0.0-test',
		logger: { warn() {} },
	})
	try {
		await mcp.save({ name: 'broken', command: '/nonexistent/dsh-manager-binary', enabled: true })
		await waitFor(() => mcp.describe().servers[0].state === 'error')
		assert.match(mcp.describe().servers[0].error, /ENOENT|退出|失败/)
	} finally {
		await mcp.dispose()
		await rm(dir, { recursive: true, force: true })
	}
})
