import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createCacheSearchTool, createResearchTool } from '../src/agent-search.js'
import { createResearchService } from '../src/research.js'

/**
 * Public DNS answer for tests.
 *
 * @returns {Promise<Array<{address: string}>>} Addresses.
 */
async function publicResolve() {
	return [{ address: '93.184.216.34' }]
}

/**
 * Fake manager search.
 *
 * @returns {object} Search service.
 */
function fakeSearch() {
	return {
		async search({ query }) {
			return {
				sources: [
					{ url: 'https://example.com/1', title: `Result for ${query}`, snippet: 'hello world snippet' },
					{ url: 'https://example.org/2', title: 'Second result', snippet: 'another snippet', publishedAt: '2026-01-01' },
				],
			}
		},
	}
}

test('research merges queries, fetches bodies and reports quality', async () => {
	const service = createResearchService({
		search: fakeSearch(),
		resolveHost: publicResolve,
		fetchImpl: async () => new Response('<html><head><title>Page One</title></head><body><p>Hello research body.</p></body></html>', {
			status: 200,
			headers: { 'content-type': 'text/html' },
		}),
	})
	const result = await service.run({ question: 'what is dsh', depth: 1 })
	assert.equal(result.queries.length, 1)
	assert.equal(result.sources.length, 2)
	assert.equal(result.documents.length, 2)
	assert.equal(result.documents[0].title, 'Page One')
	assert.match(result.documents[0].text, /Hello research body/)
	assert.equal(result.quality.level, 'low')
	assert.equal(result.quality.fetched, 2)
	const hits = service.cacheSearch({ query: 'research', limit: 5 })
	assert.equal(hits.hits.length, 2)
	assert.match(hits.hits[0].excerpt, /Hello research body/)
})

test('research uses an injected quality fetcher when provided', async () => {
	const service = createResearchService({
		search: {
			async search() {
				return { sources: [{ url: 'https://example.com/q', title: 'Q', snippet: 's' }] }
			},
		},
		fetchPage: async () => ({
			url: 'https://example.com/q',
			statusCode: 200,
			body: { kind: 'html', content: '<title>Quality Page</title><p>quality body</p>' },
			truncated: false,
		}),
	})
	const result = await service.run({ question: 'quality', depth: 1 })
	assert.equal(result.documents[0].kind, 'body')
	assert.equal(result.documents[0].title, 'Quality Page')
	assert.match(result.documents[0].text, /quality body/)
})

test('research cache persists across service instances', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'dsh-research-cache-'))
	const cachePath = join(dir, 'research-cache.json')
	try {
		const first = createResearchService({
			search: fakeSearch(),
			resolveHost: publicResolve,
			fetchImpl: async () => new Response('<title>Persisted</title><p>persisted body</p>', { status: 200, headers: { 'content-type': 'text/html' } }),
			cachePath,
		})
		await first.run({ question: 'persist', depth: 1 })
		await first.flush()
		const second = createResearchService({ search: fakeSearch(), cachePath })
		const hits = second.cacheSearch({ query: 'persisted', limit: 5 })
		assert.equal(hits.hits.length, 2)
		assert.match(hits.hits[0].excerpt, /persisted body/)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test('Chinese questions get Chinese query variants and one site is capped', async () => {
	const service = createResearchService({
		search: {
			async search() {
				return {
					sources: [
						{ url: 'https://a.example.com/1', title: '1', snippet: 's' },
						{ url: 'https://a.example.com/2', title: '2', snippet: 's' },
						{ url: 'https://a.example.com/3', title: '3', snippet: 's' },
						{ url: 'https://a.example.com/4', title: '4', snippet: 's' },
						{ url: 'https://b.example.org/1', title: '5', snippet: 's' },
					],
				}
			},
		},
		fetchPage: async (url) => ({ url, statusCode: 200, body: { kind: 'text', content: 'body' }, truncated: false }),
	})
	const result = await service.run({ question: '深度求索', depth: 2 })
	assert.deepEqual(result.queries.slice(0, 2), ['深度求索', '深度求索 最新'])
	assert.equal(result.sources.length, 4)
	assert.equal(result.sources.filter((source) => source.url.includes('a.example.com')).length, 3)
})

test('research records fetch failures and refuses private addresses', async () => {
	const service = createResearchService({
		search: {
			async search() {
				return { sources: [{ url: 'http://127.0.0.1/admin', title: 'private', snippet: 'nope' }] }
			},
		},
		resolveHost: publicResolve,
		fetchImpl: async () => { throw new Error('must not be called') },
	})
	const result = await service.run({ question: 'private', depth: 1 })
	assert.equal(result.documents[0].kind, 'snippet-only')
	assert.equal(result.documents[0].text, '')
	assert.ok(result.notes.some((note) => /private IPs/.test(note)))
})

test('research tools render results and read the cache', async () => {
	const service = createResearchService({
		search: fakeSearch(),
		resolveHost: publicResolve,
		fetchImpl: async () => new Response('<title>Cached Page</title><p>cache body</p>', { status: 200, headers: { 'content-type': 'text/html' } }),
	})
	const researchTool = createResearchTool({ research: service })
	const value = await researchTool.execute({ question: 'dsh', depth: 1 })
	const rendered = researchTool.output.render({}, value)
	assert.match(rendered[0].text, /<untrusted-web-content>/)
	assert.match(rendered[0].text, /Quality:/)
	assert.match(rendered[0].text, /cache body/)
	const cacheTool = createCacheSearchTool({ research: service })
	const hits = await cacheTool.execute({ query: 'cache', limit: 2 })
	assert.equal(hits.hits.length, 2)
	const cacheRendered = cacheTool.output.render({}, hits)
	assert.match(cacheRendered[0].text, /Cached Page/)
})

test('a reranker reorders the fetch window and falls back quietly when it fails', async () => {
	const sources = [
		{ url: 'https://a.example/1', title: 'A', snippet: 's' },
		{ url: 'https://b.example/2', title: 'B', snippet: 's' },
		{ url: 'https://c.example/3', title: 'C', snippet: 's' },
	]
	const service = createResearchService({
		search: { async search() { return { sources } } },
		fetchPage: async (url) => ({ url, statusCode: 200, body: { kind: 'text', content: `body ${url}` }, truncated: false }),
		rerank: async () => [0, 9, 1],
	})
	const result = await service.run({ question: 'zzz', depth: 1 })
	assert.equal(result.documents[0].url, 'https://b.example/2')

	const failing = createResearchService({
		search: { async search() { return { sources } } },
		fetchPage: async (url) => ({ url, statusCode: 200, body: { kind: 'text', content: `body ${url}` }, truncated: false }),
		rerank: async () => { throw new Error('rerank down') },
	})
	const fallback = await failing.run({ question: 'zzz', depth: 1 })
	assert.ok(fallback.notes.some((note) => note.startsWith('rerank:')))
	assert.equal(fallback.documents.length, 3)
})

test('a thin first pass escalates to two more pages', async () => {
	const fetched = []
	const sources = [
		{ url: 'https://a.example/1', title: 'A', snippet: 's' },
		{ url: 'https://a.example/2', title: 'B', snippet: 's' },
		{ url: 'https://b.example/3', title: 'C', snippet: 's' },
		{ url: 'https://b.example/4', title: 'D', snippet: 's' },
	]
	const service = createResearchService({
		search: { async search() { return { sources } } },
		fetchPage: async (url) => {
			fetched.push(url)
			return { url, statusCode: 200, body: { kind: 'text', content: `body ${url}` }, truncated: false }
		},
	})
	const result = await service.run({ question: 'anything', depth: 1 })
	assert.equal(fetched.length, 4)
	assert.equal(result.documents.length, 4)
	assert.ok(result.notes.some((note) => note.startsWith('escalated:')))
})

test('an exhausted budget is reported and caps the evidence level', async () => {
	const service = createResearchService({
		search: fakeSearch(),
		fetchPage: async (url) => ({ url, statusCode: 200, body: { kind: 'text', content: 'body' }, truncated: false }),
		budgetMs: 0,
	})
	const result = await service.run({ question: 'too slow', depth: 2 })
	assert.ok(result.notes.some((note) => /budget exhausted/.test(note)))
	assert.equal(result.quality.level, 'low')
	assert.equal(result.quality.degraded, true)
	assert.equal(result.budgetMs, 0)
})
