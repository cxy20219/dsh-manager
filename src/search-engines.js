/**
 * Keyed search adapters for the manager's channel registry.
 *
 * Each adapter owns one vendor API. They share the error classification, key
 * splitting and small conversion helpers below; the request and response
 * shapes follow the public APIs (and dsh-free-search's MIT adapters where one
 * already existed). Every adapter receives an injected `fetchImpl` and `signal`
 * so tests never touch the network.
 *
 * Two vendors need a second identifier. Their key field carries `KEY:ID`:
 * Google Custom Search uses `API_KEY:CX` and Yandex Cloud uses
 * `API_KEY:FOLDER_ID`. The colon keeps multi-key rotation working, because the
 * key splitter only breaks on commas, semicolons and whitespace.
 *
 * @module dsh-manager/search-engines
 */

import { SearchChannelError } from './search-error.js'

/** Time filter to days. */
const TIME_DAYS = Object.freeze({ day: 1, week: 7, month: 30, year: 365 })

/** Default user agent for vendor APIs. */
const UA = 'deepseek-harness/dsh-manager'

/** Days for a normalized time filter. */
function daysOf(timeRange) {
	return TIME_DAYS[timeRange] ?? 0
}

/** ISO date `days` ago. */
function isoDaysAgo(days) {
	return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

/** Trimmed string. */
function textOf(value) {
	return typeof value === 'string' ? value.trim() : ''
}

/** Clamp a requested result count. */
function clampCount(value, fallback, max) {
	const number = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback
	return Math.min(Math.max(number, 1), max)
}

/** Trim a trailing slash. */
function trimBase(value) {
	return value.replace(/\/+$/, '')
}

/** Resolve a base URL override. */
function baseOf(baseUrl, fallback) {
	const value = textOf(baseUrl)
	return trimBase(value === '' ? fallback : value)
}

/** Append a path to a base URL. */
function joinUrl(base, path) {
	return `${trimBase(base)}${path.startsWith('/') ? path : `/${path}`}`
}

/** Classify an HTTP status into a channel error. */
function httpError(label, status) {
	if (status === 401 || status === 403) return new SearchChannelError('auth', `${label} 鉴权失败（HTTP ${status}），检查 API Key 和权限。`, status)
	if (status === 402 || status === 432 || status === 433) return new SearchChannelError('quota', `${label} 额度不足（HTTP ${status}）。`, status)
	if (status === 408) return new SearchChannelError('timeout', `${label} 请求超时（HTTP ${status}）。`, status)
	if (status === 429) return new SearchChannelError('rate-limit', `${label} 被限流（HTTP ${status}），稍后重试。`, status)
	if (status >= 500) return new SearchChannelError('server', `${label} 服务端错误（HTTP ${status}）。`, status)
	return new SearchChannelError('bad-request', `${label} 请求被拒绝（HTTP ${status}），检查 Key、服务地址或参数。`, status)
}

/**
 * Send one request and parse JSON, classifying transport and status failures.
 *
 * @param {{label: string, url: string, method?: string, headers?: object, body?: unknown, signal?: AbortSignal, fetchImpl?: Function}} options - Request.
 * @returns {Promise<unknown>} Parsed body.
 */
async function requestJson({ label, url, method = 'GET', headers = {}, body, signal, fetchImpl }) {
	const doFetch = typeof fetchImpl === 'function' ? fetchImpl : globalThis.fetch
	if (typeof doFetch !== 'function') throw new SearchChannelError('config', '当前 Host 没有可用的 fetch 实现。')
	let response
	try {
		response = await doFetch(url, {
			method,
			redirect: 'error',
			headers: {
				accept: 'application/json',
				'user-agent': UA,
				...(body === undefined ? {} : { 'content-type': 'application/json' }),
				...headers,
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
			signal,
		})
	} catch (error) {
		if (signal !== undefined && signal.aborted) throw new SearchChannelError('timeout', `${label} 请求超时。`)
		throw new SearchChannelError('network', `${label} 网络请求失败。`)
	}
	if (!response.ok) throw httpError(label, response.status)
	try {
		return await response.json()
	} catch {
		throw new SearchChannelError('invalid-response', `${label} 返回的不是合法 JSON。`, response.status)
	}
}

/**
 * Call one MCP tool over streamable HTTP and return `result`.
 *
 * @param {{label: string, url: string, headers?: object, name: string, args: object, signal?: AbortSignal, fetchImpl?: Function}} options - Call.
 * @returns {Promise<object>} The tool result.
 */
async function mcpCall({ label, url, headers = {}, name, args, signal, fetchImpl }) {
	const doFetch = typeof fetchImpl === 'function' ? fetchImpl : globalThis.fetch
	if (typeof doFetch !== 'function') throw new SearchChannelError('config', '当前 Host 没有可用的 fetch 实现。')
	let response
	try {
		response = await doFetch(url, {
			method: 'POST',
			redirect: 'error',
			headers: {
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json',
				'user-agent': UA,
				...headers,
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: { name, arguments: args },
			}),
			signal,
		})
	} catch {
		if (signal !== undefined && signal.aborted) throw new SearchChannelError('timeout', `${label} 请求超时。`)
		throw new SearchChannelError('network', `${label} 网络请求失败。`)
	}
	if (!response.ok) throw httpError(label, response.status)
	const raw = await response.text()
	let envelope
	try {
		envelope = JSON.parse(raw)
	} catch {
		const line = raw.split('\n').find((entry) => entry.startsWith('data:'))
		if (line === undefined) throw new SearchChannelError('invalid-response', `${label} 返回的不是合法 JSON。`, response.status)
		try {
			envelope = JSON.parse(line.slice(5).trim())
		} catch {
			throw new SearchChannelError('invalid-response', `${label} 的 SSE 数据无法解析。`, response.status)
		}
	}
	if (envelope?.error !== undefined) {
		throw new SearchChannelError('bad-request', `${label} MCP 错误：${textOf(envelope.error?.message) || 'unknown'}`)
	}
	const result = envelope?.result
	if (result === undefined || result === null || typeof result !== 'object') {
		throw new SearchChannelError('invalid-response', `${label} MCP 结果缺失。`, response.status)
	}
	if (result.isError === true) throw new SearchChannelError('bad-request', `${label} 工具返回错误。`)
	return result
}

/** Text of the first text content block. */
function mcpText(result) {
	const block = Array.isArray(result?.content)
		? result.content.find((item) => item?.type === 'text' && typeof item.text === 'string')
		: undefined
	return textOf(block?.text)
}

/** Map a source list to the manager shape, dropping unusable entries. */
function toSources(items, limit) {
	const sources = []
	for (const item of Array.isArray(items) ? items : []) {
		if (sources.length >= limit) break
		const url = textOf(item?.url)
		if (url === '') continue
		const source = { url }
		if (textOf(item.title) !== '') source.title = textOf(item.title)
		if (textOf(item.snippet) !== '') source.snippet = textOf(item.snippet)
		if (textOf(item.publishedAt) !== '') source.publishedAt = textOf(item.publishedAt)
		sources.push(source)
	}
	return sources
}

/** Split a `KEY:ID` credential. */
function pairKey(apiKey) {
	const value = textOf(apiKey)
	const at = value.lastIndexOf(':')
	if (at <= 0 || at === value.length - 1) return { key: value, id: '' }
	return { key: value.slice(0, at), id: value.slice(at + 1) }
}

/**
 * Baidu Qianfan AI search.
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
export async function searchBaiduQianfan({ query, maxResults = 10, timeRange = '', apiKey, baseUrl, signal, fetchImpl }) {
	const key = textOf(apiKey)
	if (key === '') throw new SearchChannelError('config', '百度千帆搜索需要 API Key。')
	const limit = clampCount(maxResults, 10, 50)
	const base = baseOf(baseUrl, 'https://qianfan.baidubce.com')
	const body = {
		messages: [{ role: 'user', content: query }],
		search_source: 'baidu_search_v2',
		resource_type_filter: [{ type: 'web', top_k: limit }],
	}
	const days = daysOf(timeRange)
	if (days > 0) {
		body.search_filter = { range: { page_time: { gte: isoDaysAgo(days), lt: isoDaysAgo(0) } } }
	}
	const parse = (data) => toSources((Array.isArray(data?.references) ? data.references : []).map((item) => ({
		url: item?.url,
		title: item?.title,
		snippet: item?.content,
		publishedAt: item?.date,
	})), limit)
	try {
		const data = await requestJson({ label: '百度千帆', url: joinUrl(base, '/v2/ai_search/web_search'), method: 'POST', headers: { authorization: `Bearer ${key}` }, body, signal, fetchImpl })
		return { sources: parse(data) }
	} catch (error) {
		// The web_search endpoint has a small daily quota; the chat endpoint has a
		// separate one and accepts the same body plus stream:false.
		if (!(error instanceof SearchChannelError) || (error.code !== 'auth' && error.code !== 'quota' && error.code !== 'rate-limit')) throw error
		const data = await requestJson({ label: '百度千帆', url: joinUrl(base, '/v2/ai_search/chat/completions'), method: 'POST', headers: { authorization: `Bearer ${key}` }, body: { ...body, stream: false }, signal, fetchImpl })
		return { sources: parse(data) }
	}
}

/**
 * Kimi (Moonshot) tools search.
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
export async function searchKimi({ query, maxResults = 10, apiKey, baseUrl, signal, fetchImpl }) {
	const key = textOf(apiKey)
	if (key === '') throw new SearchChannelError('config', 'Kimi 搜索需要 MOONSHOT_API_KEY。')
	const limit = clampCount(maxResults, 10, 20)
	const data = await requestJson({
		label: 'Kimi',
		url: joinUrl(baseOf(baseUrl, 'https://api.moonshot.cn'), '/v1/tools/search'),
		method: 'POST',
		headers: { authorization: `Bearer ${key}` },
		body: { text_query: query, limit, timeout_seconds: 30 },
		signal,
		fetchImpl,
	})
	const sources = (Array.isArray(data?.search_results) ? data.search_results : []).map((item) => {
		let snippet = textOf(item?.snippet)
		if (Array.isArray(item?.chunks) && item.chunks.length > 0) {
			snippet = item.chunks
				.map((chunk) => (typeof chunk === 'string' ? chunk : textOf(chunk?.text)))
				.filter(Boolean)
				.join(' ')
		}
		return { url: item?.url, title: item?.title, snippet }
	})
	return { sources: toSources(sources, limit) }
}

/**
 * Perplexity sonar search.
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[], content: string}>} Sources and answer.
 */
export async function searchPerplexity({ query, maxResults = 10, apiKey, baseUrl, signal, fetchImpl }) {
	const key = textOf(apiKey)
	if (key === '') throw new SearchChannelError('config', 'Perplexity 搜索需要 API Key。')
	const limit = clampCount(maxResults, 10, 20)
	const data = await requestJson({
		label: 'Perplexity',
		url: joinUrl(baseOf(baseUrl, 'https://api.perplexity.ai'), '/chat/completions'),
		method: 'POST',
		headers: { authorization: `Bearer ${key}` },
		body: { model: 'sonar', max_tokens: 1024, messages: [{ role: 'user', content: query }] },
		signal,
		fetchImpl,
	})
	const answer = textOf(data?.choices?.[0]?.message?.content)
	const citations = Array.isArray(data?.citations) ? data.citations : []
	return {
		sources: toSources(citations.map((url) => ({ url, snippet: answer.slice(0, 200) })), limit),
		...(answer === '' ? {} : { content: answer }),
	}
}

/**
 * Metaso search.
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
export async function searchMetaso({ query, maxResults = 10, apiKey, baseUrl, signal, fetchImpl }) {
	const key = textOf(apiKey)
	if (key === '') throw new SearchChannelError('config', 'Metaso 搜索需要 API Key。')
	const limit = clampCount(maxResults, 10, 50)
	const data = await requestJson({
		label: 'Metaso',
		url: joinUrl(baseOf(baseUrl, 'https://metaso.cn'), '/api/v1/search'),
		method: 'POST',
		headers: { authorization: `Bearer ${key}` },
		body: { q: query, scope: 'webpage', size: limit, includeSummary: true, includeRawContent: false, conciseSnippet: true },
		signal,
		fetchImpl,
	})
	const items = Array.isArray(data?.webpages) ? data.webpages : []
	return {
		sources: toSources(items.map((item) => ({
			url: item?.link,
			title: item?.title,
			snippet: textOf(item?.summary) || textOf(item?.snippet),
			publishedAt: /^\d{4}-\d{2}-\d{2}/.test(textOf(item?.date)) ? textOf(item.date).slice(0, 10) : '',
		})), limit),
	}
}

/**
 * Google Programmable Search (`API_KEY:CX`).
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
export async function searchGoogleCse({ query, maxResults = 10, timeRange = '', safeSearch = true, apiKey, baseUrl, signal, fetchImpl }) {
	const { key, id } = pairKey(apiKey)
	if (key === '') throw new SearchChannelError('config', 'Google 搜索需要 API Key。')
	if (id === '') throw new SearchChannelError('config', 'Google 搜索的 Key 要写成 API_KEY:CX（CX 是搜索引擎 ID）。')
	const limit = clampCount(maxResults, 10, 20)
	const url = new URL(joinUrl(baseOf(baseUrl, 'https://www.googleapis.com'), '/customsearch/v1'))
	url.searchParams.set('key', key)
	url.searchParams.set('cx', id)
	url.searchParams.set('q', query)
	url.searchParams.set('num', String(Math.min(limit, 10)))
	if (safeSearch !== false) url.searchParams.set('safe', 'active')
	const days = daysOf(timeRange)
	if (days > 0) url.searchParams.set('dateRestrict', days <= 31 ? `d${days}` : days <= 365 ? `m${Math.max(1, Math.ceil(days / 30))}` : 'y1')
	const data = await requestJson({ label: 'Google', url: url.toString(), signal, fetchImpl })
	const items = Array.isArray(data?.items) ? data.items : []
	return {
		sources: toSources(items.map((item) => {
			const tags = item?.pagemap?.metatags?.[0] ?? {}
			const published = textOf(tags['article:published_time']) || textOf(tags['og:updated_time'])
			return {
				url: item?.link,
				title: item?.title,
				snippet: item?.snippet,
				publishedAt: /^\d{4}-\d{2}-\d{2}/.test(published) ? published.slice(0, 10) : '',
			}
		}), limit),
	}
}

/**
 * Yandex Cloud Search v2 (`API_KEY:FOLDER_ID`).
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
export async function searchYandex({ query, maxResults = 10, timeRange = '', apiKey, baseUrl, signal, fetchImpl }) {
	const { key, id } = pairKey(apiKey)
	if (key === '') throw new SearchChannelError('config', 'Yandex 搜索需要 API Key。')
	if (id === '') throw new SearchChannelError('config', 'Yandex 搜索的 Key 要写成 API_KEY:FOLDER_ID。')
	const limit = clampCount(maxResults, 10, 50)
	const days = daysOf(timeRange)
	const period = days <= 0 ? undefined : days <= 1 ? 'PERIOD_DAY' : days <= 14 ? 'PERIOD_2_WEEKS' : days <= 31 ? 'PERIOD_MONTH' : undefined
	const data = await requestJson({
		label: 'Yandex',
		url: joinUrl(baseOf(baseUrl, 'https://searchapi.api.cloud.yandex.net'), '/v2/web/search'),
		method: 'POST',
		headers: { authorization: `Api-Key ${key}` },
		body: {
			query: { searchType: 'SEARCH_TYPE_COM', queryText: query },
			groupSpec: { groupMode: 'GROUP_MODE_FLAT', groupsOnPage: String(limit), docsInGroup: '1' },
			maxPassages: '3',
			folderId: id,
			responseFormat: 'FORMAT_XML',
			...(period === undefined ? {} : { period }),
		},
		signal,
		fetchImpl,
	})
	const xml = typeof data?.rawData === 'string' && data.rawData !== ''
		? Buffer.from(data.rawData, 'base64').toString('utf8')
		: ''
	if (xml === '') throw new SearchChannelError('invalid-response', 'Yandex 响应里没有 rawData。')
	const sources = []
	for (const match of xml.matchAll(/<doc(?:\s[^>]*)?>([\s\S]*?)<\/doc>/g)) {
		const block = match[1]
		const url = decodeXml(block.match(/<url>([\s\S]*?)<\/url>/)?.[1])
		if (url === '') continue
		const title = decodeXml(block.match(/<title>([\s\S]*?)<\/title>/)?.[1])
		const snippet = [...block.matchAll(/<passage>([\s\S]*?)<\/passage>/g)]
			.map((entry) => decodeXml(entry[1]))
			.filter(Boolean)
			.slice(0, 3)
			.join(' ')
		const raw = decodeXml(block.match(/<modtime>([\s\S]*?)<\/modtime>/)?.[1])
		const date = /^(\d{4})(\d{2})(\d{2})/.exec(raw)
		sources.push({ url, title, snippet, publishedAt: date === null ? '' : `${date[1]}-${date[2]}-${date[3]}` })
	}
	return { sources: toSources(sources, limit) }
}

/** Decode an XML text node. */
function decodeXml(value) {
	return textOf(value)
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
		.replace(/<[^>]*>/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim()
}

/**
 * Aliyun Bailian EnhancedSearch (MCP over HTTP).
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
export async function searchAliyun({ query, maxResults = 10, apiKey, baseUrl, signal, fetchImpl }) {
	const key = textOf(apiKey)
	if (key === '') throw new SearchChannelError('config', '阿里云搜索需要 DASHSCOPE_API_KEY。')
	const limit = clampCount(maxResults, 10, 20)
	const result = await mcpCall({
		label: '阿里云',
		url: joinUrl(baseOf(baseUrl, 'https://dashscope.aliyuncs.com'), '/api/v1/mcps/EnhancedSearch/mcp'),
		headers: { authorization: `Bearer ${key}` },
		name: 'search_pro',
		args: { query: query.length < 2 ? `${query} ` : query.slice(0, 500) },
		signal,
		fetchImpl,
	})
	const text = mcpText(result)
	if (text === '') return { sources: [] }
	let inner
	try {
		inner = JSON.parse(text)
	} catch {
		throw new SearchChannelError('invalid-response', '阿里云返回的内容不是 JSON。')
	}
	const pages = Array.isArray(inner?.pages) ? inner.pages : []
	return {
		sources: toSources(pages.map((page) => ({
			url: page?.url,
			title: page?.title,
			snippet: page?.snippet,
			publishedAt: page?.published_at,
		})), limit),
	}
}

/**
 * Doubao (Volcengine) web search.
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
export async function searchDoubao({ query, maxResults = 10, timeRange = '', apiKey, baseUrl, signal, fetchImpl }) {
	const key = textOf(apiKey)
	if (key === '') throw new SearchChannelError('config', '豆包搜索需要 DOUBAO_SEARCH_API_KEY。')
	const limit = clampCount(maxResults, 10, 50)
	const days = daysOf(timeRange)
	const data = await requestJson({
		label: '豆包',
		url: joinUrl(baseOf(baseUrl, 'https://open.feedcoopapi.com'), '/search_api/web_search'),
		method: 'POST',
		headers: { authorization: `Bearer ${key}`, 'x-traffic-tag': 'dsh-manager' },
		body: {
			Query: query.slice(0, 100),
			SearchType: 'web',
			Count: limit,
			NeedSummary: true,
			Filter: { NeedUrl: true },
			...(days <= 0 ? {} : { TimeRange: days <= 1 ? 'OneDay' : days <= 7 ? 'OneWeek' : days <= 31 ? 'OneMonth' : 'OneYear' }),
		},
		signal,
		fetchImpl,
	})
	const error = data?.ResponseMetadata?.Error
	if (error !== undefined && error !== null) {
		throw new SearchChannelError('bad-request', `豆包搜索返回错误：${textOf(error.Message) || textOf(error.Code) || 'unknown'}`)
	}
	const hits = Array.isArray(data?.Result?.WebResults) ? data.Result.WebResults : []
	return {
		sources: toSources(hits.map((item) => ({
			url: item?.Url,
			title: item?.Title,
			snippet: item?.Summary || item?.Content || item?.Snippet,
			publishedAt: item?.PublishTime,
		})), limit),
	}
}

/**
 * Tencent Yuanbao SearchPro.
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
export async function searchYuanbao({ query, maxResults = 10, timeRange = '', apiKey, baseUrl, signal, fetchImpl }) {
	const key = textOf(apiKey)
	if (key === '') throw new SearchChannelError('config', '腾讯元宝搜索需要 API Key。')
	const limit = clampCount(maxResults, 10, 50)
	const days = daysOf(timeRange)
	const data = await requestJson({
		label: '腾讯元宝',
		url: joinUrl(baseOf(baseUrl, 'https://api.wsa.cloud.tencent.com'), '/SearchPro'),
		method: 'POST',
		headers: { authorization: `Bearer ${key}` },
		body: {
			Query: query,
			Mode: 0,
			...(days <= 0 ? {} : { FromTime: Math.floor((Date.now() - days * 86_400_000) / 1000), ToTime: Math.floor(Date.now() / 1000) }),
		},
		signal,
		fetchImpl,
	})
	const result = data?.Response
	if (result === undefined || result === null) throw new SearchChannelError('invalid-response', '腾讯元宝响应缺少 Response。')
	if (result.Error !== undefined && result.Error !== null) {
		throw new SearchChannelError('bad-request', `腾讯元宝返回错误：${textOf(result.Error.Message) || 'unknown'}`)
	}
	const sources = []
	for (const raw of Array.isArray(result.Pages) ? result.Pages : []) {
		let page
		try {
			page = typeof raw === 'string' ? JSON.parse(raw) : raw
		} catch {
			continue
		}
		const vr = page?.vr === true ? page.display ?? {} : {}
		const url = textOf(vr.url) || textOf(page?.url)
		if (url === '') continue
		sources.push({
			url,
			title: textOf(vr.title) || textOf(page?.title),
			snippet: textOf(vr.passage) || textOf(vr.content) || textOf(page?.passage) || textOf(page?.content),
			publishedAt: textOf(vr.date) || textOf(page?.date),
		})
	}
	return { sources: toSources(sources, limit) }
}

/**
 * SerpBase Google SERP API.
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
export async function searchSerpbase({ query, maxResults = 10, apiKey, baseUrl, signal, fetchImpl }) {
	const key = textOf(apiKey)
	if (key === '') throw new SearchChannelError('config', 'SerpBase 需要 API Key。')
	const limit = clampCount(maxResults, 10, 20)
	const data = await requestJson({
		label: 'SerpBase',
		url: joinUrl(baseOf(baseUrl, 'https://api.serpbase.dev'), '/google/search'),
		method: 'POST',
		headers: { 'x-api-key': key },
		body: { q: query, hl: 'en', gl: 'us', page: 1 },
		signal,
		fetchImpl,
	})
	if (data?.status !== 0) throw new SearchChannelError('bad-request', `SerpBase 返回状态 ${data?.status}：${textOf(data?.error) || 'unknown'}`)
	return {
		sources: toSources((Array.isArray(data?.organic) ? data.organic : []).map((item) => ({
			url: item?.link,
			title: item?.title,
			snippet: item?.snippet,
			publishedAt: item?.published_at ?? item?.date,
		})), limit),
	}
}

/**
 * Serply Google SERP API.
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
export async function searchSerply({ query, maxResults = 10, apiKey, baseUrl, signal, fetchImpl }) {
	const key = textOf(apiKey)
	if (key === '') throw new SearchChannelError('config', 'Serply 需要 API Key。')
	const limit = clampCount(maxResults, 10, 10)
	const url = new URL(joinUrl(baseOf(baseUrl, 'https://api.serply.io'), '/v1/search'))
	url.searchParams.set('q', query)
	url.searchParams.set('num', String(limit))
	const data = await requestJson({ label: 'Serply', url: url.toString(), headers: { 'x-api-key': key }, signal, fetchImpl })
	return {
		sources: toSources((Array.isArray(data?.results) ? data.results : []).map((item) => ({
			url: item?.link,
			title: item?.title,
			snippet: item?.description,
		})), limit),
	}
}

/**
 * Outcrawl search API.
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
export async function searchOutcrawl({ query, maxResults = 10, apiKey, baseUrl, signal, fetchImpl }) {
	const key = textOf(apiKey)
	if (key === '') throw new SearchChannelError('config', 'Outcrawl 需要 API Key。')
	const limit = clampCount(maxResults, 10, 20)
	const data = await requestJson({
		label: 'Outcrawl',
		url: joinUrl(baseOf(baseUrl, 'https://api.outcrawl.ai'), '/v1/search'),
		method: 'POST',
		headers: { authorization: `Bearer ${key}` },
		body: { query, limit },
		signal,
		fetchImpl,
	})
	return {
		sources: toSources((Array.isArray(data?.hits) ? data.hits : []).map((item) => ({
			url: item?.url,
			title: item?.title,
			snippet: item?.snippet,
		})), limit),
	}
}

/**
 * TinyFish search API.
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
export async function searchTinyfish({ query, maxResults = 10, timeRange = '', apiKey, baseUrl, signal, fetchImpl }) {
	const key = textOf(apiKey)
	if (key === '') throw new SearchChannelError('config', 'TinyFish 需要 API Key。')
	const limit = clampCount(maxResults, 10, 20)
	const url = new URL(joinUrl(baseOf(baseUrl, 'https://api.search.tinyfish.ai'), '/'))
	url.searchParams.set('query', query)
	const days = daysOf(timeRange)
	if (days > 0) url.searchParams.set('after_date', isoDaysAgo(days))
	const data = await requestJson({ label: 'TinyFish', url: url.toString(), headers: { 'x-api-key': key }, signal, fetchImpl })
	return {
		sources: toSources((Array.isArray(data?.results) ? data.results : []).map((item) => ({
			url: item?.url,
			title: item?.title,
			snippet: item?.snippet,
		})), limit),
	}
}

/**
 * DegOog self-hosted MetaGer-style instance.
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
export async function searchDegoog({ query, maxResults = 10, timeRange = '', apiKey, baseUrl, signal, fetchImpl }) {
	const base = baseOf(baseUrl, '')
	if (base === '') throw new SearchChannelError('config', 'DegOog 需要填写自建实例的服务地址。')
	const limit = clampCount(maxResults, 10, 20)
	const endpoint = base.endsWith('/api') ? `${base}/search` : `${base}/api/search`
	const url = new URL(endpoint)
	url.searchParams.set('q', query)
	url.searchParams.set('type', 'web')
	if (timeRange !== '') url.searchParams.set('time', timeRange)
	const key = textOf(apiKey)
	const data = await requestJson({ label: 'DegOog', url: url.toString(), headers: key === '' ? {} : { authorization: `Bearer ${key}` }, signal, fetchImpl })
	return {
		sources: toSources((Array.isArray(data?.results) ? data.results : []).map((item) => ({
			url: item?.url,
			title: item?.title,
			snippet: item?.snippet ?? item?.content,
		})), limit),
	}
}

/** Build chat-completion URL. */
function chatUrl(baseUrl, fallback, path) {
	const base = baseOf(baseUrl, fallback)
	return base.endsWith(path) ? base : joinUrl(base, path)
}

/**
 * OpenAI Responses web search.
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[], content: string}>} Sources and answer.
 */
export async function searchOpenai({ query, maxResults = 10, apiKey, baseUrl, signal, fetchImpl }) {
	const key = textOf(apiKey)
	if (key === '') throw new SearchChannelError('config', 'OpenAI 搜索需要 API Key。')
	const limit = clampCount(maxResults, 10, 20)
	const data = await requestJson({
		label: 'OpenAI',
		url: chatUrl(baseUrl, 'https://api.openai.com/v1', '/responses'),
		method: 'POST',
		headers: { authorization: `Bearer ${key}` },
		body: { model: 'gpt-6-luna', input: String(query), tools: [{ type: 'web_search' }] },
		signal,
		fetchImpl,
	})
	if (data?.error !== undefined) throw new SearchChannelError('bad-request', `OpenAI 返回错误：${textOf(data.error?.message) || 'unknown'}`)
	const sources = []
	let answer = ''
	for (const item of Array.isArray(data?.output) ? data.output : []) {
		if (item?.type !== 'message' || !Array.isArray(item.content)) continue
		for (const part of item.content) {
			const text = textOf(part?.text)
			if (answer === '' && text !== '') answer = text
			for (const annotation of Array.isArray(part?.annotations) ? part.annotations : []) {
				if (annotation?.type !== 'url_citation' || textOf(annotation.url) === '') continue
				sources.push({ url: annotation.url, title: annotation.title, snippet: text.slice(0, 300) })
			}
		}
	}
	return { sources: toSources(sources, limit), ...(answer === '' ? {} : { content: answer }) }
}

/**
 * Gemini Interactions web search.
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[], content: string}>} Sources and answer.
 */
export async function searchGemini({ query, maxResults = 10, apiKey, baseUrl, signal, fetchImpl }) {
	const key = textOf(apiKey)
	if (key === '') throw new SearchChannelError('config', 'Gemini 搜索需要 API Key。')
	const limit = clampCount(maxResults, 10, 20)
	const data = await requestJson({
		label: 'Gemini',
		url: chatUrl(baseUrl, 'https://generativelanguage.googleapis.com/v1beta', '/interactions'),
		method: 'POST',
		headers: { 'x-goog-api-key': key },
		body: { model: 'gemini-3.8-flash', input: String(query), tools: [{ type: 'google_search' }] },
		signal,
		fetchImpl,
	})
	if (data?.error !== undefined) throw new SearchChannelError('bad-request', `Gemini 返回错误：${textOf(data.error?.message) || 'unknown'}`)
	let answer = textOf(data?.output_text)
	const sources = []
	for (const step of Array.isArray(data?.steps) ? data.steps : []) {
		if (step?.type !== 'model_output' || !Array.isArray(step.content)) continue
		for (const block of step.content) {
			if (block?.type !== 'text') continue
			const text = textOf(block.text)
			if (answer === '' && text !== '') answer = text
			for (const annotation of Array.isArray(block.annotations) ? block.annotations : []) {
				if (annotation?.type !== 'url_citation' || textOf(annotation.url) === '') continue
				sources.push({ url: annotation.url, title: annotation.title, snippet: text.slice(0, 300) })
			}
		}
	}
	return { sources: toSources(sources, limit), ...(answer === '' ? {} : { content: answer }) }
}

/**
 * Claude server-side web search.
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[], content: string}>} Sources and answer.
 */
export async function searchClaude({ query, maxResults = 10, apiKey, baseUrl, signal, fetchImpl }) {
	const key = textOf(apiKey)
	if (key === '') throw new SearchChannelError('config', 'Claude 搜索需要 ANTHROPIC_API_KEY。')
	const limit = clampCount(maxResults, 10, 20)
	const data = await requestJson({
		label: 'Claude',
		url: chatUrl(baseUrl, 'https://api.anthropic.com/v1', '/messages'),
		method: 'POST',
		headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
		body: {
			model: 'claude-sonnet-5-5',
			max_tokens: 1024,
			messages: [{ role: 'user', content: String(query) }],
			tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
		},
		signal,
		fetchImpl,
	})
	if (data?.error !== undefined) throw new SearchChannelError('bad-request', `Claude 返回错误：${textOf(data.error?.message) || 'unknown'}`)
	const sources = []
	let answer = ''
	for (const block of Array.isArray(data?.content) ? data.content : []) {
		if (block?.type === 'web_search_tool_result' && Array.isArray(block.content)) {
			for (const hit of block.content) {
				if (hit?.type !== 'web_search_result' || textOf(hit.url) === '') continue
				sources.push({ url: hit.url, title: hit.title, publishedAt: hit.page_age })
			}
		}
		if (block?.type === 'text') {
			const text = textOf(block.text)
			if (answer === '' && text !== '') answer = text
			for (const citation of Array.isArray(block.citations) ? block.citations : []) {
				if (citation?.type !== 'web_search_result_location' || textOf(citation.url) === '') continue
				sources.push({ url: citation.url, title: citation.title })
			}
		}
	}
	return { sources: toSources(sources, limit), ...(answer === '' ? {} : { content: answer }) }
}

/**
 * Zhihu open-platform MCP search.
 *
 * @param {object} options - Channel options.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
export async function searchZhihu({ query, maxResults = 10, timeRange = '', apiKey, baseUrl, signal, fetchImpl }) {
	const key = textOf(apiKey)
	if (key === '') throw new SearchChannelError('config', '知乎搜索需要 ZHIHU_API_KEY。')
	const limit = clampCount(maxResults, 10, 20)
	const args = { query: query.slice(0, 100), count: limit, search_db: 'all' }
	const days = daysOf(timeRange)
	if (days > 0) args.filter = `publish_time>=${Math.floor((Date.now() - days * 86_400_000) / 1000)}`
	const result = await mcpCall({
		label: '知乎',
		url: joinUrl(baseOf(baseUrl, 'https://developer.zhihu.com'), '/api/mcp/v1'),
		headers: { authorization: `Bearer ${key}` },
		name: 'global_search',
		args,
		signal,
		fetchImpl,
	})
	const text = mcpText(result)
	if (text === '') return { sources: [] }
	let inner
	try {
		inner = JSON.parse(text)
	} catch {
		throw new SearchChannelError('invalid-response', '知乎返回的内容不是 JSON。')
	}
	if (typeof inner?.code === 'number' && inner.code !== 0) {
		throw new SearchChannelError('bad-request', `知乎返回错误 ${inner.code}：${textOf(inner.message) || 'unknown'}`)
	}
	const items = Array.isArray(inner?.data?.items) ? inner.data.items : []
	return {
		sources: toSources(items.map((item) => ({
			url: item?.url,
			title: item?.title,
			snippet: item?.summary,
			publishedAt: Number.isFinite(item?.edit_time) && item.edit_time > 0
				? new Date(item.edit_time * 1000).toISOString().slice(0, 10)
				: '',
		})), limit),
	}
}
