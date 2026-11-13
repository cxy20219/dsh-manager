import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSearchPrompt, registerSearchPrompt, SEARCH_PROMPT_SECTION } from '../src/agent-prompt.js'

test('the search prompt names the enabled channels and the mode', () => {
	const text = buildSearchPrompt({
		search: {
			mode: 'fallback',
			channels: { bing: { enabled: true }, exa: { enabled: true }, brave: { enabled: false } },
		},
	})
	assert.match(text, /顺序回退/)
	assert.match(text, /Bing、Exa/)
	assert.equal(text.includes('Brave'), false)
	assert.match(text, /web_fetch/)
	assert.match(text, /不可信外部数据/)
})

test('an empty channel set says so instead of listing nothing', () => {
	const text = buildSearchPrompt({ search: { channels: {} } })
	assert.match(text, /没有启用任何搜索渠道/)
})

test('registerSearchPrompt registers once and re-registers on settings change', () => {
	let state = { search: { mode: 'merge', channels: { bing: { enabled: true } } } }
	const sections = []
	const disposals = []
	let listener = null
	const settings = {
		get() {
			return state
		},
		onChange(callback) {
			listener = callback
			return () => { listener = null }
		},
	}
	const systemPrompt = {
		section(options) {
			sections.push(options)
			return () => { disposals.push(options.name) }
		},
	}
	const ctx = {
		inject(names, callback) {
			assert.deepEqual(names, ['systemPrompt'])
			callback({
				get(name) {
					return name === 'systemPrompt' ? systemPrompt : undefined
				},
				effect(fn) {
					const dispose = fn()
					if (typeof dispose === 'function') disposals.push('effect')
				},
			})
		},
	}
	registerSearchPrompt({ ctx, settings })
	assert.equal(sections.length, 1)
	assert.equal(sections[0].name, SEARCH_PROMPT_SECTION)
	assert.equal(sections[0].interpolate, false)
	assert.equal(typeof listener, 'function')

	state = { search: { mode: 'fallback', channels: { exa: { enabled: true } } } }
	listener()
	assert.equal(sections.length, 2)
	assert.match(sections[1].text, /Exa/)
	// The first registration was disposed before its replacement.
	assert.ok(disposals.includes(SEARCH_PROMPT_SECTION))
	assert.ok(disposals.includes('effect'))
})

test('a Host without the systemPrompt service is not an error', () => {
	const ctx = { inject() { throw new Error('missing service') } }
	assert.doesNotThrow(() => registerSearchPrompt({ ctx, settings: { get: () => ({}) } }))
	assert.doesNotThrow(() => registerSearchPrompt({ ctx: undefined, settings: { get: () => ({}) } }))
})
