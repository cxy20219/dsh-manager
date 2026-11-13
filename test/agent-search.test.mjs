import assert from 'node:assert/strict'
import test from 'node:test'

import {
	createAdvancedSearchTool,
	createMultiSearchTool,
	createFreeSearchTestTool,
	createResearchTool,
	createWebSearchProvider,
	createWebSearchTool,
	registerAgentSearch,
	toProviderResult,
	WEB_SEARCH_PROVIDER_ID,
} from '../src/agent-search.js'

/**
 * A search manager stand-in.
 *
 * @returns {object} Fake manager.
 */
function fakeSearch() {
	const calls = []
	return {
		calls,
		async search(input) {
			calls.push(input)
			return {
				query: input.query,
				mode: 'merge',
				cached: false,
				sources: [
					{ url: 'https://example.com/1', title: 'One', snippet: 'first', channel: 'bing', channelLabel: 'Bing' },
					{ url: 'https://example.com/2', title: 'Two', snippet: 'second', publishedAt: '2026-01-01' },
				],
				content: 'answer',
			}
		},
		async describe() {
			return {
				channels: [
					{ id: 'bing', label: 'Bing', enabled: true },
					{ id: 'exa', label: 'Exa', enabled: true },
				],
			}
		},
		async test({ id }) {
			if (id === 'exa') return { ok: false, count: 0, failure: { code: 'auth', message: 'bad key' } }
			return { ok: true, count: 2, sources: [] }
		},
	}
}

test('the provider maps a manager result to the web seam shape', async () => {
	const search = fakeSearch()
	const provider = createWebSearchProvider({ search })
	assert.equal(provider.id, WEB_SEARCH_PROVIDER_ID)
	assert.equal(provider.available(), true)
	const result = await provider.search({ query: 'hello', maxResults: 1 })
	assert.equal(result.provider, WEB_SEARCH_PROVIDER_ID)
	assert.equal(result.content, 'answer')
	assert.deepEqual(result.sources, [{ url: 'https://example.com/1', title: 'One', snippet: 'first' }])
	assert.equal(result.truncated, true)
	assert.deepEqual(search.calls, [{ query: 'hello', maxResults: 1 }])
})

test('toProviderResult drops empty and non-http fields and caps sources', () => {
	const result = toProviderResult({
		content: ' note ',
		sources: [
			{ url: 'https://a.example/1', title: ' A ', snippet: ' s ' },
			{ url: '', title: 'empty' },
			{ url: 'https://a.example/2', publishedAt: ' 2026 ' },
		],
	}, 2)
	assert.equal(result.content, 'note')
	assert.deepEqual(result.sources, [
		{ url: 'https://a.example/1', title: 'A', snippet: 's' },
		{ url: 'https://a.example/2', publishedAt: '2026' },
	])
	assert.equal(result.truncated, true)
})

test('the web_search tool merges queries, deduplicates and wraps untrusted text', async () => {
	const search = fakeSearch()
	const tool = createWebSearchTool({ search })
	assert.equal(tool.name, 'web_search')
	assert.equal(tool.parameters.type, 'object')
	const value = await tool.execute({ queries: ['one', 'two'] })
	assert.equal(value.sources.length, 2) // the fake returns the same two URLs for both queries
	assert.equal(value.truncated, false)
	const rendered = tool.output.render({}, value)
	assert.equal(rendered[0].type, 'text')
	assert.match(rendered[0].text, /<untrusted-web-content>/)
	assert.match(rendered[0].text, /One/)
	assert.match(rendered[0].text, /https:\/\/example\.com\/1/)
	assert.equal(search.calls.length, 2)
})

test('advanced_search passes the time filter and returns only schema fields', async () => {
	const search = fakeSearch()
	const tool = createAdvancedSearchTool({ search })
	assert.equal(tool.name, 'advanced_search')
	const value = await tool.execute({ query: 'news', maxResults: 5, timeRange: 'week' })
	assert.deepEqual(search.calls.at(-1), { query: 'news', maxResults: 5, timeRange: 'week' })
	assert.deepEqual(Object.keys(value).sort(), ['content', 'sources', 'truncated'])
	assert.equal(value.sources[0].url, 'https://example.com/1')
})

test('multi_search forwards the selected channels', async () => {
	const search = fakeSearch()
	const tool = createMultiSearchTool({ search })
	const value = await tool.execute({ query: 'hello', maxResults: 2, engines: ['bing', 'exa'] })
	assert.deepEqual(search.calls.at(-1), { query: 'hello', maxResults: 2, channels: ['bing', 'exa'] })
	assert.equal(value.sources.length, 2)
	assert.equal(value.truncated, true)
})

test('free_search_test reports each channel and honours the engine filter', async () => {
	const search = fakeSearch()
	const tool = createFreeSearchTestTool({ search })
	const value = await tool.execute({ engines: ['exa', 'bing'], query: 'hello' })
	assert.deepEqual(value.results, [
		{ id: 'bing', label: 'Bing', ok: true, count: 2 },
		{ id: 'exa', label: 'Exa', ok: false, count: 0, error: 'bad key' },
	])
	const rendered = tool.output.render({}, value)
	assert.match(rendered[0].text, /Bing: OK/)
	assert.match(rendered[0].text, /Exa: FAIL/)
})

test('registerAgentSearch registers the provider, tools and provider takeover', async () => {
	const registered = { providers: [], fetchProviders: [], tools: [], mutations: [] }
	const web = {
		config: { searchProvider: { get: () => 'deepseek-search-api' } },
		fetchProviderId: 'fs-quality-fetch',
		registerSearchProvider(provider) {
			registered.providers.push(provider)
			return () => {}
		},
		registerFetchProvider(provider) {
			registered.fetchProviders.push(provider)
			return () => {}
		},
	}
	const settings = {
		async mutate(namespace, ops) {
			registered.mutations.push({ namespace, ops })
			for (const op of ops) {
				if (op.path[0] === 'searchProvider') web.config.searchProvider = { get: () => op.value }
				if (op.path[0] === 'fetchProvider') web.fetchProviderId = op.value
			}
		},
	}
	const tools = {
		register(tool) {
			registered.tools.push(tool)
			return () => {}
		},
	}
	const sctx = {
		get(name) {
			if (name === 'web') return web
			if (name === 'settings') return settings
			if (name === 'tools') return tools
			return undefined
		},
		effect(fn) {
			const dispose = fn()
			return () => { if (typeof dispose === 'function') dispose() }
		},
	}
	const ctx = {
		inject(names, callback) {
			if (names.includes('web') && !names.includes('settings')) {
				callback(sctx)
				return
			}
			if (names.includes('web') && names.includes('settings')) {
				callback(sctx)
				return
			}
			if (names.includes('tools')) callback(sctx)
		},
	}
	registerAgentSearch({ ctx, search: fakeSearch() })
	await new Promise((resolve) => setTimeout(resolve, 0))
	assert.equal(registered.providers.length, 1)
	assert.equal(registered.providers[0].id, WEB_SEARCH_PROVIDER_ID)
	assert.equal(registered.fetchProviders.length, 1)
	assert.equal(registered.fetchProviders[0].id, 'dsh-manager-fetch')
	assert.deepEqual(registered.tools.map((tool) => tool.name), ['web_search', 'advanced_search', 'multi_search', 'platform_search', 'domain_search', 'weather', 'video_search', 'research', 'cache_search', 'free_search_test'])
	assert.deepEqual(registered.mutations, [{
		namespace: 'web',
		ops: [
			{ op: 'set', path: ['searchProvider'], value: WEB_SEARCH_PROVIDER_ID },
			{ op: 'set', path: ['fetchProvider'], value: 'dsh-manager-fetch' },
		],
	}])

	// Tool factories must not all receive the manager search object: platform and
	// domain have their own search functions. Unknown ids prove the wiring.
	const byName = new Map(registered.tools.map((tool) => [tool.name, tool]))
	await assert.rejects(byName.get('platform_search').execute({ platform: 'nope', query: 'x' }), /unknown platform/)
	const domain = await byName.get('domain_search').execute({ engine: 'nope', query: 'x' })
	assert.match(domain.error, /unknown engine/)
})

test('a tool value never carries a lone surrogate', async () => {
	const search = {
		async search() {
			return {
				sources: [{ url: 'https://a.example/1', title: 'bad \ud83d title', snippet: 'x \udc00' }],
				content: '',
			}
		},
	}
	const tool = createWebSearchTool({ search })
	const value = await tool.execute({ queries: ['x'] })
	assert.equal(value.sources[0].title.includes('\ud83d'), false)
	assert.equal(value.sources[0].snippet.includes('\udc00'), false)
	assert.match(value.sources[0].title, /\uFFFD/)
})

/**
 * Walk a value against a JSON Schema and fail on undeclared fields.
 *
 * The Host validates tool output strictly, so a field the service adds without
 * a schema entry makes every call fail at runtime. This catches that drift.
 *
 * @param {object} schema - JSON Schema.
 * @param {unknown} value - Tool value.
 * @param {string} [path] - Where the walker is.
 * @returns {void}
 */
function assertSchemaAllows(schema, value, path = 'value') {
	if (value === null || typeof value !== 'object') return
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index += 1) {
			if (schema?.items !== undefined) assertSchemaAllows(schema.items, value[index], `${path}[${index}]`)
		}
		return
	}
	const properties = schema?.properties ?? {}
	for (const [key, item] of Object.entries(value)) {
		assert.ok(properties[key] !== undefined, `${path}.${key} is not declared in the tool schema`)
		assertSchemaAllows(properties[key], item, `${path}.${key}`)
	}
}

test('the research tool schema declares every field the service returns', async () => {
	const { createResearchService } = await import('../src/research.js')
	const research = createResearchService({
		search: {
			async search() {
				return {
					sources: [
						{ url: 'https://example.com/1', title: 'One', snippet: 's' },
						{ url: 'https://example.org/2', title: 'Two', snippet: 's', publishedAt: '2026-01-01' },
					],
				}
			},
		},
		fetchPage: async () => { throw new Error('blocked') },
	})
	const tool = createResearchTool({ research })
	const value = await tool.execute({ question: 'schema drift', depth: 1 })
	assertSchemaAllows(tool.output.schema, value)
	assert.equal(value.quality.failed, 2)
	assert.equal(value.quality.degraded, true)
})
