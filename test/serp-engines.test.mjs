import assert from 'node:assert/strict'
import test from 'node:test'

import { SERP_ENGINE_BY_ID, parseBaidu, parseSo360, parseSogou, searchSerp } from '../src/serp-engines.js'

/** Run one engine against a fake fetch. */
async function run(id, html, { status = 200, timeRange = '', baseUrl = '' } = {}) {
	const calls = []
	const result = await searchSerp(SERP_ENGINE_BY_ID.get(id), {
		query: '深度求索',
		maxResults: 5,
		timeRange,
		baseUrl,
		signal: AbortSignal.timeout(5000),
		fetchImpl: async (url) => {
			calls.push(String(url))
			return new Response(html, { status, headers: { 'content-type': 'text/html' } })
		},
	})
	return { result, calls }
}

test('Baidu results prefer the mu target over the redirect href', async () => {
	const html = `<div class="result c-container"><h3><a href="https://www.baidu.com/link?url=abc">深度求索官网</a></h3><div class="content-right_8Zs40">深度求索是……</div></div>`
	const sources = parseBaidu(html, 5)
	assert.equal(sources.length, 1)
	assert.equal(sources[0].url, 'https://www.baidu.com/link?url=abc')
	assert.equal(sources[0].title, '深度求索官网')
	assert.match(sources[0].snippet, /深度求索是/)
	// When `mu` is present it wins: it is the real target behind the redirect.
	const withMu = parseBaidu('<div class="result"><h3><a href="/link?url=x">标题</a></h3><span mu="https://example.com/a"></span></div>', 5)
	assert.equal(withMu[0].url, 'https://example.com/a')
})

test('360 and Sogou parse their result lists', () => {
	const so = parseSo360('<li class="res-list"><h3><a href="https://example.com/1">标题一</a></h3><p class="res-desc">摘要一</p></li>', 5)
	assert.deepEqual(so, [{ url: 'https://example.com/1', title: '标题一', snippet: '摘要一' }])
	const sogou = parseSogou('<div class="vrwrap"><h3><a href="/link?url=xyz">标题二</a></h3></div>', 5)
	assert.equal(sogou.length, 1)
	assert.match(sogou[0].url, /^https:\/\/www\.sogou\.com\/link\?url=/)
})

test('an anti-bot page is classified as bot-wall', async () => {
	await assert.rejects(run('so360', '<html><body>访问异常，请完成安全验证</body></html>'), /安全验证/)
})

test('a mirror base URL swaps the origin and a time filter is appended', async () => {
	const { calls } = await run('sogou', '<html></html>', { timeRange: 'week', baseUrl: 'https://mirror.example' })
	assert.match(calls[0], /^https:\/\/mirror\.example\/web\?query=/)
	assert.match(calls[0], /qft=/)
})

test('an empty parse falls back to generic anchors', async () => {
	const html = '<a href="https://example.com/a">Example result</a><a href="https://www.baidu.com/x">百度一下</a>'
	const { result } = await run('baidu-html', html)
	assert.equal(result.sources.length, 1)
	assert.equal(result.sources[0].url, 'https://example.com/a')
})
