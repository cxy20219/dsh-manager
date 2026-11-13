/**
 * Native search channels for the manager's search tab.
 *
 * Each channel owns one HTTP API. The manager (`src/search.js`) owns the
 * switches, credentials, timeouts and result merging; this module stays pure:
 * a channel receives its query, key, base URL, signal and a fetch
 * implementation, and returns normalized sources or a classified error.
 *
 * The request shapes follow the public APIs of each provider. They are
 * intentionally small: the panel searches; it does not implement provider
 * specific fetch/extract pipelines or query-hint compilation. The channel set
 * and normalization conventions follow the public APIs and the dsh-web-tools
 * adapters (MIT, A3Boy); this module imports none of its code or dependencies.
 *
 * @module dsh-manager/search-providers
 */

import { createHash } from 'node:crypto'

/** Per-source snippet cap, matching the manager's result cards. */
const SNIPPET_MAX_CHARS = 1200

/** MiniMax's two regional hosts. */
const MINIMAX_GLOBAL_BASE = 'https://api.minimax.io'
const MINIMAX_CN_BASE = 'https://api.minimaxi.com'

/**
 * Remember which MiniMax region accepted a key.
 *
 * The MiniMax search endpoint is region-bound: a CN key against the global
 * host fails with `invalid api key (2049)`. Without a cache every search would
 * pay for one rejected request before falling back. Keyed by a SHA-256 of the
 * key so the raw credential is not retained in this map.
 */
const minimaxRegionCache = new Map()

/** Supported fixed time filters. */
export const TIME_RANGE_DAYS = Object.freeze({
	day: 1,
	week: 7,
	month: 30,
	year: 365,
})

/**
 * Normalize a time filter to one of the fixed labels.
 *
 * @param {unknown} value - Candidate.
 * @returns {string} `day`, `week`, `month`, `year`, or an empty string.
 */
export function normalizeTimeRange(value) {
	const label = typeof value === 'string' ? value.trim().toLowerCase() : ''
	return Object.hasOwn(TIME_RANGE_DAYS, label) ? label : ''
}

/**
 * ISO date `days` ago (UTC).
 *
 * @param {number} days - Days.
 * @returns {string} `YYYY-MM-DD`.
 */
function isoDaysAgo(days) {
	return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

/** A classified channel failure. */
export class SearchChannelError extends Error {
	/**
	 * @param {string} code - `auth`, `quota`, `rate-limit`, `bot-wall`, `timeout`, `server`, `bad-request`, `network`, `config`, or `invalid-response`.
	 * @param {string} message - Operator-facing message; never contains an API key.
	 * @param {number} [status] - HTTP status when one applied.
	 */
	constructor(code, message, status) {
		super(message)
		this.name = 'SearchChannelError'
		this.code = code
		if (typeof status === 'number') this.status = status
	}
}

/**
 * The channels the panel can configure.
 *
 * Labels are proper names; descriptions are fallbacks the client may replace
 * with localized text keyed by channel id.
 */
export const SEARCH_CHANNELS = [
	{
		id: 'minimax',
		label: 'MiniMax',
		description: 'MiniMax Token Plan 网页搜索，单次最多 10 条；默认 global，CN Key 自动回退 api.minimaxi.com。',
		envName: 'MINIMAX_API_KEY',
		keyMode: 'required',
		free: false,
		defaultBaseUrl: 'https://api.minimax.io',
		search: searchMinimax,
	},
	{
		id: 'deepseek',
		label: 'DeepSeek',
		description: 'DeepSeek 原生联网搜索（Messages + web_search，按对话调用计费）。',
		envName: 'DEEPSEEK_API_KEY',
		keyMode: 'required',
		free: false,
		defaultBaseUrl: 'https://api.deepseek.com/anthropic/v1',
		search: searchDeepseek,
	},
	{
		id: 'bing',
		label: 'Bing',
		description: 'Bing 网页搜索，无需 Key；HTML 抓取，可能被反爬限流。',
		envName: '',
		keyMode: 'none',
		free: true,
		defaultBaseUrl: 'https://www.bing.com',
		search: searchBing,
	},
	{
		id: 'ddg',
		label: 'DuckDuckGo',
		description: 'DuckDuckGo HTML/Lite，无需 Key；反爬时自动切换 Lite。',
		envName: '',
		keyMode: 'none',
		free: true,
		defaultBaseUrl: 'https://html.duckduckgo.com',
		search: searchDdg,
	},
	{
		id: 'anysearch',
		label: 'AnySearch',
		description: 'AnySearch 匿名搜索，无需 Key；可选 Key 提高额度。',
		envName: 'ANYSEARCH_API_KEY',
		keyMode: 'optional',
		free: true,
		defaultBaseUrl: 'https://api.anysearch.com',
		search: searchAnysearch,
	},
	{
		id: 'exa',
		label: 'Exa',
		description: '语义搜索与 highlights，适合资料和论文；不填 Key 走匿名 MCP。',
		envName: 'EXA_API_KEY',
		keyMode: 'optional',
		free: true,
		defaultBaseUrl: 'https://api.exa.ai',
		search: searchExa,
	},
	{
		id: 'tavily',
		label: 'Tavily',
		description: 'AI 优化搜索，正文摘要密度高；不填 Key 走 keyless 档。',
		envName: 'TAVILY_API_KEY',
		keyMode: 'optional',
		free: true,
		defaultBaseUrl: 'https://api.tavily.com',
		search: searchTavily,
	},
	{
		id: 'firecrawl',
		label: 'Firecrawl',
		description: '带正文片段的搜索引擎，适合资料聚合；不填 Key 走免 Key 档。',
		envName: 'FIRECRAWL_API_KEY',
		keyMode: 'optional',
		free: true,
		defaultBaseUrl: 'https://api.firecrawl.dev/v2',
		search: searchFirecrawl,
	},
	{
		id: 'parallel',
		label: 'Parallel',
		description: 'Agent 优化的搜索与摘录；不填 Key 走匿名 MCP。',
		envName: 'PARALLEL_API_KEY',
		keyMode: 'optional',
		free: true,
		defaultBaseUrl: 'https://api.parallel.ai/v1',
		search: searchParallel,
	},
	{
		id: 'brave',
		label: 'Brave',
		description: '独立搜索索引，优先使用 LLM Context。',
		envName: 'BRAVE_API_KEY',
		keyMode: 'required',
		free: false,
		defaultBaseUrl: 'https://api.search.brave.com/res/v1',
		search: searchBrave,
	},
	{
		id: 'you',
		label: 'You.com',
		description: 'AI 搜索，支持 highlights 与新闻结果；不填 Key 走每日免费档。',
		envName: 'YOU_API_KEY',
		keyMode: 'optional',
		free: true,
		defaultBaseUrl: 'https://ydc-index.io/v1',
		search: searchYou,
	},
	{
		id: 'jina',
		label: 'Jina',
		description: 'Reader 体系里的搜索接口，按 token 计费。',
		envName: 'JINA_API_KEY',
		keyMode: 'required',
		free: false,
		defaultBaseUrl: 'https://s.jina.ai',
		search: searchJina,
	},
	{
		id: 'keenable',
		label: 'Keenable',
		description: '通用 Web 搜索 API，description 优先；不填 Key 走匿名 MCP。',
		envName: 'KEENABLE_API_KEY',
		keyMode: 'optional',
		free: true,
		defaultBaseUrl: 'https://api.keenable.ai/v1',
		search: searchKeenable,
	},
	{
		id: 'searxng',
		label: 'SearXNG',
		description: '自建元搜索；填实例地址即可，无需 API Key（需开启 JSON 输出）。',
		envName: 'SEARXNG_API_KEY',
		keyMode: 'optional',
		free: true,
		defaultBaseUrl: 'http://127.0.0.1:8080',
		search: searchSearxng,
	},
]

/** Channel lookup by id. */
export const SEARCH_CHANNEL_BY_ID = new Map(SEARCH_CHANNELS.map((channel) => [channel.id, channel]))

/** Whether a value is a usable channel id. */
export function isSearchChannelId(value) {
	return typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value) && SEARCH_CHANNEL_BY_ID.has(value)
}

//#region helpers

/**
 * Read a trimmed string.
 *
 * @param {unknown} value - Candidate.
 * @returns {string} The string, or an empty string.
 */
function textOf(value) {
	return typeof value === 'string' ? value.trim() : ''
}

/**
 * Clip a provider string to one card-sized excerpt.
 *
 * @param {string} value - Text.
 * @param {number} [limit] - Maximum characters.
 * @returns {string} The clipped text.
 */
function clipText(value, limit = SNIPPET_MAX_CHARS) {
	if (value.length <= limit) return value
	return value.slice(0, limit) + '…'
}

/**
 * Clamp a result count.
 *
 * @param {unknown} value - Candidate.
 * @param {number} fallback - Fallback for absent values.
 * @param {number} min - Lower bound.
 * @param {number} max - Upper bound.
 * @returns {number} The clamped integer.
 */
function clampCount(value, fallback, min, max) {
	const number = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback
	return Math.min(Math.max(number, min), max)
}

/**
 * Strip trailing slashes from a base URL.
 *
 * @param {string} value - Base URL.
 * @returns {string} The normalized base.
 */
function trimBase(value) {
	return value.replace(/\/+$/, '')
}

/**
 * Resolve a channel's base URL, falling back to its default.
 *
 * @param {string | undefined} baseUrl - Stored override.
 * @param {string} fallback - Channel default.
 * @returns {string} The base URL without a trailing slash.
 */
function baseOf(baseUrl, fallback) {
	const value = textOf(baseUrl)
	return trimBase(value === '' ? fallback : value)
}

/**
 * Join a base URL with a path.
 *
 * @param {string} base - Base URL without a trailing slash.
 * @param {string} path - Path beginning with `/`.
 * @returns {string} The joined URL.
 */
function joinUrl(base, path) {
	return `${trimBase(base)}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Classify an HTTP response into a channel error.
 *
 * Messages stay generic: parser/provider bodies can contain request echoes,
 * and the panel never needs them to decide what to do next.
 *
 * @param {string} label - Channel label.
 * @param {number} status - HTTP status.
 * @returns {SearchChannelError} The classified error.
 */
function httpError(label, status) {
	if (status === 401 || status === 403) return new SearchChannelError('auth', `${label} 鉴权失败（HTTP ${status}），检查 API Key 和权限。`, status)
	if (status === 402 || status === 432 || status === 433) return new SearchChannelError('quota', `${label} 额度不足（HTTP ${status}）。`, status)
	if (status === 408) return new SearchChannelError('timeout', `${label} 请求超时（HTTP ${status}）。`, status)
	if (status === 429) return new SearchChannelError('rate-limit', `${label} 被限流（HTTP ${status}），稍后重试。`, status)
	if (status >= 500) return new SearchChannelError('server', `${label} 服务端错误（HTTP ${status}）。`, status)
	return new SearchChannelError('bad-request', `${label} 请求被拒绝（HTTP ${status}），检查查询词、服务地址或参数。`, status)
}

/**
 * Fetch one response, classifying transport and abort failures.
 *
 * @param {Function} fetchImpl - Fetch implementation.
 * @param {string | URL} url - Request URL.
 * @param {object} init - Fetch init.
 * @param {string} label - Channel label.
 * @param {AbortSignal} [signal] - Cancellation signal.
 * @returns {Promise<Response>} The response.
 */
async function fetchResponse(fetchImpl, url, init, label, signal) {
	const doFetch = typeof fetchImpl === 'function' ? fetchImpl : globalThis.fetch
	if (typeof doFetch !== 'function') throw new SearchChannelError('config', '当前 Host 没有可用的 fetch 实现。')
	try {
		return await doFetch(url, { ...init, signal })
	} catch (error) {
		if (signal !== undefined && signal.aborted) throw new SearchChannelError('timeout', `${label} 请求超时。`)
		const code = textOf(error?.cause?.code) || textOf(error?.code)
		throw new SearchChannelError('network', `${label} 网络请求失败${code === '' ? '' : `（${code}）`}。`)
	}
}

/**
 * Read a JSON response, classifying status and parser failures.
 *
 * @param {Response} response - Fetch response.
 * @param {string} label - Channel label.
 * @returns {Promise<unknown>} The parsed body.
 */
async function readJson(response, label) {
	if (!response.ok) throw httpError(label, response.status)
	try {
		return await response.json()
	} catch {
		throw new SearchChannelError('invalid-response', `${label} 返回的不是 JSON。`)
	}
}

/**
 * POST a JSON body and read a JSON response.
 *
 * @param {Function} fetchImpl - Fetch implementation.
 * @param {string} url - Endpoint.
 * @param {object} headers - Request headers.
 * @param {object} body - JSON body.
 * @param {string} label - Channel label.
 * @param {AbortSignal} [signal] - Cancellation signal.
 * @returns {Promise<unknown>} The parsed response.
 */
async function postJson(fetchImpl, url, headers, body, label, signal) {
	const response = await fetchResponse(fetchImpl, url, {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
		body: JSON.stringify(body),
	}, label, signal)
	return readJson(response, label)
}

/**
 * GET a JSON endpoint.
 *
 * @param {Function} fetchImpl - Fetch implementation.
 * @param {string | URL} url - Endpoint.
 * @param {object} headers - Request headers.
 * @param {string} label - Channel label.
 * @param {AbortSignal} [signal] - Cancellation signal.
 * @returns {Promise<unknown>} The parsed response.
 */
async function getJson(fetchImpl, url, headers, label, signal) {
	const response = await fetchResponse(fetchImpl, url, {
		headers: { accept: 'application/json', ...headers },
	}, label, signal)
	return readJson(response, label)
}

/**
 * Require an API key.
 *
 * @param {string} apiKey - Resolved key.
 * @param {string} label - Channel label.
 * @returns {string} The trimmed key.
 */
function requireKey(apiKey, label) {
	const key = textOf(apiKey)
	if (key === '') throw new SearchChannelError('config', `${label} 缺少 API Key。`)
	return key
}

/**
 * Push one normalized source.
 *
 * @param {object[]} sources - Accumulator.
 * @param {object} raw - Candidate fields.
 * @param {number} limit - Maximum sources.
 * @returns {void}
 */
function pushSource(sources, raw, limit) {
	if (sources.length >= limit) return
	const url = textOf(raw.url)
	if (url === '') return
	const source = { url }
	const title = textOf(raw.title)
	if (title !== '') source.title = title
	const snippet = textOf(raw.snippet)
	if (snippet !== '') source.snippet = clipText(snippet)
	const publishedAt = textOf(raw.publishedAt)
	if (publishedAt !== '') source.publishedAt = publishedAt
	sources.push(source)
}

/**
 * Join an array of string snippets.
 *
 * @param {unknown} value - Candidate array.
 * @returns {string} The joined text.
 */
function joinStrings(value) {
	if (!Array.isArray(value)) return ''
	return value.filter((item) => typeof item === 'string' && item.trim() !== '').join('\n\n').trim()
}

//#endregion

//#region parsers

/**
 * Normalize Exa's `/search` response.
 *
 * @param {unknown} body - Response body.
 * @param {number} limit - Maximum sources.
 * @returns {object[]} Sources.
 */
export function parseExaSearch(body, limit) {
	const results = Array.isArray(body?.results) ? body.results : []
	const sources = []
	for (const item of results) {
		if (sources.length >= limit) break
		const highlights = joinStrings(item?.highlights)
		const snippet = highlights !== '' ? highlights : textOf(item?.text)
		pushSource(sources, {
			url: item?.url,
			title: item?.title,
			snippet,
			publishedAt: item?.publishedDate,
		}, limit)
	}
	return sources
}

/**
 * Normalize Tavily's `/search` response.
 *
 * @param {unknown} body - Response body.
 * @param {number} limit - Maximum sources.
 * @returns {object[]} Sources.
 */
export function parseTavilySearch(body, limit) {
	const results = Array.isArray(body?.results) ? body.results : []
	const sources = []
	for (const item of results) {
		pushSource(sources, {
			url: item?.url,
			title: item?.title,
			snippet: item?.content,
			publishedAt: item?.published_date,
		}, limit)
	}
	return sources
}

/**
 * Normalize Firecrawl's `/v2/search` response.
 *
 * @param {unknown} body - Response body.
 * @param {number} limit - Maximum sources.
 * @returns {object[]} Sources.
 */
export function parseFirecrawlSearch(body, limit) {
	const web = Array.isArray(body?.data?.web) ? body.data.web : []
	const github = Array.isArray(body?.data?.github) ? body.data.github : []
	const developer = Array.isArray(body?.data?.developer) ? body.data.developer : []
	const data = Array.isArray(body?.data) ? body.data : []
	const results = web.length > 0 ? web : github.length > 0 ? github : developer.length > 0 ? developer : data
	const sources = []
	for (const item of results) {
		if (sources.length >= limit) break
		const markdown = textOf(item?.markdown)
		const passages = joinStrings(item?.passages)
		const snippet = markdown !== '' ? markdown.slice(0, 1500) : passages !== '' ? passages : textOf(item?.description)
		pushSource(sources, {
			url: item?.url,
			title: item?.title,
			snippet,
			publishedAt: item?.publishedDate,
		}, limit)
	}
	return sources
}

/**
 * Normalize Parallel's `/v1/search` response.
 *
 * @param {unknown} body - Response body.
 * @param {number} limit - Maximum sources.
 * @returns {object[]} Sources.
 */
export function parseParallelSearch(body, limit) {
	const results = Array.isArray(body?.results) ? body.results : []
	const sources = []
	for (const item of results) {
		if (sources.length >= limit) break
		pushSource(sources, {
			url: item?.url,
			title: item?.title,
			snippet: joinStrings(item?.excerpts),
			publishedAt: item?.publish_date,
		}, limit)
	}
	return sources
}

/**
 * Normalize Brave's LLM Context response.
 *
 * @param {unknown} body - Response body.
 * @param {number} limit - Maximum sources.
 * @returns {object[]} Sources.
 */
export function parseBraveContext(body, limit) {
	const generic = Array.isArray(body?.grounding?.generic) ? body.grounding.generic : []
	const sources = []
	for (const item of generic) {
		if (sources.length >= limit) break
		pushSource(sources, {
			url: item?.url,
			title: item?.title,
			snippet: joinStrings(item?.snippets),
		}, limit)
	}
	return sources
}

/**
 * Normalize Brave's classic Web Search response.
 *
 * @param {unknown} body - Response body.
 * @param {number} limit - Maximum sources.
 * @returns {object[]} Sources.
 */
export function parseBraveWeb(body, limit) {
	const results = Array.isArray(body?.web?.results) ? body.web.results : []
	const sources = []
	for (const item of results) {
		if (sources.length >= limit) break
		pushSource(sources, {
			url: item?.url,
			title: item?.title,
			snippet: item?.description,
			publishedAt: item?.age,
		}, limit)
	}
	return sources
}

/**
 * Normalize You.com's `/v1/search` response.
 *
 * @param {unknown} body - Response body.
 * @param {number} limit - Maximum sources.
 * @returns {object[]} Sources
 */
export function parseYouSearch(body, limit) {
	const web = Array.isArray(body?.results?.web) ? body.results.web : []
	const news = Array.isArray(body?.results?.news) ? body.results.news : []
	const hits = Array.isArray(body?.hits) ? body.hits : []
	const results = [...web, ...news, ...hits]
	const sources = []
	for (const item of results) {
		if (sources.length >= limit) break
		const highlights = joinStrings(item?.contents?.highlights)
		const firstSnippet = Array.isArray(item?.snippets) && typeof item.snippets[0] === 'string' ? item.snippets[0] : ''
		const snippet = highlights !== '' ? highlights : firstSnippet !== '' ? firstSnippet : textOf(item?.description)
		pushSource(sources, {
			url: item?.url,
			title: item?.title,
			snippet,
			publishedAt: item?.page_age,
		}, limit)
	}
	return sources
}

/**
 * Normalize Jina's search envelope.
 *
 * @param {unknown} body - Response body.
 * @param {number} limit - Maximum sources.
 * @returns {object[]} Sources.
 */
export function parseJinaSearch(body, limit) {
	const data = Array.isArray(body?.data) ? body.data : []
	const sources = []
	for (const item of data) {
		if (sources.length >= limit) break
		pushSource(sources, {
			url: item?.url,
			title: item?.title,
			snippet: item?.description,
			publishedAt: item?.publishedTime,
		}, limit)
	}
	return sources
}

/**
 * Normalize Keenable's `/v1/search` response.
 *
 * @param {unknown} body - Response body.
 * @param {number} limit - Maximum sources.
 * @returns {object[]} Sources.
 */
export function parseKeenableSearch(body, limit) {
	const results = Array.isArray(body?.results) ? body.results : []
	const sources = []
	for (const item of results) {
		if (sources.length >= limit) break
		const description = textOf(item?.description)
		pushSource(sources, {
			url: item?.url,
			title: item?.title,
			snippet: description !== '' ? description : item?.snippet,
			publishedAt: item?.published_at,
		}, limit)
	}
	return sources
}

/**
 * Normalize SearXNG's JSON response.
 *
 * @param {unknown} body - Response body.
 * @param {number} limit - Maximum sources.
 * @returns {{sources: object[], content: string}} Sources and an optional answer.
 */
export function parseSearxngSearch(body, limit) {
	const results = Array.isArray(body?.results) ? body.results : []
	const sources = []
	for (const item of results) {
		if (sources.length >= limit) break
		pushSource(sources, {
			url: item?.url,
			title: item?.title,
			snippet: item?.content,
		}, limit)
	}
	return { sources, content: textOf(body?.answer) }
}

//#endregion


/**
 * Browser-ish headers for the keyless HTML engines.
 *
 * These engines scrape public result pages; a normal browser user agent and
 * an explicit language keep the responses stable across regions. They are not
 * a bypass for anti-bot systems: a challenge is surfaced as `bot-wall` and
 * the channel cools down briefly.
 */
const HTML_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const HTML_ACCEPT_LANGUAGE = 'zh-CN,zh;q=0.9,en;q=0.8'

/** A short pause between retries. */
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Turn a rejected anonymous tier into a short cooldown instead of an auth
 * cooldown. The key is absent, so waiting will not fix it; but the block is
 * often network-dependent and may clear on its own.
 *
 * @param {string} label - Channel label.
 * @param {unknown} error - The auth failure.
 * @returns {SearchChannelError} The classified error.
 */
function freeTierBlocked(label, error) {
	const status = error instanceof SearchChannelError && typeof error.status === 'number' ? error.status : undefined
	return new SearchChannelError('bot-wall', `${label} 免费档被拒绝${status === undefined ? '' : `（HTTP ${status}）`}，填 API Key 或稍后再试。`, status)
}

/**
 * Decode the small HTML entity set search result pages actually use.
 *
 * @param {string} value - HTML text.
 * @returns {string} Plain text.
 */
function decodeHtmlEntities(value) {
	return String(value)
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
			try { return String.fromCodePoint(Number.parseInt(hex, 16)) } catch { return '' }
		})
		.replace(/&#(\d+);/g, (_, decimal) => {
			try { return String.fromCodePoint(Number.parseInt(decimal, 10)) } catch { return '' }
		})
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
}

/**
 * Strip tags and collapse whitespace from a search result fragment.
 *
 * @param {string} value - HTML fragment.
 * @returns {string} Plain text.
 */
function stripHtml(value) {
	return decodeHtmlEntities(String(value)
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim()
}

/**
 * Resolve a DuckDuckGo redirect link.
 *
 * @param {string} href - Raw href.
 * @returns {string} The target, or an empty string.
 */
function extractDdgUrl(href) {
	const value = decodeHtmlEntities(textOf(href))
	if (value === '') return ''
	const match = value.match(/[?&]uddg=([^&]+)/)
	if (match !== null) {
		try { return decodeURIComponent(match[1]) } catch { return match[1] }
	}
	if (value.startsWith('//')) return `https:${value}`
	return value
}

/**
 * Resolve a Bing click-tracking link.
 *
 * @param {string} href - Raw href.
 * @returns {string} The target, or an empty string.
 */
function extractBingUrl(href) {
	const value = decodeHtmlEntities(textOf(href))
	if (value === '') return ''
	if (!/^https?:\/\/(?:www\.)?bing\.com\/ck\/a/i.test(value)) return value
	try {
		const encoded = new URL(value).searchParams.get('u')
		if (encoded === null || encoded === '') return value
		const base64 = encoded.startsWith('a1') ? encoded.slice(2) : encoded
		const decoded = Buffer.from(base64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
		return /^https?:\/\//i.test(decoded) ? decoded : value
	} catch {
		return value
	}
}

/**
 * Query tokens used to reject Bing's unrelated fallback SERP.
 *
 * @param {string} query - Query.
 * @returns {string[]} Tokens.
 */
function queryOverlapTokens(query) {
	const tokens = new Set()
	for (const run of String(query).match(/[\u4e00-\u9fff]+/g) ?? []) {
		if (run.length === 2) tokens.add(run)
		for (let index = 0; index + 1 < run.length; index += 1) tokens.add(run.slice(index, index + 2))
	}
	for (const word of String(query).toLowerCase().split(/[^a-z0-9]+/)) {
		if (word.length >= 2) tokens.add(word)
	}
	return [...tokens]
}

/**
 * Whether a Bing result page is about the query.
 *
 * Bing sometimes serves an empty-topic cached page with unrelated `b_algo`
 * blocks. Returning it would feed the model another query's answer.
 *
 * @param {string} query - Query.
 * @param {object[]} sources - Parsed sources.
 * @returns {boolean} Whether enough overlap exists.
 */
function looksRelevant(query, sources) {
	const tokens = queryOverlapTokens(query)
	if (tokens.length === 0) return true
	const strong = tokens.filter((token) => !/^\d+$/.test(token))
	const usable = strong.length > 0 ? strong : tokens
	const matched = new Set()
	let relevant = 0
	for (const source of sources) {
		const haystack = `${source.title ?? ''} ${source.snippet ?? ''} ${source.url ?? ''}`.toLowerCase()
		const hits = usable.filter((token) => haystack.includes(token.toLowerCase()))
		if (hits.length === 0) continue
		relevant += 1
		for (const hit of hits) matched.add(hit)
	}
	const enoughSources = relevant >= Math.max(1, Math.ceil(sources.length / 3))
	const enoughTokens = matched.size >= Math.min(2, usable.length) || matched.size / usable.length >= 0.5
	return enoughSources && enoughTokens
}

/**
 * Fetch a public HTML result page.
 *
 * @param {Function} fetchImpl - Fetch implementation.
 * @param {string} url - Page URL.
 * @param {string} label - Channel label.
 * @param {AbortSignal} [signal] - Caller cancellation.
 * @returns {Promise<string>} HTML.
 */
async function fetchHtmlPage(fetchImpl, url, label, signal) {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), 8_000)
	const onAbort = () => controller.abort()
	signal?.addEventListener('abort', onAbort)
	try {
		const response = await fetchResponse(fetchImpl, url, {
			headers: {
				'user-agent': HTML_USER_AGENT,
				'accept-language': HTML_ACCEPT_LANGUAGE,
				accept: 'text/html,application/xhtml+xml',
			},
			redirect: 'follow',
		}, label, controller.signal)
		if (response.status === 202 || response.status === 403 || response.status === 429) {
			throw new SearchChannelError('bot-wall', `${label} 触发反爬或限流（HTTP ${response.status}），稍后再试或换渠道。`, response.status)
		}
		if (!response.ok) throw httpError(label, response.status)
		const html = await response.text()
		if (/captcha|unusual traffic|robot check|access denied|anomaly/i.test(html.slice(0, 6_000))) {
			throw new SearchChannelError('bot-wall', `${label} 返回了反爬验证页，稍后再试或换渠道。`, response.status)
		}
		if (html.length < 500) throw new SearchChannelError('invalid-response', `${label} 返回空页面。`, response.status)
		return html
	} catch (error) {
		if (error instanceof SearchChannelError) throw error
		if (controller.signal.aborted) throw new SearchChannelError('timeout', `${label} 抓取超时。`)
		throw new SearchChannelError('network', `${label} 抓取失败。`)
	} finally {
		clearTimeout(timer)
		signal?.removeEventListener('abort', onAbort)
	}
}

/**
 * Fetch a public HTML page with one retry for transient failures.
 *
 * @param {Function} fetchImpl - Fetch implementation.
 * @param {string} url - Page URL.
 * @param {string} label - Channel label.
 * @param {AbortSignal} [signal] - Caller cancellation.
 * @returns {Promise<string>} HTML.
 */
async function fetchHtmlWithRetry(fetchImpl, url, label, signal) {
	let lastError
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			return await fetchHtmlPage(fetchImpl, url, label, signal)
		} catch (error) {
			lastError = error
			if (attempt === 0 && error instanceof SearchChannelError && error.code !== 'bot-wall' && error.code !== 'timeout') {
				await sleep(700)
				continue
			}
			break
		}
	}
	throw lastError
}

/**
 * Parse an MCP JSON or SSE response.
 *
 * @param {string} text - Response text.
 * @returns {object | null} The last JSON message.
 */
function parseMcpResponse(text) {
	const trimmed = String(text).trim()
	if (trimmed.startsWith('{')) {
		try { return JSON.parse(trimmed) } catch { /* try SSE lines */ }
	}
	let parsed = null
	for (const line of String(text).split(/\r?\n/)) {
		const value = line.trim()
		if (!value.startsWith('data:')) continue
		const payload = value.slice(5).trim()
		if (payload === '' || payload === '[DONE]') continue
		try { parsed = JSON.parse(payload) } catch { /* ignore partial frames */ }
	}
	return parsed
}

/**
 * Read the text blocks of an MCP tools/call result.
 *
 * @param {object | null} payload - MCP response.
 * @param {string} label - Channel label.
 * @returns {string} Joined text.
 */
function mcpToolText(payload, label) {
	if (payload === null || typeof payload !== 'object') {
		throw new SearchChannelError('invalid-response', `${label} MCP 返回格式异常。`)
	}
	if (payload.error !== undefined && payload.error !== null) {
		throw new SearchChannelError('bad-request', `${label} MCP 报错：${textOf(payload.error.message) || '未知错误'}。`)
	}
	const content = payload.result?.content
	if (!Array.isArray(content)) {
		throw new SearchChannelError('invalid-response', `${label} MCP 返回缺少 content。`)
	}
	const text = content.filter((block) => block?.type === 'text' && typeof block.text === 'string').map((block) => block.text).join('\n')
	if (payload.result?.isError === true) {
		throw new SearchChannelError('bad-request', `${label} MCP 搜索失败：${text.slice(0, 200) || '未知错误'}。`)
	}
	return text
}

/**
 * Read an anonymous MCP tools/call response.
 *
 * @param {Function} fetchImpl - Fetch implementation.
 * @param {string} url - MCP endpoint.
 * @param {object} body - JSON-RPC body.
 * @param {string} label - Channel label.
 * @param {AbortSignal} [signal] - Caller cancellation.
 * @returns {Promise<object | null>} Parsed MCP response.
 */
async function fetchMcp(fetchImpl, url, body, label, signal) {
	const response = await fetchResponse(fetchImpl, url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
		},
		body: JSON.stringify(body),
	}, label, signal)
	if (!response.ok) {
		if (response.status === 401 || response.status === 403) {
			throw new SearchChannelError('bot-wall', `${label} 匿名 MCP 被拒绝（HTTP ${response.status}），填 Key 或稍后再试。`, response.status)
		}
		throw httpError(label, response.status)
	}
	return parseMcpResponse(await response.text())
}

/**
 * Parse the labeled text used by Exa and Keenable MCP results.
 *
 * @param {string} text - MCP text blocks.
 * @param {number} limit - Maximum sources.
 * @returns {object[]} Sources.
 */
function parseLabeledMcpSources(text, limit) {
	const sources = []
	for (const block of String(text).split(/\n(?=Title:)/)) {
		const title = block.match(/^Title: (.+)$/m)?.[1]
		const url = block.match(/^URL: (\S+)$/m)?.[1]
		const published = block.match(/^Published: (.+)$/m)?.[1] ?? block.match(/^Acquired: (.+)$/m)?.[1]
		const details = block.split(/^(?:Highlights|Snippets):$/m)[1]
		const snippet = details === undefined
			? ''
			: details.split('\n').filter((line) => line.trim() !== '' && !line.trim().startsWith('...')).slice(0, 3).join(' ')
		if (url === undefined) continue
		pushSource(sources, {
			url,
			title,
			snippet,
			publishedAt: published !== undefined && /^\d{4}-\d{2}-\d{2}/.test(published) ? published : '',
		}, limit)
		if (sources.length >= limit) break
	}
	return sources
}

/**
 * Parse Parallel's MCP JSON-in-text result.
 *
 * @param {string} text - MCP text blocks.
 * @param {number} limit - Maximum sources.
 * @returns {object[]} Sources.
 */
function parseParallelMcpSources(text, limit) {
	const candidates = [text, ...String(text).split(/\r?\n/)]
	let payload = null
	for (const candidate of candidates) {
		try {
			const parsed = JSON.parse(candidate)
			if (Array.isArray(parsed?.results)) { payload = parsed; break }
		} catch { /* not JSON */ }
	}
	if (payload === null) throw new SearchChannelError('invalid-response', 'Parallel MCP 返回格式异常。')
	const sources = []
	for (const result of payload.results) {
		if (sources.length >= limit) break
		pushSource(sources, {
			url: result?.url,
			title: result?.title,
			snippet: Array.isArray(result?.excerpts) ? result.excerpts.find((value) => textOf(value) !== '') ?? '' : '',
			publishedAt: result?.publish_date,
		}, limit)
	}
	return sources
}

//#region adapters

/**
 * Search Bing's public HTML result page.
 *
 * @param {object} options - Query, base URL, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchBing({ query, maxResults, timeRange = '', baseUrl, signal, fetchImpl }) {
	const limit = clampCount(maxResults, 10, 1, 20)
	const url = new URL(joinUrl(baseOf(baseUrl, 'https://www.bing.com'), '/search'))
	url.searchParams.set('q', query)
	url.searchParams.set('count', String(limit))
	url.searchParams.set('adlt', 'off')
	const ez = { day: 'ez1', week: 'ez2', month: 'ez3' }[timeRange]
	if (ez !== undefined) url.searchParams.set('filters', `ex1:"${ez}"`)
	const html = await fetchHtmlWithRetry(fetchImpl, url, 'Bing', signal)
	const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) ?? []
	const sources = []
	for (const block of blocks) {
		if (sources.length >= limit) break
		const href = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"/)?.[1]
		const title = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>[\s\S]*?<\/h2>/)?.[1]
		const snippet = block.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1]
		if (href === undefined) continue
		pushSource(sources, {
			url: extractBingUrl(href),
			title: title === undefined ? '' : stripHtml(title),
			snippet: snippet === undefined ? '' : stripHtml(snippet),
		}, limit)
	}
	if (sources.length > 0 && !looksRelevant(query, sources)) return { sources: [] }
	return { sources }
}

/**
 * Parse DuckDuckGo HTML result blocks.
 *
 * @param {string} html - Result page.
 * @param {number} limit - Maximum sources.
 * @returns {object[]} Sources.
 */
function parseDdgHtml(html, limit) {
	const blocks = html.match(/<div class="result results_links[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g) ?? []
	const sources = []
	for (const block of blocks) {
		if (sources.length >= limit) break
		const href = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]*)"/)?.[1]
		const title = block.match(/<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/)?.[1]
		const snippet = block.match(/<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/)?.[1]
		if (href === undefined) continue
		pushSource(sources, {
			url: extractDdgUrl(href),
			title: title === undefined ? '' : stripHtml(title),
			snippet: snippet === undefined ? '' : stripHtml(snippet),
		}, limit)
	}
	return sources
}

/**
 * Parse the DuckDuckGo Lite result table.
 *
 * @param {string} html - Result page.
 * @param {number} limit - Maximum sources.
 * @returns {object[]} Sources.
 */
function parseDdgLite(html, limit) {
	const links = html.match(/<a[^>]*class=['"]result-link['"][^>]*>[\s\S]*?<\/a>/g) ?? []
	const snippets = html.match(/class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/g) ?? []
	const sources = []
	for (let index = 0; index < links.length && sources.length < limit; index += 1) {
		const href = links[index].match(/href="([^"]*)"/)?.[1]
		const title = links[index].match(/class=['"]result-link['"][^>]*>(.*?)<\/a>/)?.[1]
		if (href === undefined) continue
		pushSource(sources, {
			url: extractDdgUrl(href),
			title: title === undefined ? '' : stripHtml(title),
			snippet: snippets[index] === undefined ? '' : stripHtml(snippets[index].replace(/^class=['"]result-snippet['"][^>]*>/, '')),
		}, limit)
	}
	return sources
}

/**
 * Search DuckDuckGo's HTML endpoint, falling back to Lite.
 *
 * @param {object} options - Query, base URL, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchDdg({ query, maxResults, timeRange = '', baseUrl, signal, fetchImpl }) {
	const limit = clampCount(maxResults, 10, 1, 20)
	const base = baseOf(baseUrl, 'https://html.duckduckgo.com')
	const htmlUrl = new URL(joinUrl(base, '/html/'))
	htmlUrl.searchParams.set('q', query)
	htmlUrl.searchParams.set('adlt', '-1')
	const df = { day: 'd', week: 'w', month: 'm', year: 'y' }[timeRange]
	if (df !== undefined) htmlUrl.searchParams.set('df', df)
	let htmlError
	let htmlSucceeded = false
	let sources = []
	try {
		const html = await fetchHtmlWithRetry(fetchImpl, htmlUrl, 'DuckDuckGo', signal)
		sources = parseDdgHtml(html, limit)
		htmlSucceeded = true
	} catch (error) {
		htmlError = error
	}
	if (sources.length === 0) {
		const liteBase = textOf(baseUrl) === '' ? 'https://lite.duckduckgo.com' : base
		const liteUrl = new URL(joinUrl(liteBase, '/lite/'))
		liteUrl.searchParams.set('q', query)
		liteUrl.searchParams.set('adlt', '-1')
		if (df !== undefined) liteUrl.searchParams.set('df', df)
		try {
			const html = await fetchHtmlWithRetry(fetchImpl, liteUrl, 'DuckDuckGo Lite', signal)
			const liteSources = parseDdgLite(html, limit)
			if (liteSources.length > 0 || htmlError === undefined) return { sources: liteSources }
		} catch (error) {
			if (!htmlSucceeded) htmlError = error
		}
	}
	if (!htmlSucceeded && htmlError !== undefined) throw htmlError
	return { sources }
}

/**
 * Search AnySearch's anonymous JSON endpoint.
 *
 * @param {object} options - Query, key, base URL, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchAnysearch({ query, maxResults, apiKey, baseUrl, signal, fetchImpl }) {
	const limit = clampCount(maxResults, 10, 1, 20)
	const key = textOf(apiKey)
	const endpoint = joinUrl(baseOf(baseUrl, 'https://api.anysearch.com'), '/v1/search')
	const headers = key === '' ? {} : { authorization: `Bearer ${key}` }
	let raw
	try {
		raw = await postJson(fetchImpl, endpoint, headers, { query, max_results: limit }, 'AnySearch', signal)
	} catch (error) {
		if (!(error instanceof SearchChannelError) || error.code !== 'auth') throw error
		// A stale optional key must not disable the anonymous tier.
		if (key === '') throw freeTierBlocked('AnySearch', error)
		try {
			raw = await postJson(fetchImpl, endpoint, {}, { query, max_results: limit }, 'AnySearch', signal)
		} catch (fallbackError) {
			if (fallbackError instanceof SearchChannelError && fallbackError.code === 'auth') throw freeTierBlocked('AnySearch', fallbackError)
			throw fallbackError
		}
	}
	if (raw?.code !== 0) {
		const message = textOf(raw?.message) || `错误码 ${String(raw?.code ?? '')}`
		throw new SearchChannelError('bad-request', `AnySearch 搜索失败：${message}。`)
	}
	const sources = []
	for (const result of raw?.data?.results ?? []) {
		pushSource(sources, {
			url: result?.url,
			title: result?.title,
			snippet: result?.snippet,
		}, limit)
	}
	return { sources }
}

/**
 * Search Exa through its anonymous MCP endpoint.
 *
 * @param {object} options - Query, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchExaMcp({ query, maxResults, signal, fetchImpl }) {
	const limit = clampCount(maxResults, 10, 1, 20)
	const payload = await fetchMcp(fetchImpl, 'https://mcp.exa.ai/mcp', {
		jsonrpc: '2.0',
		id: Date.now(),
		method: 'tools/call',
		params: { name: 'web_search_exa', arguments: { query, numResults: limit } },
	}, 'Exa', signal)
	return { sources: parseLabeledMcpSources(mcpToolText(payload, 'Exa'), limit) }
}

/**
 * Search Parallel through its anonymous MCP endpoint.
 *
 * @param {object} options - Query, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchParallelMcp({ query, maxResults, timeRange = '', signal, fetchImpl }) {
	const limit = clampCount(maxResults, 10, 1, 20)
	const objective = timeRange === '' ? query : `${query} (prefer results published after ${isoDaysAgo(TIME_RANGE_DAYS[timeRange])})`
	const payload = await fetchMcp(fetchImpl, 'https://search.parallel.ai/mcp', {
		jsonrpc: '2.0',
		id: Date.now(),
		method: 'tools/call',
		params: {
			name: 'web_search',
			arguments: {
				objective,
				search_queries: [query],
				session_id: `dsh-manager-${Math.random().toString(16).slice(2)}`,
			},
		},
	}, 'Parallel', signal)
	return { sources: parseParallelMcpSources(mcpToolText(payload, 'Parallel'), limit) }
}

/**
 * Search Keenable through its anonymous MCP endpoint.
 *
 * @param {object} options - Query, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchKeenableMcp({ query, maxResults, timeRange = '', signal, fetchImpl }) {
	const limit = clampCount(maxResults, 10, 1, 20)
	const arguments_ = { query }
	if (timeRange !== '') arguments_.published_after = { day: '1d', week: '7d', month: '1mo', year: '1y' }[timeRange]
	const payload = await fetchMcp(fetchImpl, 'https://api.keenable.ai/mcp', {
		jsonrpc: '2.0',
		id: Date.now(),
		method: 'tools/call',
		params: { name: 'search_web_pages', arguments: arguments_ },
	}, 'Keenable', signal)
	return { sources: parseLabeledMcpSources(mcpToolText(payload, 'Keenable'), limit) }
}

/**
 * Search Exa.
 *
 * @param {object} options - Query, key, base URL, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchExa(options) {
	const key = textOf(options.apiKey)
	if (key === '') return searchExaMcp(options)
	return searchExaRest({ ...options, apiKey: key })
}

/**
 * Search Exa's REST API with a key.
 *
 * @param {object} options - Query, key, base URL, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchExaRest({ query, maxResults, timeRange = '', apiKey, baseUrl, signal, fetchImpl }) {
	const limit = clampCount(maxResults, 10, 1, 25)
	const body = {
		query,
		type: 'auto',
		numResults: limit,
		contents: { highlights: true },
	}
	if (timeRange !== '') body.startPublishedDate = isoDaysAgo(TIME_RANGE_DAYS[timeRange])
	const raw = await postJson(fetchImpl, joinUrl(baseOf(baseUrl, 'https://api.exa.ai'), '/search'), {
		'x-api-key': apiKey,
	}, body, 'Exa', signal)
	return { sources: parseExaSearch(raw, limit) }
}

/**
 * Search Tavily.
 *
 * @param {object} options - Query, key, base URL, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchTavily({ query, maxResults, timeRange = '', apiKey, baseUrl, signal, fetchImpl }) {
	const key = textOf(apiKey)
	const limit = clampCount(maxResults, 10, 1, 20)
	const body = {
		query,
		max_results: limit,
		include_answer: false,
		search_depth: 'basic',
	}
	if (timeRange !== '') body.time_range = timeRange
	let raw
	try {
		raw = await postJson(fetchImpl, joinUrl(baseOf(baseUrl, 'https://api.tavily.com'), '/search'), key === ''
			? { 'x-tavily-access-mode': 'keyless' }
			: { authorization: `Bearer ${key}` }, body, 'Tavily', signal)
	} catch (error) {
		if (key === '' && error instanceof SearchChannelError && error.code === 'auth') throw freeTierBlocked('Tavily', error)
		throw error
	}
	return { sources: parseTavilySearch(raw, limit) }
}

/**
 * Search Firecrawl.
 *
 * @param {object} options - Query, key, base URL, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchFirecrawl({ query, maxResults, timeRange = '', apiKey, baseUrl, signal, fetchImpl }) {
	const key = textOf(apiKey)
	const limit = clampCount(maxResults, 10, 1, 20)
	const body = { query, limit }
	if (timeRange !== '') body.tbs = `qdr:${ { day: 'd', week: 'w', month: 'm', year: 'y' }[timeRange] }`
	let raw
	try {
		raw = await postJson(fetchImpl, joinUrl(baseOf(baseUrl, 'https://api.firecrawl.dev/v2'), '/search'), key === ''
			? {}
			: { authorization: `Bearer ${key}` }, body, 'Firecrawl', signal)
	} catch (error) {
		if (key === '' && error instanceof SearchChannelError && (error.status === 401 || error.status === 403)) {
			throw new SearchChannelError('bot-wall', 'Firecrawl 免费档被当前网络拒绝；填 API Key 或稍后再试。', error.status)
		}
		throw error
	}
	return { sources: parseFirecrawlSearch(raw, limit) }
}

/**
 * Search Parallel.
 *
 * @param {object} options - Query, key, base URL, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchParallel(options) {
	const key = textOf(options.apiKey)
	if (key === '') return searchParallelMcp(options)
	return searchParallelRest({ ...options, apiKey: key })
}

/**
 * Search Parallel's REST API with a key.
 *
 * @param {object} options - Query, key, base URL, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchParallelRest({ query, maxResults, timeRange = '', apiKey, baseUrl, signal, fetchImpl }) {
	const limit = clampCount(maxResults, 10, 1, 20)
	const cleanQuery = query.replace(/\s+/g, ' ').trim().slice(0, 200)
	const advanced = { max_results: limit }
	if (timeRange !== '') advanced.source_policy = { after_date: isoDaysAgo(TIME_RANGE_DAYS[timeRange]) }
	const raw = await postJson(fetchImpl, joinUrl(baseOf(baseUrl, 'https://api.parallel.ai/v1'), '/search'), {
		'x-api-key': apiKey,
	}, {
		objective: query,
		search_queries: [cleanQuery],
		mode: 'advanced',
		advanced_settings: advanced,
	}, 'Parallel', signal)
	return { sources: parseParallelSearch(raw, limit) }
}

/**
 * Search Brave, preferring LLM Context and falling back to classic Web Search.
 *
 * @param {object} options - Query, key, base URL, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchBrave({ query, maxResults, timeRange = '', apiKey, baseUrl, signal, fetchImpl }) {
	const key = requireKey(apiKey, 'Brave')
	const limit = clampCount(maxResults, 10, 1, 50)
	const base = baseOf(baseUrl, 'https://api.search.brave.com/res/v1')
	const headers = { 'x-subscription-token': key }
	const freshness = { day: 'pd', week: 'pw', month: 'pm', year: 'py' }[timeRange]
	const contextResponse = await fetchResponse(fetchImpl, joinUrl(base, '/llm/context'), {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
		body: JSON.stringify({
			q: query,
			count: Math.max(limit, 20),
			maximum_number_of_urls: limit,
			...(freshness === undefined ? {} : { freshness }),
		}),
	}, 'Brave', signal)
	if (contextResponse.ok) {
		const raw = await readJson(contextResponse, 'Brave')
		return { sources: parseBraveContext(raw, limit) }
	}
	if (contextResponse.status !== 403 && contextResponse.status !== 404) {
		throw httpError('Brave', contextResponse.status)
	}
	const classicUrl = new URL(joinUrl(base, '/web/search'))
	classicUrl.searchParams.set('q', query)
	classicUrl.searchParams.set('count', String(Math.max(limit, 20)))
	if (freshness !== undefined) classicUrl.searchParams.set('freshness', freshness)
	const raw = await getJson(fetchImpl, classicUrl, headers, 'Brave', signal)
	return { sources: parseBraveWeb(raw, limit) }
}

/**
 * Search You.com.
 *
 * @param {object} options - Query, key, base URL, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchYou(options) {
	const key = textOf(options.apiKey)
	if (key === '') return searchYouKeyless(options)
	return searchYouKeyed({ ...options, apiKey: key })
}

/**
 * Search You.com with a key.
 *
 * @param {object} options - Query, key, base URL, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchYouKeyed({ query, maxResults, apiKey, baseUrl, signal, fetchImpl }) {
	const limit = clampCount(maxResults, 10, 1, 20)
	const raw = await postJson(fetchImpl, joinUrl(baseOf(baseUrl, 'https://ydc-index.io/v1'), '/search'), {
		'x-api-key': apiKey,
	}, {
		query,
		count: limit,
		extraction: { extraction_mode: 'highlights' },
	}, 'You.com', signal)
	return { sources: parseYouSearch(raw, limit) }
}

/**
 * Search You.com's daily free tier.
 *
 * @param {object} options - Query, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchYouKeyless({ query, maxResults, signal, fetchImpl }) {
	const limit = clampCount(maxResults, 10, 1, 20)
	const url = new URL('https://api.you.com/v1/agents/search')
	url.searchParams.set('query', query)
	url.searchParams.set('count', String(limit))
	const response = await fetchResponse(fetchImpl, url, { headers: { accept: 'application/json' } }, 'You.com', signal)
	if (response.status === 429) {
		throw new SearchChannelError('rate-limit', 'You.com 免费档被限流，填 API Key 可提高额度。', 429)
	}
	let raw
	try {
		raw = await readJson(response, 'You.com')
	} catch (error) {
		if (error instanceof SearchChannelError && error.code === 'auth') throw freeTierBlocked('You.com', error)
		throw error
	}
	return { sources: parseYouSearch(raw, limit) }
}

/**
 * Search Jina.
 *
 * @param {object} options - Query, key, base URL, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchJina({ query, maxResults, apiKey, baseUrl, signal, fetchImpl }) {
	const key = requireKey(apiKey, 'Jina')
	const limit = clampCount(maxResults, 10, 1, 20)
	const base = trimBase(baseOf(baseUrl, 'https://s.jina.ai'))
	const url = `${base}/${encodeURIComponent(query)}?count=${limit}`
	const raw = await getJson(fetchImpl, url, { authorization: `Bearer ${key}` }, 'Jina', signal)
	return { sources: parseJinaSearch(raw, limit) }
}

/**
 * Search Keenable.
 *
 * @param {object} options - Query, key, base URL, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchKeenable(options) {
	const key = textOf(options.apiKey)
	if (key === '') return searchKeenableMcp(options)
	return searchKeenableRest({ ...options, apiKey: key })
}

/**
 * Search Keenable's REST API with a key.
 *
 * @param {object} options - Query, key, base URL, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchKeenableRest({ query, maxResults, timeRange = '', apiKey, baseUrl, signal, fetchImpl }) {
	const limit = clampCount(maxResults, 10, 1, 20)
	const body = { query, max_results: limit }
	if (timeRange !== '') body.published_after = { day: '1d', week: '7d', month: '1mo', year: '1y' }[timeRange]
	const raw = await postJson(fetchImpl, joinUrl(baseOf(baseUrl, 'https://api.keenable.ai/v1'), '/search'), {
		'x-api-key': apiKey,
		'x-keenable-title': 'dsh-manager',
	}, body, 'Keenable', signal)
	return { sources: parseKeenableSearch(raw, limit) }
}

/**
 * Search SearXNG.
 *
 * A key containing a colon is treated as `user:password` HTTP Basic; any
 * other key is forwarded as the instance's `api_key` query parameter.
 *
 * @param {object} options - Query, key, base URL, signal, fetch.
 * @returns {Promise<{sources: object[], content?: string}>} Sources and an optional answer.
 */
async function searchSearxng({ query, maxResults, timeRange = '', apiKey, baseUrl, signal, fetchImpl }) {
	const limit = clampCount(maxResults, 10, 1, 20)
	const base = baseOf(baseUrl, 'http://127.0.0.1:8080')
	const url = new URL(joinUrl(base, '/search'))
	url.searchParams.set('q', query)
	url.searchParams.set('format', 'json')
	url.searchParams.set('safesearch', '0')
	if (timeRange !== '') url.searchParams.set('time_range', timeRange)
	const headers = {}
	const key = textOf(apiKey)
	if (key !== '') {
		const separator = key.indexOf(':')
		if (separator > 0) {
			headers.authorization = `Basic ${Buffer.from(key, 'utf8').toString('base64')}`
		} else {
			url.searchParams.set('api_key', key)
		}
	}
	const response = await fetchResponse(fetchImpl, url, { headers }, 'SearXNG', signal)
	const raw = await readJson(response, 'SearXNG')
	const parsed = parseSearxngSearch(raw, limit)
	return parsed.content === '' ? { sources: parsed.sources } : parsed
}

/**
 * Normalize MiniMax's `/v1/coding_plan/search` response.
 *
 * @param {unknown} body - Response body.
 * @param {number} limit - Maximum sources.
 * @returns {object[]} Sources.
 */
export function parseMinimaxSearch(body, limit) {
	const organic = Array.isArray(body?.organic) ? body.organic : []
	const sources = []
	for (const item of organic) {
		if (sources.length >= limit) break
		pushSource(sources, {
			url: item?.link,
			title: item?.title,
			snippet: item?.snippet,
			publishedAt: item?.date,
		}, limit)
	}
	return sources
}

/**
 * Turn a MiniMax `base_resp` into a classified error.
 *
 * MiniMax returns HTTP 200 with a non-zero `base_resp.status_code` for
 * plan/quota/safety failures, so the status must be checked explicitly.
 *
 * @param {unknown} body - Response body.
 * @returns {void}
 */
function assertMinimaxOk(body) {
	const response = body?.base_resp
	if (response === null || typeof response !== 'object') return
	const status = typeof response.status_code === 'number' ? response.status_code : Number(response.status_code)
	if (!Number.isFinite(status) || status === 0) return
	const message = textOf(response.status_msg)
	if (status === 2049 || status === 1004) {
		throw new SearchChannelError('auth', `MiniMax：${message || 'API Key 无效'}（${status}）。`, 200)
	}
	if (status === 1002 || status === 1039) {
		throw new SearchChannelError('bad-request', `MiniMax：${message || '内容被安全策略拦截'}（${status}）。`)
	}
	if (status === 1028 || status === 1030 || status === 2061) {
		throw new SearchChannelError('quota', `MiniMax：${message || '额度或套餐不足'}（${status}）。`)
	}
	throw new SearchChannelError('bad-request', `MiniMax：${message || '搜索失败'}（${status}）。`)
}

/**
 * Normalize DeepSeek's Anthropic-compatible Messages response.
 *
 * DeepSeek's native search is a model turn: the response carries
 * `web_search_tool_result` blocks with result URLs, while the cited excerpts
 * live in separate `text` blocks' `citations[]`.
 *
 * @param {unknown} body - Messages response body.
 * @param {number} limit - Maximum sources.
 * @returns {object[]} Sources.
 */
export function parseDeepseekSearch(body, limit) {
	const blocks = Array.isArray(body?.content) ? body.content : []
	const snippets = new Map()
	for (const block of blocks) {
		if (block?.type !== 'text' || !Array.isArray(block.citations)) continue
		for (const citation of block.citations) {
			const url = textOf(citation?.url)
			const text = textOf(citation?.cited_text)
			if (url !== '' && text !== '' && !snippets.has(url)) snippets.set(url, text)
		}
	}
	const resultBlocks = blocks.filter((block) => block?.type === 'web_search_tool_result')
	if (resultBlocks.length === 0) {
		throw new SearchChannelError('invalid-response', 'DeepSeek 响应里没有 web_search_tool_result；请求可能没有触发联网搜索。')
	}
	const sources = []
	for (const block of resultBlocks) {
		if (!Array.isArray(block.content)) {
			const code = textOf(block.content?.error_code)
			throw new SearchChannelError('bad-request', `DeepSeek 搜索工具报错${code === '' ? '' : `：${code}`}。`)
		}
		for (const item of block.content) {
			if (sources.length >= limit) return sources
			if (item?.type !== 'web_search_result') continue
			pushSource(sources, {
				url: item?.url,
				title: item?.title,
				snippet: snippets.get(textOf(item?.url)) || '',
				publishedAt: item?.page_age,
			}, limit)
		}
	}
	return sources
}

/**
 * Search DeepSeek through the Anthropic-compatible Messages endpoint with the
 * native `web_search_20250305` server tool.
 *
 * @param {object} options - Query, key, base URL, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchDeepseek({ query, maxResults, apiKey, baseUrl, signal, fetchImpl }) {
	const key = requireKey(apiKey, 'DeepSeek')
	const limit = clampCount(maxResults, 10, 1, 20)
	const endpoint = joinUrl(baseOf(baseUrl, 'https://api.deepseek.com/anthropic/v1'), '/messages')
	const body = {
		model: 'deepseek-v4-flash',
		max_tokens: 4096,
		messages: [{
			role: 'user',
			content: [{ type: 'text', text: `Perform a web search for the query: ${query}` }],
		}],
		tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
		thinking: { type: 'disabled' },
	}
	const response = await fetchResponse(fetchImpl, endpoint, {
		method: 'POST',
		redirect: 'error',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json',
			'anthropic-version': '2023-06-01',
			'x-api-key': key,
			authorization: `Bearer ${key}`,
		},
		body: JSON.stringify(body),
	}, 'DeepSeek', signal)
	const raw = await readJson(response, 'DeepSeek')
	if (raw?.error !== undefined && raw?.error !== null) {
		throw new SearchChannelError('bad-request', `DeepSeek：${textOf(raw.error.message) || '搜索请求失败'}。`)
	}
	return { sources: parseDeepseekSearch(raw, limit) }
}

/**
 * Search MiniMax's Token Plan web-search endpoint.
 *
 * @param {object} options - Query, key, base URL, signal, fetch.
 * @returns {Promise<{sources: object[]}>} Sources.
 */
async function searchMinimax({ query, maxResults, apiKey, baseUrl, signal, fetchImpl }) {
	const key = requireKey(apiKey, 'MiniMax')
	const limit = clampCount(maxResults, 10, 1, 10)
	const explicit = textOf(baseUrl) !== ''
	const cacheKey = explicit ? '' : createHash('sha256').update(key).digest('hex')
	const cached = explicit ? '' : minimaxRegionCache.get(cacheKey)
	const candidates = explicit
		? [baseOf(baseUrl, MINIMAX_GLOBAL_BASE)]
		: cached !== undefined && cached !== '' ? [cached] : [MINIMAX_GLOBAL_BASE, MINIMAX_CN_BASE]
	let authError
	for (let index = 0; index < candidates.length; index += 1) {
		try {
			const raw = await postJson(
				fetchImpl,
				joinUrl(candidates[index], '/v1/coding_plan/search'),
				{ authorization: `Bearer ${key}` },
				{ q: query },
				'MiniMax',
				signal,
			)
			assertMinimaxOk(raw)
			if (!explicit) {
				if (minimaxRegionCache.size > 32) minimaxRegionCache.clear()
				minimaxRegionCache.set(cacheKey, candidates[index])
			}
			return { sources: parseMinimaxSearch(raw, limit) }
		} catch (error) {
			const isAuth = error instanceof SearchChannelError && error.code === 'auth'
			if (!isAuth) throw error
			authError = error
			if (index < candidates.length - 1) continue
			if (candidates.length > 1) {
				throw new SearchChannelError('auth', 'MiniMax：Key 在 global 和 cn 两个区域都被拒绝，检查 Key 是否属于 MiniMax Token Plan。', error.status)
			}
			throw error
		}
	}
	throw authError
}


//#endregion
