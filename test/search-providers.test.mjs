import assert from 'node:assert/strict'
import test from 'node:test'

import { SEARCH_CHANNEL_BY_ID, SearchChannelError } from '../src/search-providers.js'

/**
 * Run one channel against a recording fetch.
 *
 * @param {string} id - Channel id.
 * @param {Function} handler - Fetch handler.
 * @param {object} [overrides] - Options to override.
 * @returns {Promise<{result: object, calls: object[]}>} The outcome and calls.
 */
async function runChannel(id, handler, overrides = {}) {
	const channel = SEARCH_CHANNEL_BY_ID.get(id)
	const calls = []
	const fetchImpl = async (url, init) => {
		calls.push({ url: String(url), init })
		return handler(String(url), init)
	}
	const result = await channel.search({
		query: 'hello world',
		maxResults: 5,
		apiKey: 'test-key',
		baseUrl: '',
		signal: AbortSignal.timeout(5000),
		fetchImpl,
		...overrides,
	})
	return { result, calls }
}

/**
 * Build a JSON response.
 *
 * @param {object} body - JSON body.
 * @param {number} [status] - HTTP status.
 * @returns {Response} The response.
 */
function json(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	})
}

test('Exa sends highlights and parses its results', async () => {
	const { result, calls } = await runChannel('exa', async () => json({
		results: [
			{ url: 'https://exa.example/1', title: 'Exa 1', highlights: ['one', 'two'], publishedDate: '2026-01-01' },
		],
	}))
	assert.equal(calls.length, 1)
	assert.equal(calls[0].url, 'https://api.exa.ai/search')
	assert.equal(calls[0].init.method, 'POST')
	assert.equal(calls[0].init.headers['x-api-key'], 'test-key')
	const body = JSON.parse(calls[0].init.body)
	assert.equal(body.query, 'hello world')
	assert.equal(body.numResults, 5)
	assert.deepEqual(body.contents, { highlights: true })
	assert.deepEqual(result.sources, [{
		url: 'https://exa.example/1',
		title: 'Exa 1',
		snippet: 'one\n\ntwo',
		publishedAt: '2026-01-01',
	}])
})

test('Tavily uses bearer auth and the basic search body', async () => {
	const { result, calls } = await runChannel('tavily', async () => json({
		results: [{ url: 'https://tavily.example/1', title: 'T', content: 'snippet' }],
	}))
	assert.equal(calls[0].url, 'https://api.tavily.com/search')
	assert.equal(calls[0].init.headers.authorization, 'Bearer test-key')
	const body = JSON.parse(calls[0].init.body)
	assert.equal(body.max_results, 5)
	assert.equal(body.include_answer, false)
	assert.equal(body.search_depth, 'basic')
	assert.equal(result.sources[0].snippet, 'snippet')
})

test('Firecrawl reads the v2 data envelope', async () => {
	const { result, calls } = await runChannel('firecrawl', async () => json({
		data: { web: [{ url: 'https://fc.example/1', title: 'F', markdown: '# body', publishedDate: '2026-02-02' }] },
	}))
	assert.equal(calls[0].url, 'https://api.firecrawl.dev/v2/search')
	assert.equal(calls[0].init.headers.authorization, 'Bearer test-key')
	assert.deepEqual(JSON.parse(calls[0].init.body), { query: 'hello world', limit: 5 })
	assert.equal(result.sources[0].snippet, '# body')
	assert.equal(result.sources[0].publishedAt, '2026-02-02')
})

test('Parallel sends objective and search_queries and joins excerpts', async () => {
	const { result, calls } = await runChannel('parallel', async () => json({
		results: [{ url: 'https://parallel.example/1', title: 'P', excerpts: ['one', 'two'], publish_date: '2026-03-03' }],
	}))
	assert.equal(calls[0].url, 'https://api.parallel.ai/v1/search')
	assert.equal(calls[0].init.headers['x-api-key'], 'test-key')
	const body = JSON.parse(calls[0].init.body)
	assert.equal(body.objective, 'hello world')
	assert.deepEqual(body.search_queries, ['hello world'])
	assert.equal(body.mode, 'advanced')
	assert.equal(body.advanced_settings.max_results, 5)
	assert.equal(result.sources[0].snippet, 'one\n\ntwo')
	assert.equal(result.sources[0].publishedAt, '2026-03-03')
})

test('Brave falls back from LLM Context to classic Web Search', async () => {
	const { result, calls } = await runChannel('brave', async (url) => {
		if (url.endsWith('/llm/context')) return new Response('forbidden', { status: 403 })
		return json({ web: { results: [{ url: 'https://brave.example/1', title: 'B', description: 'desc', age: '2 days' }] } })
	})
	assert.equal(calls.length, 2)
	assert.equal(calls[0].url, 'https://api.search.brave.com/res/v1/llm/context')
	assert.equal(calls[1].url, 'https://api.search.brave.com/res/v1/web/search?q=hello+world&count=20')
	assert.equal(calls[1].init.headers['x-subscription-token'], 'test-key')
	assert.equal(result.sources[0].snippet, 'desc')
	assert.equal(result.sources[0].publishedAt, '2 days')
})

test('Brave parses grounding.generic when LLM Context is available', async () => {
	const { result, calls } = await runChannel('brave', async () => json({
		grounding: { generic: [{ url: 'https://brave.example/1', title: 'B', snippets: ['one', 'two'] }] },
	}))
	assert.equal(calls.length, 1)
	assert.equal(result.sources[0].snippet, 'one\n\ntwo')
})

test('You.com reads web, news and legacy hits', async () => {
	const { result, calls } = await runChannel('you', async () => json({
		results: {
			web: [{ url: 'https://you.example/1', title: 'Y', contents: { highlights: ['one'] } }],
			news: [{ url: 'https://you.example/2', title: 'Y2', snippets: ['news'] }],
		},
		hits: [{ url: 'https://you.example/3', title: 'Y3', description: 'legacy' }],
	}))
	assert.equal(calls[0].url, 'https://ydc-index.io/v1/search')
	assert.equal(calls[0].init.headers['x-api-key'], 'test-key')
	assert.deepEqual(result.sources.map((source) => source.url), [
		'https://you.example/1',
		'https://you.example/2',
		'https://you.example/3',
	])
	assert.equal(result.sources[0].snippet, 'one')
	assert.equal(result.sources[1].snippet, 'news')
	assert.equal(result.sources[2].snippet, 'legacy')
})

test('Jina puts the query in the path and reads its data envelope', async () => {
	const { result, calls } = await runChannel('jina', async () => json({
		data: [{ url: 'https://jina.example/1', title: 'J', description: 'desc', publishedTime: '2026-04-04' }],
	}))
	assert.equal(calls[0].url, 'https://s.jina.ai/hello%20world?count=5')
	assert.equal(calls[0].init.headers.authorization, 'Bearer test-key')
	assert.equal(result.sources[0].snippet, 'desc')
	assert.equal(result.sources[0].publishedAt, '2026-04-04')
})

test('Keenable sends its headers and prefers description', async () => {
	const { result, calls } = await runChannel('keenable', async () => json({
		results: [{ url: 'https://keen.example/1', title: 'K', description: 'desc', snippet: 'fallback' }],
	}))
	assert.equal(calls[0].url, 'https://api.keenable.ai/v1/search')
	assert.equal(calls[0].init.headers['x-api-key'], 'test-key')
	assert.equal(calls[0].init.headers['x-keenable-title'], 'dsh-manager')
	assert.equal(result.sources[0].snippet, 'desc')
})

test('SearXNG is keyless by default and carries its answer', async () => {
	const { result, calls } = await runChannel('searxng', async () => json({
		results: [{ url: 'https://searx.example/1', title: 'S', content: 'desc' }],
		answer: 'answer text',
	}), { apiKey: '' })
	assert.equal(calls[0].url, 'http://127.0.0.1:8080/search?q=hello+world&format=json&safesearch=0')
	assert.equal(result.sources[0].snippet, 'desc')
	assert.equal(result.content, 'answer text')
})

test('SearXNG supports user:password Basic auth and a bare api_key', async () => {
	const basic = await runChannel('searxng', async () => json({ results: [] }), { apiKey: 'user:pass' })
	assert.equal(basic.calls[0].init.headers.authorization, `Basic ${Buffer.from('user:pass').toString('base64')}`)
	const keyed = await runChannel('searxng', async () => json({ results: [] }), { apiKey: 'abc' })
	assert.match(keyed.calls[0].url, /[?&]api_key=abc(&|$)/)
})

test('MiniMax sends q with bearer auth and parses organic results', async () => {
	const { result, calls } = await runChannel('minimax', async () => json({
		base_resp: { status_code: 0 },
		organic: [{ title: 'M', link: 'https://minimax.example/1', snippet: 'desc', date: '2026-05-05' }],
	}))
	assert.equal(calls[0].url, 'https://api.minimax.io/v1/coding_plan/search')
	assert.equal(calls[0].init.headers.authorization, 'Bearer test-key')
	assert.deepEqual(JSON.parse(calls[0].init.body), { q: 'hello world' })
	assert.deepEqual(result.sources, [{
		url: 'https://minimax.example/1',
		title: 'M',
		snippet: 'desc',
		publishedAt: '2026-05-05',
	}])
})

test('MiniMax maps base_resp quota and safety codes', async () => {
	await assert.rejects(runChannel('minimax', async () => json({
		base_resp: { status_code: 1030, status_msg: 'quota exhausted' },
	})), (error) => {
		assert.equal(error.code, 'quota')
		assert.match(error.message, /quota exhausted/)
		return true
	})
	await assert.rejects(runChannel('minimax', async () => json({
		base_resp: { status_code: 1002, status_msg: 'filtered' },
	})), (error) => {
		assert.equal(error.code, 'bad-request')
		return true
	})
})

test('DeepSeek asks the Messages API for native search and joins citations', async () => {
	const { result, calls } = await runChannel('deepseek', async () => json({
		content: [
			{ type: 'text', text: 'answer', citations: [{ url: 'https://deepseek.example/1', cited_text: 'cited excerpt' }] },
			{
				type: 'web_search_tool_result',
				content: [
					{ type: 'web_search_result', url: 'https://deepseek.example/1', title: 'D', page_age: '2026-06-06' },
					{ type: 'web_search_result', url: 'https://deepseek.example/2', title: 'D2' },
				],
			},
		],
	}))
	assert.equal(calls[0].url, 'https://api.deepseek.com/anthropic/v1/messages')
	assert.equal(calls[0].init.headers['x-api-key'], 'test-key')
	assert.equal(calls[0].init.headers.authorization, 'Bearer test-key')
	assert.equal(calls[0].init.headers['anthropic-version'], '2023-06-01')
	const body = JSON.parse(calls[0].init.body)
	assert.equal(body.tools[0].type, 'web_search_20250305')
	assert.equal(body.messages[0].content[0].text, 'Perform a web search for the query: hello world')
	assert.deepEqual(result.sources.map((source) => source.url), [
		'https://deepseek.example/1',
		'https://deepseek.example/2',
	])
	assert.equal(result.sources[0].snippet, 'cited excerpt')
	assert.equal(result.sources[0].publishedAt, '2026-06-06')
})

test('DeepSeek rejects a response without native result blocks or with a tool error', async () => {
	await assert.rejects(runChannel('deepseek', async () => json({
		content: [{ type: 'text', text: 'no search happened' }],
	})), (error) => {
		assert.equal(error.code, 'invalid-response')
		return true
	})
	await assert.rejects(runChannel('deepseek', async () => json({
		content: [{
			type: 'web_search_tool_result',
			content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' },
		}],
	})), (error) => {
		assert.equal(error.code, 'bad-request')
		assert.match(error.message, /max_uses_exceeded/)
		return true
	})
})

test('MiniMax falls back from global to CN on an invalid-key auth error', async () => {
	const key = 'minimax-cn-fallback-key'
	const handler = async (url) => {
		if (url.startsWith('https://api.minimax.io')) return json({ base_resp: { status_code: 2049, status_msg: 'invalid api key' } })
		return json({ base_resp: { status_code: 0 }, organic: [{ title: 'M', link: 'https://minimax.example/1', snippet: 'desc' }] })
	}
	const first = await runChannel('minimax', handler, { apiKey: key })
	assert.deepEqual(first.calls.map((call) => new URL(call.url).host), ['api.minimax.io', 'api.minimaxi.com'])
	assert.equal(first.result.sources[0].url, 'https://minimax.example/1')

	// The region cache remembers CN for this key, so the next search goes straight there.
	const second = await runChannel('minimax', handler, { apiKey: key })
	assert.deepEqual(second.calls.map((call) => new URL(call.url).host), ['api.minimaxi.com'])
})

test('MiniMax reports auth when both regions reject the key', async () => {
	await assert.rejects(runChannel('minimax', async () => json({
		base_resp: { status_code: 2049, status_msg: 'invalid api key' },
	}), { apiKey: 'minimax-both-bad-key' }), (error) => {
		assert.equal(error.code, 'auth')
		assert.match(error.message, /global 和 cn/)
		return true
	})
})

test('MiniMax honours an explicit base URL without region fallback', async () => {
	const { calls, result } = await runChannel('minimax', async () => json({
		base_resp: { status_code: 0 },
		organic: [{ title: 'M', link: 'https://minimax.example/1', snippet: 'desc' }],
	}), { apiKey: 'minimax-explicit-key', baseUrl: 'https://api.minimaxi.com' })
	assert.equal(calls.length, 1)
	assert.equal(new URL(calls[0].url).host, 'api.minimaxi.com')
	assert.equal(result.sources.length, 1)
})

test('Bing parses its HTML results and resolves click-tracking URLs', async () => {
	const target = 'https://bing.example/1'
	const encoded = `a1${Buffer.from(target).toString('base64url')}`
	const html = `<html><body><li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=${encoded}">Hello world result</a></h2><p>hello world snippet</p></li><!-- ${'x'.repeat(600)} --></body></html>`
	const { result, calls } = await runChannel('bing', async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }), { apiKey: '' })
	assert.match(calls[0].url, /^https:\/\/www\.bing\.com\/search\?/)
	assert.equal(new URL(calls[0].url).searchParams.get('q'), 'hello world')
	assert.deepEqual(result.sources, [{
		url: target,
		title: 'Hello world result',
		snippet: 'hello world snippet',
	}])
})

test('DuckDuckGo parses HTML results and resolves redirect links', async () => {
	const target = 'https://ddg.example/1'
	const html = `<html><body><div class="result results_links results_links_deep"><a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(target)}">Hello world</a><a class="result__snippet">hello world snippet</a></div></div></div><!-- ${'x'.repeat(600)} --></body></html>`
	const { result, calls } = await runChannel('ddg', async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }), { apiKey: '' })
	assert.match(calls[0].url, /^https:\/\/html\.duckduckgo\.com\/html\/\?/)
	assert.deepEqual(result.sources, [{
		url: target,
		title: 'Hello world',
		snippet: 'hello world snippet',
	}])
})

test('DuckDuckGo falls back to Lite when the HTML endpoint is challenged', async () => {
	let call = 0
	const lite = `<html><body><a class="result-link" href="https://ddg.example/2">Hello world</a><td class="result-snippet">hello world lite</td><!-- ${'x'.repeat(600)} --></body></html>`
	const { result, calls } = await runChannel('ddg', async () => {
		call += 1
		if (call === 1) return new Response('captcha', { status: 202 })
		return new Response(lite, { status: 200, headers: { 'content-type': 'text/html' } })
	}, { apiKey: '' })
	assert.equal(calls.length, 2)
	assert.match(calls[1].url, /^https:\/\/lite\.duckduckgo\.com\/lite\/\?/)
	assert.equal(result.sources[0].url, 'https://ddg.example/2')
	assert.equal(result.sources[0].snippet, 'hello world lite')
})

test('AnySearch works without a key and parses its data envelope', async () => {
	const { result, calls } = await runChannel('anysearch', async () => json({
		code: 0,
		data: { results: [{ url: 'https://any.example/1', title: 'A', snippet: 'any snippet' }] },
	}), { apiKey: '' })
	assert.equal(calls[0].url, 'https://api.anysearch.com/v1/search')
	assert.equal(calls[0].init.headers.authorization, undefined)
	assert.deepEqual(JSON.parse(calls[0].init.body), { query: 'hello world', max_results: 5 })
	assert.equal(result.sources[0].url, 'https://any.example/1')
})

test('AnySearch retries anonymously when an optional key is rejected', async () => {
	let call = 0
	const { result, calls } = await runChannel('anysearch', async () => {
		call += 1
		if (call === 1) return json({ message: 'bad key' }, 401)
		return json({ code: 0, data: { results: [{ url: 'https://any.example/2', title: 'A' }] } })
	}, { apiKey: 'bad-any-key' })
	assert.equal(calls.length, 2)
	assert.equal(calls[0].init.headers.authorization, 'Bearer bad-any-key')
	assert.equal(calls[1].init.headers.authorization, undefined)
	assert.equal(result.sources[0].url, 'https://any.example/2')
})

test('Exa falls back to its anonymous MCP endpoint without a key', async () => {
	const body = `data: ${JSON.stringify({
		result: { content: [{ type: 'text', text: 'Title: Hello world\nURL: https://exa.example/1\nPublished: 2026-01-01\nHighlights:\nhello world' }] },
	})}\n\n`
	const { result, calls } = await runChannel('exa', async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }), { apiKey: '' })
	assert.equal(calls[0].url, 'https://mcp.exa.ai/mcp')
	assert.equal(calls[0].init.headers['x-api-key'], undefined)
	const request = JSON.parse(calls[0].init.body)
	assert.equal(request.params.name, 'web_search_exa')
	assert.equal(result.sources[0].url, 'https://exa.example/1')
	assert.equal(result.sources[0].snippet, 'hello world')
})

test('Tavily sends its keyless access header without a key', async () => {
	const { result, calls } = await runChannel('tavily', async () => json({
		results: [{ url: 'https://tavily.example/1', title: 'T', content: 'hello world' }],
	}), { apiKey: '' })
	assert.equal(calls[0].init.headers['x-tavily-access-mode'], 'keyless')
	assert.equal(calls[0].init.headers.authorization, undefined)
	assert.equal(result.sources[0].url, 'https://tavily.example/1')
})

test('Firecrawl omits auth on its free tier', async () => {
	const { result, calls } = await runChannel('firecrawl', async () => json({
		data: { web: [{ url: 'https://fc.example/1', title: 'F', markdown: 'hello world' }] },
	}), { apiKey: '' })
	assert.equal(calls[0].init.headers.authorization, undefined)
	assert.equal(result.sources[0].url, 'https://fc.example/1')
})

test('Parallel falls back to its anonymous MCP endpoint without a key', async () => {
	const body = `data: ${JSON.stringify({
		result: { content: [{ type: 'text', text: JSON.stringify({ results: [{ url: 'https://parallel.example/1', title: 'P', excerpts: ['hello world'] }] }) }] },
	})}\n\n`
	const { result, calls } = await runChannel('parallel', async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }), { apiKey: '' })
	assert.equal(calls[0].url, 'https://search.parallel.ai/mcp')
	assert.equal(calls[0].init.headers['x-api-key'], undefined)
	const request = JSON.parse(calls[0].init.body)
	assert.equal(request.params.name, 'web_search')
	assert.equal(result.sources[0].url, 'https://parallel.example/1')
})

test('You.com uses its free endpoint without a key', async () => {
	const { result, calls } = await runChannel('you', async () => json({
		results: { web: [{ url: 'https://you.example/1', title: 'Y', snippets: ['hello world'] }] },
	}), { apiKey: '' })
	assert.match(calls[0].url, /^https:\/\/api\.you\.com\/v1\/agents\/search\?/)
	assert.equal(calls[0].init.headers['x-api-key'], undefined)
	assert.equal(result.sources[0].url, 'https://you.example/1')
})

test('Keenable falls back to its anonymous MCP endpoint without a key', async () => {
	const { result, calls } = await runChannel('keenable', async () => json({
		result: { content: [{ type: 'text', text: 'Title: Hello world\nURL: https://keen.example/1\nSnippets:\nhello world' }] },
	}), { apiKey: '' })
	assert.equal(calls[0].url, 'https://api.keenable.ai/mcp')
	assert.equal(calls[0].init.headers['x-api-key'], undefined)
	const request = JSON.parse(calls[0].init.body)
	assert.equal(request.params.name, 'search_web_pages')
	assert.equal(result.sources[0].url, 'https://keen.example/1')
})

test('a rejected anonymous tier is classified as a bot-wall, not auth', async () => {
	await assert.rejects(runChannel('tavily', async () => new Response('', { status: 401 }), { apiKey: '' }), (error) => {
		assert.equal(error.code, 'bot-wall')
		return true
	})
	await assert.rejects(runChannel('anysearch', async () => new Response('', { status: 401 }), { apiKey: '' }), (error) => {
		assert.equal(error.code, 'bot-wall')
		return true
	})
	await assert.rejects(runChannel('you', async () => new Response('', { status: 403 }), { apiKey: '' }), (error) => {
		assert.equal(error.code, 'bot-wall')
		return true
	})
})

test('time filters map to the provider parameters', async () => {
	const ddg = await runChannel('ddg', async () => new Response(`<html><body>no results<!-- ${'x'.repeat(600)} --></body></html>`, { status: 200 }), { timeRange: 'week' })
	assert.match(ddg.calls[0].url, /[?&]df=w(&|$)/)

	const exa = await runChannel('exa', async () => json({ results: [] }), { timeRange: 'week' })
	const exaBody = JSON.parse(exa.calls[0].init.body)
	assert.match(exaBody.startPublishedDate, /^\d{4}-\d{2}-\d{2}$/)

	const tavily = await runChannel('tavily', async () => json({ results: [] }), { timeRange: 'month' })
	assert.equal(JSON.parse(tavily.calls[0].init.body).time_range, 'month')

	const firecrawl = await runChannel('firecrawl', async () => json({ data: { web: [] } }), { timeRange: 'year' })
	assert.equal(JSON.parse(firecrawl.calls[0].init.body).tbs, 'qdr:y')

	const searxng = await runChannel('searxng', async () => json({ results: [] }), { apiKey: '', timeRange: 'day' })
	assert.match(searxng.calls[0].url, /[?&]time_range=day(&|$)/)

	const keenable = await runChannel('keenable', async () => json({ result: { content: [] } }), { apiKey: '', timeRange: 'month' })
	assert.equal(JSON.parse(keenable.calls[0].init.body).params.arguments.published_after, '1mo')
})

test('HTTP failures map to classified codes without response bodies', async () => {
	await assert.rejects(runChannel('exa', async () => new Response('secret body', { status: 401 })), (error) => {
		assert.ok(error instanceof SearchChannelError)
		assert.equal(error.code, 'auth')
		assert.equal(error.status, 401)
		assert.equal(error.message.includes('secret body'), false)
		return true
	})
	await assert.rejects(runChannel('tavily', async () => new Response('', { status: 429 })), (error) => {
		assert.equal(error.code, 'rate-limit')
		return true
	})
})

test('malformed JSON, network failures and aborts are classified', async () => {
	await assert.rejects(runChannel('exa', async () => new Response('not json', { status: 200 })), (error) => {
		assert.equal(error.code, 'invalid-response')
		return true
	})
	await assert.rejects(runChannel('exa', async () => {
		const error = new TypeError('fetch failed')
		error.cause = { code: 'ECONNREFUSED' }
		throw error
	}), (error) => {
		assert.equal(error.code, 'network')
		assert.match(error.message, /ECONNREFUSED/)
		return true
	})
	const aborted = AbortSignal.abort()
	await assert.rejects(runChannel('exa', async () => { throw new DOMException('aborted', 'AbortError') }, { signal: aborted }), (error) => {
		assert.equal(error.code, 'timeout')
		return true
	})
})

test('a required key is reported before any request', async () => {
	let called = false
	await assert.rejects(runChannel('deepseek', async () => { called = true; return json({}) }, { apiKey: '' }), (error) => {
		assert.equal(error.code, 'config')
		return true
	})
	assert.equal(called, false)
})


test('safe search reaches Bing and DuckDuckGo', async () => {
	const bingHtml = `<html><body><li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=a1${Buffer.from('https://bing.example/1').toString('base64url')}">Hello world result</a></h2><p>hello world snippet</p></li><!-- ${'x'.repeat(600)} --></body></html>`
	const ddgHtml = `<html><body><div class="result results_links results_links_deep"><a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://ddg.example/1')}">Hello world</a><a class="result__snippet">hello world snippet</a></div></div></div><!-- ${'x'.repeat(600)} --></body></html>`
	const bingPage = () => new Response(bingHtml, { status: 200, headers: { 'content-type': 'text/html' } })
	const ddgPage = () => new Response(ddgHtml, { status: 200, headers: { 'content-type': 'text/html' } })
	const strict = await runChannel('bing', bingPage, { safeSearch: true })
	assert.match(strict.calls[0].url, /adlt=strict/)
	const off = await runChannel('bing', bingPage, { safeSearch: false })
	assert.match(off.calls[0].url, /adlt=off/)
	const ddg = await runChannel('ddg', ddgPage, { safeSearch: true })
	assert.match(ddg.calls[0].url, /kp=1/)
	const ddgOff = await runChannel('ddg', ddgPage, { safeSearch: false })
	assert.match(ddgOff.calls[0].url, /kp=-1/)
})
