import assert from 'node:assert/strict'
import test from 'node:test'

import { createDomainSearchTool } from '../src/agent-search.js'
import { ENGINES, searchDomain } from '../src/domain-search.js'

test('the domain registry exposes the vertical sources', () => {
	assert.ok(Object.keys(ENGINES).includes('pypi'))
	assert.ok(Object.keys(ENGINES).includes('arxiv'))
	assert.ok(Object.keys(ENGINES).includes('nvd'))
	assert.ok(Object.keys(ENGINES).includes('worldbank'))
})

test('an unknown domain engine returns a useful error', async () => {
	const result = await searchDomain({ engine: 'nope', query: 'x' })
	assert.equal(result.engine, 'nope')
	assert.match(result.error, /unknown engine/)
})

test('PyPI search parses the package version and summary', async () => {
	const original = globalThis.fetch
	globalThis.fetch = async (url) => {
		assert.match(String(url), /^https:\/\/pypi\.org\/pypi\/requests\/json$/)
		return new Response(JSON.stringify({ info: { version: '2.32.0', summary: 'HTTP for Humans', requires_python: '>=3.8' } }), { status: 200 })
	}
	try {
		const result = await searchDomain({ engine: 'pypi', query: 'requests' })
		assert.equal(result.sources.length, 1)
		assert.equal(result.sources[0].url, 'https://pypi.org/project/requests')
		assert.match(result.sources[0].title, /2\.32\.0/)
		assert.match(result.sources[0].snippet, /HTTP for Humans/)
	} finally {
		globalThis.fetch = original
	}
})

test('domain_search renders errors and sources inside the untrusted boundary', () => {
	const tool = createDomainSearchTool({
		search: async ({ engine }) => engine === 'fail'
			? { engine, query: 'x', sources: [], error: 'boom' }
			: { engine, query: 'x', sources: [{ url: 'https://example.com/1', title: 'Result', snippet: 'text' }] },
	})
	const failed = tool.output.render({}, { engine: 'fail', query: 'x', sources: [], error: 'boom' })
	assert.match(failed[0].text, /boom/)
	const ok = tool.output.render({}, { engine: 'pypi', query: 'x', sources: [{ url: 'https://example.com/1', title: 'Result', snippet: 'text' }] })
	assert.match(ok[0].text, /<untrusted-web-content>/)
	assert.match(ok[0].text, /Result/)
})
