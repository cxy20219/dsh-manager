import assert from 'node:assert/strict'
import test from 'node:test'

import { createVideoSearchTool } from '../src/agent-search.js'
import { searchVideo } from '../src/video-search.js'

test('Bing video results are parsed from the async fragment', async () => {
	const meta = { murl: 'https://cdn.example/video.mp4', vt: 'A video', du: '03:20', vd: 'HD' }
	const attr = JSON.stringify(meta).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
	const html = `<div class="vrhdata" vrhm="${attr}"></div>`
	const result = await searchVideo({ query: 'dsh', source: 'bing', fetchImpl: async () => new Response(html, { status: 200 }) })
	assert.equal(result.provider, 'bing')
	assert.equal(result.sources[0].url, 'https://cdn.example/video.mp4')
	assert.equal(result.sources[0].title, 'A video')
	assert.match(result.sources[0].snippet, /03:20/)
})

test('DuckDuckGo video results use the vqd token and content URL', async () => {
	let calls = 0
	const result = await searchVideo({
		query: 'dsh',
		source: 'ddg',
		fetchImpl: async () => {
			calls += 1
			if (calls === 1) return new Response('vqd="123-456"', { status: 200 })
			return new Response('{"results":[{"title":"DDG video","content":"https://example.com/v","uploader":"u","duration":"1:00"}]}', { status: 200 })
		},
	})
	assert.equal(result.provider, 'ddg')
	assert.equal(result.sources[0].url, 'https://example.com/v')
	assert.equal(result.sources[0].title, 'DDG video')
})

test('video_search tool renders results and accepts injected search', async () => {
	const tool = createVideoSearchTool({
		search: async ({ query, source }) => ({ provider: source || 'video', sources: [{ url: 'https://example.com/v', title: query }], truncated: false }),
	})
	const value = await tool.execute({ query: 'dsh', source: 'bing' })
	assert.equal(value.provider, 'bing')
	const rendered = tool.output.render({}, value)
	assert.match(rendered[0].text, /<untrusted-web-content>/)
	assert.match(rendered[0].text, /dsh/)
})
