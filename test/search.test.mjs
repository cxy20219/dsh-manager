import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createSearchManager, MAX_RESULTS, splitSearchKeys } from '../src/search.js'
import { SEARCH_CHANNELS } from '../src/search-providers.js'
import { SettingsStore } from '../src/settings.js'

/**
 * Channel defaults for a throwaway store.
 *
 * @returns {Record<string, {enabled: boolean, baseUrl: string}>} The defaults.
 */
function channelDefaults() {
	const channels = {}
	for (const channel of SEARCH_CHANNELS) channels[channel.id] = { enabled: false, baseUrl: '' }
	return channels
}

/**
 * A settings store backed by a throwaway directory.
 *
 * @returns {Promise<{settings: object, dir: string}>} The store and its folder.
 */
async function store() {
	const dir = await mkdtemp(join(tmpdir(), 'dsh-manager-search-'))
	const settings = new SettingsStore({
		path: join(dir, 'settings.json'),
		defaults: {
			skills: { roots: [] },
			mcp: { servers: [] },
			lan: { enabled: false, secure: false, port: 8443 },
			modes: { enabled: { simple: true } },
			search: { channels: channelDefaults(), mode: 'merge', order: SEARCH_CHANNELS.map((channel) => channel.id) },
		},
	})
	await settings.load()
	return { settings, dir }
}

/**
 * In-memory credential records shaped like the Host seam.
 *
 * @returns {object} The fake service.
 */
function fakeCredentials(shared = {}) {
	const records = new Map()
	return {
		records,
		shared,
		async readRecord(key) {
			return records.get(key)
		},
		async resolve(ref) {
			return typeof shared[ref] === 'string' && shared[ref] !== '' ? { value: shared[ref] } : undefined
		},
		async modifyRecord(key, mutate) {
			const next = await mutate(records.get(key))
			if (next === undefined) return records.get(key)
			records.set(key, next)
			return next
		},
		async deleteRecord(key) {
			records.delete(key)
		},
	}
}

/**
 * A fetch stand-in that answers known provider hosts with sample payloads.
 *
 * @param {object} [overrides] - Host-specific replacements.
 * @returns {{fetch: Function, calls: object[]}} The fake and its call log.
 */
function fakeFetch(overrides = {}) {
	const calls = []
	return {
		calls,
		async fetch(url, init) {
			const target = String(url)
			calls.push({ url: target, init })
			for (const [host, handler] of Object.entries(overrides)) {
				if (target.includes(host)) return handler({ url: target, init })
			}
			if (target.includes('api.exa.ai')) {
				return jsonResponse({
					results: [
						{ url: 'https://exa.example/1', title: 'Exa 1', highlights: ['exa snippet'], publishedDate: '2026-01-01' },
						{ url: 'https://shared.example/1', title: 'Shared from Exa', highlights: ['shared'] },
					],
				})
			}
			if (target.includes('api.tavily.com')) {
				return jsonResponse({
					results: [
						{ url: 'https://shared.example/1', title: 'Shared from Tavily', content: 'duplicate' },
						{ url: 'https://tavily.example/1', title: 'Tavily 1', content: 'tavily snippet' },
					],
				})
			}
			if (target.includes('127.0.0.1:8080')) {
				return jsonResponse({
					results: [{ url: 'https://searx.example/1', title: 'SearXNG 1', content: 'searx snippet' }],
					answer: 'searx answer',
				})
			}
			return jsonResponse({ results: [] })
		},
	}
}

/**
 * Build a JSON response.
 *
 * @param {object} body - JSON body.
 * @param {number} [status] - HTTP status.
 * @returns {Response} The response.
 */
function jsonResponse(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	})
}

test('describe lists every channel without keys and with merge limits', async () => {
	const { settings, dir } = await store()
	try {
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: fakeFetch().fetch })
		const status = await search.describe()
		assert.equal(status.channels.length, SEARCH_CHANNELS.length)
		assert.equal(status.enabledCount, 0)
		assert.equal(status.maxResults, MAX_RESULTS)
		assert.equal(status.perChannelResults, 10)
		const exa = status.channels.find((channel) => channel.id === 'exa')
		assert.equal(exa.enabled, false)
		assert.equal(exa.keyConfigured, false)
		assert.equal(exa.keyWritable, true)
		assert.equal(exa.requiresKey, false)
		assert.equal(exa.keyMode, 'optional')
		assert.equal(exa.free, true)
		const searxng = status.channels.find((channel) => channel.id === 'searxng')
		assert.equal(searxng.requiresKey, false)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('save toggles a channel and persists a normalized base URL', async () => {
	const { settings, dir } = await store()
	try {
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: fakeFetch().fetch })
		const saved = await search.save({ id: 'exa', enabled: true, baseUrl: 'https://gateway.example/exa/' })
		const exa = saved.channels.find((channel) => channel.id === 'exa')
		assert.equal(exa.enabled, true)
		assert.equal(exa.baseUrl, 'https://gateway.example/exa')
		assert.equal(settings.get().search.channels.exa.enabled, true)
		assert.equal(settings.get().search.channels.exa.baseUrl, 'https://gateway.example/exa')

		await assert.rejects(search.save({ id: 'exa', baseUrl: 'file:///tmp/x' }), /http\/https/)
		await assert.rejects(search.save({ id: 'exa', baseUrl: 'https://user:pass@example.com' }), /用户名或密码/)
		await assert.rejects(search.save({ id: 'missing' }), /未知的搜索渠道/)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('API keys go to the credential store and never appear in the view', async () => {
	const { settings, dir } = await store()
	try {
		const credentials = fakeCredentials()
		const search = createSearchManager({ settings, credentials, fetchImpl: fakeFetch().fetch })
		const saved = await search.save({ id: 'exa', apiKey: 'sk-exa-secret' })
		const exa = saved.channels.find((channel) => channel.id === 'exa')
		assert.equal(exa.keyConfigured, true)
		assert.equal(exa.keySource, 'record')
		assert.deepEqual(credentials.records.get('dsh-manager/search-exa'), { kind: 'api-key', key: 'sk-exa-secret' })
		assert.equal(JSON.stringify(saved).includes('sk-exa-secret'), false)

		// An empty key means "keep", matching the MCP environment form.
		await search.save({ id: 'exa', apiKey: '' })
		assert.equal((await search.describe()).channels.find((channel) => channel.id === 'exa').keyConfigured, true)

		const cleared = await search.save({ id: 'exa', clearKey: true })
		assert.equal(cleared.channels.find((channel) => channel.id === 'exa').keyConfigured, false)
		assert.equal(credentials.records.has('dsh-manager/search-exa'), false)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('a key in the Host credential center is reused before the environment', async () => {
	const { settings, dir } = await store()
	const saved = process.env.EXA_API_KEY
	process.env.EXA_API_KEY = 'env-exa-key'
	try {
		const credentials = fakeCredentials({ EXA_API_KEY: 'host-exa-key' })
		const search = createSearchManager({ settings, credentials, fetchImpl: fakeFetch().fetch })
		let exa = (await search.describe()).channels.find((channel) => channel.id === 'exa')
		assert.equal(exa.keyConfigured, true)
		assert.equal(exa.keySource, 'host')

		await search.save({ id: 'exa', apiKey: 'record-exa-key' })
		exa = (await search.describe()).channels.find((channel) => channel.id === 'exa')
		assert.equal(exa.keySource, 'record')

		await search.save({ id: 'exa', clearKey: true })
		exa = (await search.describe()).channels.find((channel) => channel.id === 'exa')
		assert.equal(exa.keySource, 'host')
	} finally {
		if (saved === undefined) delete process.env.EXA_API_KEY
		else process.env.EXA_API_KEY = saved
		await rm(dir, { recursive: true, force: true })
	}
})

test('environment variables are the key fallback and a stored record wins', async () => {
	const { settings, dir } = await store()
	const saved = process.env.EXA_API_KEY
	process.env.EXA_API_KEY = 'env-exa-key'
	try {
		const credentials = fakeCredentials()
		const search = createSearchManager({ settings, credentials, fetchImpl: fakeFetch().fetch })
		let exa = (await search.describe()).channels.find((channel) => channel.id === 'exa')
		assert.equal(exa.keyConfigured, true)
		assert.equal(exa.keySource, 'env')

		await search.save({ id: 'exa', apiKey: 'record-exa-key' })
		exa = (await search.describe()).channels.find((channel) => channel.id === 'exa')
		assert.equal(exa.keySource, 'record')

		await search.save({ id: 'exa', clearKey: true })
		exa = (await search.describe()).channels.find((channel) => channel.id === 'exa')
		assert.equal(exa.keyConfigured, true)
		assert.equal(exa.keySource, 'env')
	} finally {
		if (saved === undefined) delete process.env.EXA_API_KEY
		else process.env.EXA_API_KEY = saved
		await rm(dir, { recursive: true, force: true })
	}
})

test('search fans out, merges by consensus, deduplicates and reports per channel', async () => {
	const { settings, dir } = await store()
	try {
		const credentials = fakeCredentials()
		const search = createSearchManager({ settings, credentials, fetchImpl: fakeFetch().fetch })
		await search.save({ id: 'exa', enabled: true, apiKey: 'exa-key' })
		await search.save({ id: 'tavily', enabled: true, apiKey: 'tavily-key' })

		const result = await search.search({ query: '  dsh manager  ', maxResults: 10 })
		assert.equal(result.query, 'dsh manager')
		assert.deepEqual(result.channels.map((channel) => [channel.id, channel.ok, channel.count]), [
			['exa', true, 2],
			['tavily', true, 2],
		])
		assert.deepEqual(result.sources.map((source) => source.url), [
			'https://shared.example/1',
			'https://exa.example/1',
			'https://tavily.example/1',
		])
		assert.equal(result.sources.length, 3)
		assert.equal(result.sources[0].channel, 'exa')
		assert.equal(result.sources[0].channelLabel, 'Exa')
		assert.equal(result.sources[2].channel, 'tavily')
		assert.ok(result.elapsedMs >= 0)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('near-duplicate results from different URLs are collapsed', async () => {
	const { settings, dir } = await store()
	try {
		const search = createSearchManager({
			settings,
			credentials: fakeCredentials(),
			fetchImpl: fakeFetch({
				'api.exa.ai': () => jsonResponse({
					results: [
						{ url: 'https://one.example/a', title: 'Same article title', highlights: ['same snippet text about the manager'] },
						{ url: 'https://two.example/b', title: 'Same article title', highlights: ['same snippet text about the manager'] },
					],
				}),
			}).fetch,
		})
		await search.save({ id: 'exa', enabled: true, apiKey: 'exa-key' })
		const result = await search.search({ query: 'duplicate' })
		assert.equal(result.sources.length, 1)
		assert.equal(result.sources[0].url, 'https://one.example/a')
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('one site is capped when results span four or more sites', async () => {
	const { settings, dir } = await store()
	try {
		const results = [
			...Array.from({ length: 5 }, (_, index) => ({ url: `https://docs.example.com/${index}`, title: `Docs ${index}`, content: `page number ${index}` })),
			{ url: 'https://a.example.org/1', title: 'A', content: 'a' },
			{ url: 'https://b.example.net/1', title: 'B', content: 'b' },
			{ url: 'https://c.example.io/1', title: 'C', content: 'c' },
		]
		const search = createSearchManager({
			settings,
			credentials: fakeCredentials(),
			fetchImpl: fakeFetch({ 'api.exa.ai': () => jsonResponse({ results }) }).fetch,
		})
		await search.save({ id: 'exa', enabled: true, apiKey: 'exa-key' })
		const result = await search.search({ query: 'docs', maxResults: 10 })
		assert.equal(result.sources.filter((source) => source.url.includes('docs.example.com')).length, 3)
		assert.equal(result.sources.length, 6)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('a missing key is one channel error, not a failed search', async () => {
	const { settings, dir } = await store()
	try {
		const savedExa = process.env.BRAVE_API_KEY
		delete process.env.BRAVE_API_KEY
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: fakeFetch().fetch })
		await search.save({ id: 'brave', enabled: true })
		await search.save({ id: 'searxng', enabled: true, baseUrl: 'http://127.0.0.1:8080' })
		try {
			const result = await search.search({ query: 'hello' })
			const brave = result.channels.find((channel) => channel.id === 'brave')
			const searxng = result.channels.find((channel) => channel.id === 'searxng')
			assert.equal(brave.ok, false)
			assert.equal(brave.error.code, 'config')
			assert.equal(searxng.ok, true)
			assert.equal(result.sources[0].url, 'https://searx.example/1')
			assert.equal(result.content, 'SearXNG：searx answer')
		} finally {
			if (savedExa === undefined) delete process.env.BRAVE_API_KEY
			else process.env.BRAVE_API_KEY = savedExa
		}
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('a repeated merge search is served from the in-memory cache', async () => {
	const { settings, dir } = await store()
	try {
		const fetch = fakeFetch()
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: fetch.fetch })
		await search.save({ id: 'exa', enabled: true, apiKey: 'exa-key' })
		await search.save({ id: 'tavily', enabled: true, apiKey: 'tavily-key' })
		const first = await search.search({ query: 'hello' })
		assert.equal(first.cached, false)
		const callsAfterFirst = fetch.calls.length
		const second = await search.search({ query: 'hello' })
		assert.equal(second.cached, true)
		assert.equal(fetch.calls.length, callsAfterFirst)
		assert.deepEqual(second.sources.map((source) => source.url), first.sources.map((source) => source.url))
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('fallback mode stops at the first channel with sources and cools a failed channel', async () => {
	const { settings, dir } = await store()
	try {
		const fetch = fakeFetch({
			'api.exa.ai': async () => jsonResponse({ error: 'invalid key' }, 401),
		})
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: fetch.fetch })
		await search.save({ id: 'exa', enabled: true, apiKey: 'bad-exa-key' })
		await search.save({ id: 'tavily', enabled: true, apiKey: 'tavily-key' })
		await search.save({ id: 'brave', enabled: true, apiKey: 'brave-key' })
		await search.saveOrder({ ids: ['exa', 'tavily', 'brave'] })
		await search.saveMode({ mode: 'fallback' })

		const first = await search.search({ query: 'hello' })
		assert.equal(first.mode, 'fallback')
		assert.deepEqual(first.channels.map((channel) => [channel.id, channel.ok, channel.error?.code]), [
			['exa', false, 'auth'],
			['tavily', true, undefined],
		])
		assert.deepEqual(first.sources.map((source) => source.url), [
			'https://shared.example/1',
			'https://tavily.example/1',
		])
		assert.equal(first.channels[0].cooldownMs > 0, true)

		const before = fetch.calls.filter((call) => call.url.includes('api.exa.ai')).length
		const second = await search.search({ query: 'another query' })
		const after = fetch.calls.filter((call) => call.url.includes('api.exa.ai')).length
		assert.equal(after, before)
		assert.equal(second.channels[0].id, 'exa')
		assert.equal(second.channels[0].error.code, 'cooldown')
		assert.equal(second.channels[1].id, 'tavily')
		assert.equal(second.sources.length, 2)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('a cooled channel is skipped in merge mode until reset', async () => {
	const { settings, dir } = await store()
	try {
		const fetch = fakeFetch({
			'api.exa.ai': async () => jsonResponse({ error: 'invalid key' }, 401),
		})
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: fetch.fetch })
		await search.save({ id: 'exa', enabled: true, apiKey: 'bad-exa-key' })
		await search.save({ id: 'tavily', enabled: true, apiKey: 'tavily-key' })

		const first = await search.search({ query: 'first' })
		assert.equal(first.channels.find((channel) => channel.id === 'exa').ok, false)
		const before = fetch.calls.filter((call) => call.url.includes('api.exa.ai')).length
		const second = await search.search({ query: 'second' })
		const after = fetch.calls.filter((call) => call.url.includes('api.exa.ai')).length
		assert.equal(after, before)
		const cooled = second.channels.find((channel) => channel.id === 'exa')
		assert.equal(cooled.error.code, 'cooldown')
		assert.equal(cooled.cooldownMs > 0, true)

		const reset = await search.clearCooldowns()
		assert.equal(reset.cooldowns.exa, undefined)
		const third = await search.search({ query: 'third' })
		assert.equal(third.channels.find((channel) => channel.id === 'exa').error.code, 'auth')
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('an optional-key channel searches without a key', async () => {
	const { settings, dir } = await store()
	try {
		const sse = `data: ${JSON.stringify({
			result: { content: [{ type: 'text', text: 'Title: Hello\nURL: https://exa.example/1\nHighlights:\nhello world' }] },
		})}\n\n`
		const fetch = fakeFetch({
			'mcp.exa.ai': async () => new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
		})
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: fetch.fetch })
		await search.save({ id: 'exa', enabled: true })
		const result = await search.search({ query: 'hello' })
		assert.equal(result.channels[0].ok, true)
		assert.equal(result.sources[0].url, 'https://exa.example/1')
		assert.ok(fetch.calls.some((call) => call.url.includes('mcp.exa.ai')))
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('all cooled channels return an allCooling result without another request', async () => {
	const { settings, dir } = await store()
	try {
		const fetch = fakeFetch({
			'api.exa.ai': async () => jsonResponse({ error: 'invalid key' }, 401),
		})
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: fetch.fetch })
		await search.save({ id: 'exa', enabled: true, apiKey: 'bad-exa-key' })
		const first = await search.search({ query: 'first' })
		assert.equal(first.channels[0].error.code, 'auth')
		const before = fetch.calls.length
		const second = await search.search({ query: 'second' })
		assert.equal(fetch.calls.length, before)
		assert.equal(second.allCooling, true)
		assert.equal(second.sources.length, 0)
		assert.equal(second.channels[0].error.code, 'cooldown')
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('saving a channel clears its cached results', async () => {
	const { settings, dir } = await store()
	try {
		const fetch = fakeFetch()
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: fetch.fetch })
		await search.save({ id: 'exa', enabled: true, apiKey: 'exa-key' })
		await search.save({ id: 'tavily', enabled: true, apiKey: 'tavily-key' })
		await search.search({ query: 'hello' })
		const before = fetch.calls.length
		await search.save({ id: 'exa', enabled: true })
		const second = await search.search({ query: 'hello' })
		assert.equal(second.cached, false)
		assert.ok(fetch.calls.length > before)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('timeRange reaches the adapter and is part of the cache key', async () => {
	const { settings, dir } = await store()
	try {
		const fetch = fakeFetch()
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: fetch.fetch })
		await search.save({ id: 'tavily', enabled: true, apiKey: 'tavily-key' })
		const first = await search.search({ query: 'hello', timeRange: 'week' })
		assert.equal(first.timeRange, 'week')
		const tavilyCall = fetch.calls.find((call) => call.url.includes('api.tavily.com'))
		assert.equal(JSON.parse(tavilyCall.init.body).time_range, 'week')

		const before = fetch.calls.length
		const cached = await search.search({ query: 'hello', timeRange: 'week' })
		assert.equal(cached.cached, true)
		assert.equal(fetch.calls.length, before)

		const other = await search.search({ query: 'hello', timeRange: 'month' })
		assert.equal(other.cached, false)
		const otherCall = fetch.calls.filter((call) => call.url.includes('api.tavily.com')).at(-1)
		assert.equal(JSON.parse(otherCall.init.body).time_range, 'month')
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('order and mode are validated and persisted', async () => {
	const { settings, dir } = await store()
	try {
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: fakeFetch().fetch })
		const saved = await search.saveOrder({ ids: ['tavily', 'exa'] })
		assert.deepEqual(saved.order.slice(0, 3), ['tavily', 'exa', 'minimax'])
		assert.equal(settings.get().search.order[0], 'tavily')
		await assert.rejects(search.saveOrder({ ids: ['tavily', 'tavily'] }), /不能重复/)
		await assert.rejects(search.saveOrder({ ids: ['missing'] }), /未知的渠道/)
		const mode = await search.saveMode({ mode: 'fallback' })
		assert.equal(mode.mode, 'fallback')
		assert.equal(settings.get().search.mode, 'fallback')
		await assert.rejects(search.saveMode({ mode: 'fast' }), /merge、fallback 或 auto/)
		const auto = await search.saveMode({ mode: 'auto' })
		assert.equal(auto.mode, 'auto')
		assert.equal(settings.get().search.mode, 'auto')
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('ensureFreeFallback seeds Bing and Exa exactly once', async () => {
	const { settings, dir } = await store()
	try {
		const search = createSearchManager({ settings })
		assert.equal(await search.ensureFreeFallback(), true)
		const status = await search.describe()
		assert.equal(status.channels.find((channel) => channel.id === 'bing').enabled, true)
		assert.equal(status.channels.find((channel) => channel.id === 'exa').enabled, true)
		assert.equal(settings.get().search.freeFallbackSeeded, true)
		assert.equal(await search.ensureFreeFallback(), false)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('a search can restrict channels for multi_search', async () => {
	const { settings, dir } = await store()
	try {
		const fetch = fakeFetch()
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: fetch.fetch })
		await search.save({ id: 'exa', enabled: true, apiKey: 'exa-key' })
		await search.save({ id: 'tavily', enabled: true, apiKey: 'tavily-key' })
		const result = await search.search({ query: 'hello', channels: ['exa'] })
		assert.deepEqual(result.channels.map((channel) => channel.id), ['exa'])
		assert.equal(result.sources.every((source) => source.channel === 'exa'), true)
		await assert.rejects(search.search({ query: 'hello', channels: ['nope'] }), /未知的搜索渠道/)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('search refuses to run with no enabled channel', async () => {
	const { settings, dir } = await store()
	try {
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: fakeFetch().fetch })
		await assert.rejects(search.search({ query: 'x' }), /没有启用的搜索渠道/)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('test runs one channel regardless of its switch and maps HTTP errors', async () => {
	const { settings, dir } = await store()
	try {
		const credentials = fakeCredentials()
		const okFetch = fakeFetch().fetch
		const search = createSearchManager({ settings, credentials, fetchImpl: okFetch })
		await search.save({ id: 'exa', apiKey: 'exa-key' })
		const tested = await search.test({ id: 'exa', query: 'hello' })
		assert.equal(tested.ok, true)
		assert.equal(tested.count, 2)
		assert.equal(tested.sources.length, 2)
		assert.equal(tested.sources[0].title, 'Exa 1')

		const denied = createSearchManager({
			settings,
			credentials,
			fetchImpl: async () => jsonResponse({ error: 'nope' }, 401),
		})
		const failed = await denied.test({ id: 'exa' })
		assert.equal(failed.ok, false)
		assert.equal(failed.failure.code, 'auth')
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('a blocked domain drops the site and its subdomains but not lookalikes', async () => {
	const { settings, dir } = await store()
	try {
		const search = createSearchManager({
			settings,
			credentials: fakeCredentials(),
			fetchImpl: fakeFetch({
				'api.exa.ai': () => jsonResponse({
					results: [
						{ url: 'https://blog.csdn.net/a', title: 'CSDN A' },
						{ url: 'https://notcsdn.net/b', title: 'Not CSDN' },
						{ url: 'https://docs.example.com/c', title: 'Docs' },
					],
				}),
			}).fetch,
		})
		await search.save({ id: 'exa', enabled: true, apiKey: 'exa-key' })

		// A pasted URL and a duplicate collapse into one bare rule.
		const saved = await search.saveBlockedDomains({ domains: 'https://www.csdn.net/some/path\nnot a domain\ncsdn.net' })
		assert.deepEqual(saved.blockedDomains, ['csdn.net'])
		assert.deepEqual(settings.get().search.blockedDomains, ['csdn.net'])

		const first = await search.search({ query: 'hello' })
		const firstUrls = first.sources.map((source) => source.url)
		assert.equal(firstUrls.includes('https://blog.csdn.net/a'), false)
		assert.equal(firstUrls.includes('https://notcsdn.net/b'), true)
		assert.equal(firstUrls.includes('https://docs.example.com/c'), true)

		// A parent-domain rule covers its subdomains.
		await search.saveBlockedDomains({ domains: ['example.com'] })
		const second = await search.search({ query: 'hello' })
		const secondUrls = second.sources.map((source) => source.url)
		assert.equal(secondUrls.includes('https://docs.example.com/c'), false)
		assert.equal(secondUrls.includes('https://notcsdn.net/b'), true)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('asking for a disabled channel names it instead of saying none are enabled', async () => {
	const { settings, dir } = await store()
	try {
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: fakeFetch().fetch })
		await search.save({ id: 'exa', enabled: true, apiKey: 'exa-key' })
		await assert.rejects(search.search({ query: 'x', channels: ['bing'] }), /指定的搜索渠道未启用：Bing/)
		await assert.rejects(search.search({ query: 'x', channels: ['nope'] }), /未知的搜索渠道/)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('fallback skips a channel whose only results are blocked', async () => {
	const { settings, dir } = await store()
	try {
		const search = createSearchManager({
			settings,
			credentials: fakeCredentials(),
			fetchImpl: fakeFetch({
				'api.exa.ai': () => jsonResponse({
					results: [{ url: 'https://csdn.example/a', title: 'blocked result' }],
				}),
			}).fetch,
		})
		await search.save({ id: 'exa', enabled: true, apiKey: 'exa-key' })
		await search.save({ id: 'tavily', enabled: true, apiKey: 'tavily-key' })
		await search.saveMode({ mode: 'fallback' })
		await search.saveBlockedDomains({ domains: ['csdn.example'] })
		const result = await search.search({ query: 'hello' })
		assert.equal(result.mode, 'fallback')
		assert.equal(result.channels[0].id, 'exa')
		assert.ok(result.sources.length > 0)
		assert.equal(result.sources.some((source) => source.url.includes('csdn.example')), false)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('auto mode skips per-search billed model channels', async () => {
	const { settings, dir } = await store()
	try {
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: fakeFetch().fetch })
		await search.save({ id: 'openai', enabled: true, apiKey: 'sk-openai' })
		await search.save({ id: 'exa', enabled: true, apiKey: 'exa-key' })
		await search.saveMode({ mode: 'auto' })
		const result = await search.search({ query: 'deep learning' })
		assert.equal(result.channels[0].id, 'exa')
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('auto mode routes by language and stops at the first usable channel', async () => {
	const { settings, dir } = await store()
	try {
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: fakeFetch().fetch })
		await search.save({ id: 'exa', enabled: true, apiKey: 'exa-key' })
		await search.save({ id: 'tavily', enabled: true, apiKey: 'tavily-key' })
		await search.saveMode({ mode: 'auto' })
		const result = await search.search({ query: 'deep learning' })
		assert.equal(result.mode, 'auto')
		assert.deepEqual(result.route, { language: 'en', intent: 'general' })
		// exa is first for English and returns sources, so tavily is not called.
		assert.equal(result.channels.length, 1)
		assert.equal(result.channels[0].id, 'exa')
		assert.ok(result.sources.length > 0)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('a second key takes over after an auth failure', async () => {
	const { settings, dir } = await store()
	try {
		const calls = []
		const fetchImpl = async (url, init) => {
			const target = String(url)
			const auth = String(init?.headers?.authorization ?? '')
			calls.push({ url: target, auth })
			if (target.includes('api.tavily.com')) {
				if (auth.includes('k1')) return new Response('denied', { status: 401 })
				return jsonResponse({ results: [{ url: 'https://ok.example/1', title: 'OK', content: 'ok' }] })
			}
			return jsonResponse({ results: [] })
		}
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl })
		await search.save({ id: 'tavily', enabled: true, apiKey: 'k1,k2' })
		const result = await search.search({ query: 'hello' })
		assert.equal(result.channels[0].ok, true)
		assert.equal(result.channels[0].count, 1)
		assert.equal(calls.length, 2)
		assert.match(calls[0].auth, /k1/)
		assert.match(calls[1].auth, /k2/)
		const tavily = (await search.describe()).channels.find((channel) => channel.id === 'tavily')
		assert.equal(tavily.keyCount, 2)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('cooldowns survive a manager restart and can be cleared', async () => {
	const { settings, dir } = await store()
	try {
		const denied = async () => new Response('denied', { status: 401 })
		const first = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: denied, persistCooldowns: true })
		await first.save({ id: 'tavily', enabled: true, apiKey: 'bad' })
		const attempt = await first.search({ query: 'hello' })
		assert.equal(attempt.channels[0].ok, false)
		assert.equal(attempt.channels[0].error.code, 'auth')
		await first.dispose()
		assert.ok(settings.get().search.cooldowns.tavily.until > Date.now())

		const second = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl: denied, persistCooldowns: true })
		const status = await second.describe()
		assert.ok(status.cooldowns.tavily > 0)
		const cooled = await second.search({ query: 'hello' })
		assert.equal(cooled.allCooling, true)

		const cleared = await second.clearCooldowns()
		assert.deepEqual(cleared.cooldowns, {})
		assert.deepEqual(settings.get().search.cooldowns, {})
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('testAll reports every enabled channel and its failure code', async () => {
	const { settings, dir } = await store()
	try {
		const fetchImpl = async (url) => {
			if (String(url).includes('api.tavily.com')) return new Response('denied', { status: 401 })
			return jsonResponse({
				results: [{ url: 'https://exa.example/1', title: 'Exa 1', highlights: ['exa snippet'] }],
			})
		}
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl })
		await search.save({ id: 'exa', enabled: true, apiKey: 'exa-key' })
		await search.save({ id: 'tavily', enabled: true, apiKey: 'tavily-key' })
		const all = await search.testAll({})
		assert.equal(all.total, 2)
		assert.equal(all.ok, 1)
		assert.equal(all.failed, 1)
		const tavily = all.results.find((entry) => entry.id === 'tavily')
		assert.equal(tavily.ok, false)
		assert.equal(tavily.failure.code, 'auth')
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('safe search is persisted and invalidates the result cache', async () => {
	const { settings, dir } = await store()
	try {
		let calls = 0
		const fetchImpl = async (url) => {
			calls += 1
			if (String(url).includes('api.tavily.com')) {
				return jsonResponse({ results: [{ url: 'https://tavily.example/1', title: 'Tavily 1', content: 'snippet' }] })
			}
			return jsonResponse({ results: [] })
		}
		const search = createSearchManager({ settings, credentials: fakeCredentials(), fetchImpl })
		await search.save({ id: 'tavily', enabled: true, apiKey: 'tavily-key' })
		await search.search({ query: 'hello' })
		const first = calls
		await search.search({ query: 'hello' })
		assert.equal(calls, first) // served from the cache
		const saved = await search.saveSafeSearch({ safeSearch: false })
		assert.equal(saved.safeSearch, false)
		assert.equal(settings.get().search.safeSearch, false)
		await search.search({ query: 'hello' })
		assert.ok(calls > first)
		await assert.rejects(search.saveSafeSearch({ safeSearch: 'no' }), /布尔值/)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})


test('keys split on commas, semicolons and newlines', () => {
	assert.deepEqual(splitSearchKeys(' a, b\nc;;a '), ['a', 'b', 'c'])
	assert.deepEqual(splitSearchKeys(''), [])
	assert.equal(splitSearchKeys('k1 k2 k3 k4 k5 k6').length, 5)
})
