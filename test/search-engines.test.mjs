import assert from 'node:assert/strict'
import test from 'node:test'

import { SEARCH_CHANNEL_BY_ID } from '../src/search-providers.js'

/**
 * Run one keyed channel against a recording fetch.
 *
 * @param {string} id - Channel id.
 * @param {Function} handler - Fetch handler.
 * @param {object} [overrides] - Channel options.
 * @returns {Promise<{result: object, calls: object[]}>} Outcome and calls.
 */
async function run(id, handler, overrides = {}) {
	const channel = SEARCH_CHANNEL_BY_ID.get(id)
	const calls = []
	const result = await channel.search({
		query: 'hello world',
		maxResults: 5,
		apiKey: 'test-key',
		baseUrl: '',
		safeSearch: true,
		signal: AbortSignal.timeout(5000),
		fetchImpl: async (url, init) => {
			calls.push({ url: String(url), init })
			return handler(String(url), init)
		},
		...overrides,
	})
	return { result, calls }
}

/** JSON response. */
function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('Baidu Qianfan maps references and falls back to the chat endpoint', async () => {
	const calls = []
	const { result } = await run('baidu', async (url) => {
		calls.push(url)
		if (url.endsWith('/v2/ai_search/web_search')) return json({}, 429)
		return json({ references: [{ url: 'https://a.example/1', title: 'A', content: 'snippet', date: '2026-01-01' }] })
	}, { timeRange: 'week' })
	assert.equal(calls.length, 2)
	assert.ok(calls[1].endsWith('/v2/ai_search/chat/completions'))
	assert.deepEqual(result.sources, [{ url: 'https://a.example/1', title: 'A', snippet: 'snippet', publishedAt: '2026-01-01' }])
})

test('Kimi joins chunk text into a snippet', async () => {
	const { result } = await run('kimi', async () => json({
		search_results: [{ url: 'https://a.example/1', title: 'A', chunks: [{ text: 'one' }, { text: 'two' }] }],
	}))
	assert.equal(result.sources[0].snippet, 'one two')
})

test('Perplexity returns citations plus the answer', async () => {
	const { result } = await run('perplexity', async () => json({
		choices: [{ message: { content: 'answer text' } }],
		citations: ['https://a.example/1'],
	}))
	assert.equal(result.content, 'answer text')
	assert.equal(result.sources[0].url, 'https://a.example/1')
})

test('Metaso maps webpages', async () => {
	const { result } = await run('metaso', async () => json({
		webpages: [{ link: 'https://a.example/1', title: 'A', summary: 'S', date: '2026-02-03' }],
	}))
	assert.deepEqual(result.sources, [{ url: 'https://a.example/1', title: 'A', snippet: 'S', publishedAt: '2026-02-03' }])
})

test('Google CSE splits KEY:CX and honours safe search and time', async () => {
	const { result, calls } = await run('google', async () => json({
		items: [{ link: 'https://a.example/1', title: 'A', snippet: 'S' }],
	}), { apiKey: 'g-key:cx-1', timeRange: 'week', safeSearch: true })
	const url = new URL(calls[0].url)
	assert.equal(url.searchParams.get('key'), 'g-key')
	assert.equal(url.searchParams.get('cx'), 'cx-1')
	assert.equal(url.searchParams.get('safe'), 'active')
	assert.equal(url.searchParams.get('dateRestrict'), 'd7')
	assert.equal(result.sources[0].url, 'https://a.example/1')
	await assert.rejects(run('google', async () => json({}), { apiKey: 'no-colon' }), /API_KEY:CX/)
})

test('Yandex decodes base64 XML into documents', async () => {
	const xml = '<yandex><doc><url>https://a.example/1</url><title>Hello</title><passage>snippet</passage><modtime>20260102T000000</modtime></doc></yandex>'
	const { result } = await run('yandex', async () => json({ rawData: Buffer.from(xml).toString('base64') }), { apiKey: 'y-key:folder-1' })
	assert.deepEqual(result.sources, [{ url: 'https://a.example/1', title: 'Hello', snippet: 'snippet', publishedAt: '2026-01-02' }])
	await assert.rejects(run('yandex', async () => json({}), { apiKey: 'y-key' }), /FOLDER_ID/)
})

test('Aliyun unwraps the MCP envelope', async () => {
	const { result } = await run('aliyun', async () => json({
		result: { content: [{ type: 'text', text: JSON.stringify({ pages: [{ url: 'https://a.example/1', title: 'A', snippet: 'S' }] }) }] },
	}))
	assert.equal(result.sources[0].title, 'A')
})

test('Doubao surfaces the metadata error envelope', async () => {
	const { result } = await run('doubao', async () => json({
		Result: { WebResults: [{ Url: 'https://a.example/1', Title: 'A', Summary: 'S', PublishTime: '2026-01-01' }] },
	}))
	assert.equal(result.sources[0].url, 'https://a.example/1')
	await assert.rejects(run('doubao', async () => json({ ResponseMetadata: { Error: { Code: '700901', Message: 'invalid api key' } } })), /invalid api key/)
})

test('Yuanbao parses JSON-string pages', async () => {
	const { result } = await run('yuanbao', async () => json({
		Response: { Pages: [JSON.stringify({ url: 'https://a.example/1', title: 'A', passage: 'S' })] },
	}))
	assert.equal(result.sources[0].title, 'A')
})

test('SerpBase rejects a non-zero status', async () => {
	const { result } = await run('serpbase', async () => json({ status: 0, organic: [{ link: 'https://a.example/1', title: 'A' }] }))
	assert.equal(result.sources[0].url, 'https://a.example/1')
	await assert.rejects(run('serpbase', async () => json({ status: 1001 })), /SerpBase/)
})

test('Serply, Outcrawl and TinyFish map their result arrays', async () => {
	const serply = await run('serply', async () => json({ results: [{ link: 'https://a.example/1', title: 'A', description: 'S' }] }))
	assert.equal(serply.result.sources[0].snippet, 'S')
	const outcrawl = await run('outcrawl', async () => json({ hits: [{ url: 'https://b.example/2', title: 'B', snippet: 'S' }] }))
	assert.equal(outcrawl.result.sources[0].url, 'https://b.example/2')
	const tinyfish = await run('tinyfish', async () => json({ results: [{ url: 'https://c.example/3', title: 'C', snippet: 'S' }] }), { timeRange: 'month' })
	assert.match(tinyfish.calls[0].url, /after_date=/)
})

test('DegOog requires a base URL and maps results', async () => {
	await assert.rejects(run('degoog', async () => json({})), /服务地址/)
	const { result, calls } = await run('degoog', async () => json({ results: [{ url: 'https://a.example/1', title: 'A', snippet: 'S' }] }), { baseUrl: 'https://degoog.example' })
	assert.match(calls[0].url, /^https:\/\/degoog\.example\/api\/search\?/)
	assert.equal(result.sources[0].url, 'https://a.example/1')
})

test('OpenAI, Gemini and Claude read citations from their own shapes', async () => {
	const openai = await run('openai', async () => json({
		output: [{ type: 'message', content: [{ type: 'text', text: 'answer', annotations: [{ type: 'url_citation', url: 'https://a.example/1', title: 'A' }] }] }],
	}))
	assert.equal(openai.result.content, 'answer')
	assert.equal(openai.result.sources[0].url, 'https://a.example/1')

	const gemini = await run('gemini', async () => json({
		steps: [{ type: 'model_output', content: [{ type: 'text', text: 'answer', annotations: [{ type: 'url_citation', url: 'https://b.example/2' }] }] }],
	}))
	assert.equal(gemini.result.sources[0].url, 'https://b.example/2')

	const claude = await run('claude', async () => json({
		content: [
			{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://c.example/3', title: 'C' }] },
			{ type: 'text', text: 'answer', citations: [] },
		],
	}))
	assert.equal(claude.result.content, 'answer')
	assert.equal(claude.result.sources[0].url, 'https://c.example/3')
})

test('Zhihu unwraps its MCP tool result', async () => {
	const { result, calls } = await run('zhihu', async () => json({
		result: { content: [{ type: 'text', text: JSON.stringify({ code: 0, data: { items: [{ url: 'https://a.example/1', title: 'A', summary: 'S', edit_time: 1767225600 }] } }) }] },
	}), { timeRange: 'week' })
	assert.equal(result.sources[0].title, 'A')
	assert.equal(result.sources[0].publishedAt, '2026-01-01')
	assert.match(JSON.parse(calls[0].init.body).params.arguments.filter, /publish_time>=/)
})
