import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { builtInModes, createModes, UNAVAILABLE } from '../src/modes.js'
import { SettingsStore } from '../src/settings.js'

const DEFAULTS = {
	skills: { roots: [] },
	mcp: { servers: [] },
	lan: { enabled: false, secure: false, port: 8443 },
	modes: { enabled: { simple: true } },
}

/**
 * A settings store backed by a throwaway directory.
 *
 * @returns {Promise<{settings: object, dir: string}>} The store and its folder.
 */
async function store() {
	const dir = await mkdtemp(join(tmpdir(), 'dsh-manager-modes-'))
	const settings = new SettingsStore({ path: join(dir, 'settings.json'), defaults: DEFAULTS })
	await settings.load()
	return { settings, dir }
}

/**
 * A stand-in for the Host registry.
 *
 * @returns {object} A registry that records what it was asked to mount.
 */
function fakeRegistry() {
	const registered = new Map()
	return {
		registered,
		async register(definition) {
			if (registered.has(definition.id)) throw new Error(`Duplicate agent preset: ${definition.id}`)
			registered.set(definition.id, definition)
			return async () => {
				registered.delete(definition.id)
			}
		},
		async list() {
			return [...registered.keys()].map((id) => ({ id }))
		},
	}
}

test('the simple mode keeps goals and subagents and drops scheduled tasks, workflows and plugin management', () => {
	const [simple] = builtInModes('darwin')
	assert.equal(simple.id, 'simple')
	assert.equal(simple.name, '简单')
	const ids = simple.plugins.map((row) => row.id)
	for (const kept of ['tool-goal', 'command-goal', 'delegation', 'tool-skill', 'tool-fs', 'tool-web', 'present']) {
		assert.ok(ids.includes(kept), `expected row ${kept}`)
	}
	for (const dropped of ['tool-schedule', 'workflow-ptc', 'tool-workflow', 'tool-plugin-manager']) {
		assert.ok(!ids.includes(dropped), `unexpected row ${dropped}`)
	}
	const delegation = simple.plugins.find((row) => row.id === 'delegation')
	assert.deepEqual(
		delegation.config.map((row) => row.id),
		['tool-subagent-control', 'tool-subagent', 'tool-subagent-fork'],
	)
	// The registry clones the row list before mounting it, so the definition
	// has to survive a structured clone.
	assert.deepEqual(JSON.parse(JSON.stringify(simple)), simple)
})

test('only the platform shell row is enabled', () => {
	const [mac] = builtInModes('darwin')
	assert.equal(mac.plugins.find((row) => row.id === 'tool-bash').disabled, false)
	assert.equal(mac.plugins.find((row) => row.id === 'tool-pwsh').disabled, true)
	const [windows] = builtInModes('win32')
	assert.equal(windows.plugins.find((row) => row.id === 'tool-bash').disabled, true)
	assert.equal(windows.plugins.find((row) => row.id === 'tool-pwsh').disabled, false)
})

test('an enabled mode is registered on start and dropped when switched off', async () => {
	const { settings, dir } = await store()
	const registry = fakeRegistry()
	const modes = createModes({ getAgentPresets: () => registry, settings })

	try {
		await modes.start()
		assert.equal(registry.registered.size, 1)
		const definition = registry.registered.get('simple')
		assert.equal(definition.name, '简单')
		assert.equal(definition.order, 5)
		assert.ok(definition.plugins.length > 10)

		const before = modes.status()
		assert.equal(before.available, true)
		assert.equal(before.modes[0].enabled, true)
		assert.equal(before.modes[0].registered, true)
		assert.equal(before.modes[0].error, '')
		assert.deepEqual(before.modes[0].removed, ['tool-schedule', 'workflow-ptc', 'tool-workflow', 'tool-plugin-manager'])
		assert.ok(before.modes[0].plugins.some((row) => row.children.length > 0))

		const off = await modes.setEnabled('simple', false)
		assert.equal(registry.registered.size, 0)
		assert.equal(off.modes[0].enabled, false)
		assert.equal(off.modes[0].registered, false)

		const saved = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'))
		assert.equal(saved.modes.enabled.simple, false)

		const on = await modes.setEnabled('simple', true)
		assert.equal(registry.registered.size, 1)
		assert.equal(on.modes[0].enabled, true)
		assert.equal(on.modes[0].registered, true)

		await modes.dispose()
		assert.equal(registry.registered.size, 0)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('a disabled mode stays off across a reload', async () => {
	const { settings, dir } = await store()
	const registry = fakeRegistry()
	const modes = createModes({ getAgentPresets: () => registry, settings })
	try {
		await modes.setEnabled('simple', false)
		const reloaded = new SettingsStore({ path: join(dir, 'settings.json'), defaults: DEFAULTS })
		await reloaded.load()
		assert.equal(reloaded.get().modes.enabled.simple, false)

		const second = createModes({ getAgentPresets: () => registry, settings: reloaded })
		await second.start()
		assert.equal(registry.registered.size, 0)
		assert.equal(second.status().modes[0].enabled, false)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('a Host without the mode service reports why instead of failing', async () => {
	const { settings, dir } = await store()
	const modes = createModes({ getAgentPresets: () => undefined, settings })
	try {
		await modes.start()
		const status = modes.status()
		assert.equal(status.available, false)
		assert.equal(status.modes[0].registered, false)
		assert.equal(status.modes[0].error, UNAVAILABLE)

		// The switch still records the intent, so the mode can come back once
		// the composition has an agent-preset registry.
		const off = await modes.setEnabled('simple', false)
		assert.equal(off.modes[0].enabled, false)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('a duplicate preset id is a reported error, not a crash', async () => {
	const { settings, dir } = await store()
	const registry = fakeRegistry()
	registry.registered.set('simple', { id: 'simple' })
	const modes = createModes({ getAgentPresets: () => registry, settings })
	try {
		await modes.start()
		const status = modes.status()
		assert.equal(status.modes[0].registered, false)
		assert.match(status.modes[0].error, /Duplicate agent preset/)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('an unknown mode id is rejected', async () => {
	const { settings, dir } = await store()
	const modes = createModes({ getAgentPresets: () => fakeRegistry(), settings })
	try {
		await assert.rejects(modes.setEnabled('nope', true), /未知模式/)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})
