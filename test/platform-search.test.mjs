import assert from 'node:assert/strict'
import test from 'node:test'

import { PLATFORM_IDS, PLATFORMS, searchPlatform } from '../src/platform-search.js'
import { createPlatformSearchTool } from '../src/agent-search.js'

/**
 * JSON response.
 *
 * @param {object} body - Body.
 * @returns {Response} Response.
 */
function json(body) {
	return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

test('the platform registry has the expected keyless sites', () => {
	assert.ok(PLATFORM_IDS.includes('github'))
	assert.ok(PLATFORM_IDS.includes('wikipedia'))
	assert.ok(PLATFORM_IDS.includes('youtube'))
	assert.equal(PLATFORMS.github, 'GitHub')
	assert.equal(PLATFORM_IDS.length, 13)
})

test('GitHub search uses the repository API and maps stars', async () => {
	const calls = []
	const fetchImpl = async (url) => {
		calls.push(String(url))
		return json({ items: [{ html_url: 'https://github.com/a/b', full_name: 'a/b', description: 'demo', stargazers_count: 42 }] })
	}
	const result = await searchPlatform({ platform: 'github', query: 'dsh manager', maxResults: 3, fetchImpl })
	assert.match(calls[0], /^https:\/\/api\.github\.com\/search\/repositories\?/)
	assert.match(calls[0], /per_page=3/)
	assert.equal(result.sources[0].url, 'https://github.com/a/b')
	assert.match(result.sources[0].snippet, /42/)
})

test('Wikipedia uses the Chinese host for CJK queries and English otherwise', async () => {
	const hosts = []
	const fetchImpl = async (url) => {
		hosts.push(new URL(String(url)).host)
		return json({ query: { search: [{ title: 'DeepSeek Harness', snippet: '<span>hello</span>' }] } })
	}
	await searchPlatform({ platform: 'wikipedia', query: 'DeepSeek Harness', maxResults: 1, fetchImpl })
	await searchPlatform({ platform: 'wikipedia', query: '深度求索', maxResults: 1, fetchImpl })
	assert.deepEqual(hosts, ['en.wikipedia.org', 'zh.wikipedia.org'])
})

test('an unknown platform is rejected before any request', async () => {
	await assert.rejects(searchPlatform({ platform: 'nope', query: 'x', fetchImpl: async () => { throw new Error('should not run') } }), /unknown platform/)
})

test('platform_search tool renders sources inside the untrusted boundary', async () => {
	const tool = createPlatformSearchTool({
		search: async ({ platform, query, maxResults }) => ({
			platform,
			label: PLATFORMS[platform],
			sources: [{ url: 'https://news.ycombinator.com/item?id=1', title: 'Hello' }],
			truncated: maxResults === 1,
		}),
	})
	const value = await tool.execute({ platform: 'hn', query: 'dsh', maxResults: 2 })
	const rendered = tool.output.render({}, {
		platform: 'hn',
		label: 'Hacker News',
		sources: [{ url: 'https://news.ycombinator.com/item?id=1', title: 'Hello' }],
		truncated: false,
	})
	assert.equal(value.platform, 'hn')
	assert.ok(Array.isArray(value.sources))
	assert.match(rendered[0].text, /<untrusted-web-content>/)
	assert.match(rendered[0].text, /Hacker News/)
	assert.match(rendered[0].text, /news\.ycombinator\.com/)
})
