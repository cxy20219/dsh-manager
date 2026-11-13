import assert from 'node:assert/strict'
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
