import assert from 'node:assert/strict'
import test from 'node:test'

import { createAgentFetchProvider, FETCH_PROVIDER_ID } from '../src/agent-fetch.js'

/**
 * Public DNS answer for tests.
 *
 * @returns {Promise<Array<{address: string}>>} Addresses.
 */
async function publicResolve() {
	return [{ address: '93.184.216.34' }]
}

test('the quality fetch provider returns direct HTML', async () => {
	const provider = createAgentFetchProvider({
		search: { async resolveKey() { return '' } },
		resolveHost: publicResolve,
		fetchImpl: async () => new Response(`<html><body>${'x'.repeat(400)}</body></html>`, {
			status: 200,
			headers: { 'content-type': 'text/html' },
		}),
	})
	assert.equal(provider.id, FETCH_PROVIDER_ID)
	assert.equal(provider.available(), true)
	const result = await provider.fetch({ url: 'https://example.com/page' })
	assert.equal(result.statusCode, 200)
	assert.equal(result.body.kind, 'html')
	assert.match(result.body.content, /xxx/)
	assert.equal(result.truncated, false)
})

test('Exa is used when the direct body is too short and a key exists', async () => {
	const calls = []
	const provider = createAgentFetchProvider({
		search: { async resolveKey(id) { return id === 'exa' ? 'exa-key' : '' } },
		resolveHost: publicResolve,
		fetchImpl: async (url) => {
			calls.push(String(url))
			if (String(url) === 'https://api.exa.ai/contents') {
				return new Response(JSON.stringify({
					statuses: [{ id: 'https://example.com/short', status: 'success' }],
					results: [{ id: 'https://example.com/short', url: 'https://example.com/short', text: 'y'.repeat(400) }],
				}), { status: 200, headers: { 'content-type': 'application/json' } })
			}
			return new Response('tiny', { status: 200, headers: { 'content-type': 'text/html' } })
		},
	})
	const result = await provider.fetch({ url: 'https://example.com/short' })
	assert.equal(result.body.kind, 'text')
	assert.match(result.body.content, /yyy/)
	assert.deepEqual(calls, ['https://example.com/short', 'https://api.exa.ai/contents'])
})

test('Firecrawl is used when Exa has no key', async () => {
	const provider = createAgentFetchProvider({
		search: { async resolveKey(id) { return id === 'firecrawl' ? 'fc-key' : '' } },
		resolveHost: publicResolve,
		fetchImpl: async (url) => {
			if (String(url) === 'https://api.firecrawl.dev/v2/scrape') {
				return new Response(JSON.stringify({ data: { markdown: 'z'.repeat(400) } }), { status: 200, headers: { 'content-type': 'application/json' } })
			}
			return new Response('tiny', { status: 200, headers: { 'content-type': 'text/html' } })
		},
	})
	const result = await provider.fetch({ url: 'https://example.com/short' })
	assert.equal(result.body.kind, 'text')
	assert.match(result.body.content, /zzz/)
})

test('private URLs and redirects to private hosts are rejected', async () => {
	const provider = createAgentFetchProvider({
		search: { async resolveKey() { return '' } },
		resolveHost: publicResolve,
		fetchImpl: async () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1/admin' } }),
	})
	await assert.rejects(provider.fetch({ url: 'http://127.0.0.1/admin' }), /private IPs/)
	await assert.rejects(provider.fetch({ url: 'https://example.com/redirect' }), /private IPs/)
})

test('a capped body is cut on a code-point boundary', async () => {
	const body = `${'a'.repeat(199_999)}😀b`
	const provider = createAgentFetchProvider({
		search: { async resolveKey() { return '' } },
		resolveHost: publicResolve,
		fetchImpl: async () => new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } }),
	})
	const result = await provider.fetch({ url: 'https://example.com/big' })
	assert.equal(result.truncated, true)
	assert.equal(result.body.content.endsWith('😀'), true)
	assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(result.body.content), false)
})
