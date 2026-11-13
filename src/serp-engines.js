/**
 * Keyless Chinese HTML SERP channels.
 *
 * These engines have no API: they are ordinary result pages parsed from HTML.
 * They are cheap and replaceable, so each request is a single shot; anti-bot
 * interstitials are classified as `bot-wall` and cooled down like any other
 * rate limit. The parsers are deliberately tolerant — when the structured
 * blocks change they fall back to harvesting plausible result anchors and
 * dropping the engine's own chrome.
 *
 * The URL templates and parser shapes follow dsh-free-search's HTML SERP
 * family (MIT), trimmed to the five engines the manager ships.
 *
 * @module dsh-manager/serp-engines
 */

import { SearchChannelError } from './search-error.js'
import { truncateText } from './safe-text.js'

/** Desktop user agent; Chinese SERPs serve the desktop layout to it. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Result cap per engine. */
const MAX_RESULTS = 20

/** HTML entity map for the common cases. */
const ENTITIES = {
	amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
	ensp: ' ', emsp: ' ', thinsp: ' ', middot: '·', mdash: '—', ndash: '–',
	hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
	laquo: '«', raquo: '»', times: '×', divide: '÷', copy: '©', reg: '®', trade: '™',
	deg: '°', '#39': "'", '#x27': "'", '#x2F': '/', '#46': '.', '#58': ':',
}

/** Browser-chrome and ad hosts that show up on nearly every SERP. */
const CHROME_HOSTS = [
	'microsoft.com', 'msn.com', 'msn.cn', 'google.com', 'gstatic.com', 'googleusercontent.com',
	'mozilla.org', 'apple.com', 'adobe.com',
]

/** Pure navigation labels are not results. */
const NAV_TITLES = /^(登录|注册|首页|主页|更多|下载|试试|帮助|反馈|设置|关于我们|Edge|Chrome|Firefox|Safari|MSN)$/i

/**
 * Decode numeric and named HTML entities.
 *
 * @param {string} input - HTML.
 * @returns {string} Text.
 */
export function decodeEntities(input) {
	return String(input).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, name) => {
		const key = name.toLowerCase()
		if (Object.hasOwn(ENTITIES, key)) return ENTITIES[key]
		if (key.startsWith('#x')) {
			const code = Number.parseInt(key.slice(2), 16)
			return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match
		}
		if (key.startsWith('#')) {
			const code = Number.parseInt(key.slice(1), 10)
			return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match
		}
		return match
	})
}

/**
 * Strip tags and collapse whitespace.
 *
 * @param {string} html - HTML fragment.
 * @returns {string} Text.
 */
export function stripTags(html) {
	return decodeEntities(
		String(html ?? '')
			.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
			.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
			.replace(/<[^>]*>/g, ' '),
	).replace(/\s+/g, ' ').trim()
}

/**
 * Clip a title.
 *
 * @param {string} value - Raw title.
 * @returns {string} Cleaned title.
 */
function cleanTitle(value) {
	return truncateText(stripTags(value).replace(/^[\s\-–—|·•]+|[\s\-–—|·•]+$/g, ''), 240)
}

/**
 * Clip a snippet.
 *
 * @param {string} value - Raw snippet.
 * @returns {string} Cleaned snippet.
 */
function cleanSnippet(value) {
	return truncateText(stripTags(value), 400)
}

/**
 * Turn a protocol-relative href into an absolute one.
 *
 * @param {string} value - href.
 * @returns {string} Absolute URL or the original text.
 */
function unescapeAttr(value) {
	return decodeEntities(String(value ?? '')).replace(/^\/\//, 'https://')
}

/**
 * Keep one parsed result.
 *
 * @param {object[]} target - Output list.
 * @param {Set<string>} seen - URL set.
 * @param {string} title - Raw title.
 * @param {string} url - Raw URL.
 * @param {string} snippet - Raw snippet.
 * @returns {void}
 */
function pushResult(target, seen, title, url, snippet) {
	const clean = cleanTitle(title)
	const href = unescapeAttr(url)
	if (clean === '' || clean.length < 2 || !/^https?:\/\//i.test(href)) return
	if (seen.has(href)) return
	seen.add(href)
	target.push({ title: clean, url: href, snippet: cleanSnippet(snippet ?? '') })
}

/**
 * Host of a URL.
 *
 * @param {string} url - URL.
 * @returns {string} Lower-case host, or an empty string.
 */
function hostOf(url) {
	try {
		return new URL(url).hostname.toLowerCase()
	} catch {
		return ''
	}
}

/**
 * Harvest plausible result anchors and drop the engine's own chrome.
 *
 * @param {string} html - Page.
 * @param {string[]} [ignoreHosts] - Additional hosts to drop.
 * @returns {object[]} Results.
 */
function parseGeneric(html, ignoreHosts = []) {
	const results = []
	const seen = new Set()
	const ignored = [...ignoreHosts, ...CHROME_HOSTS]
	const anchor = /<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
	let match
	while ((match = anchor.exec(html)) !== null) {
		const href = unescapeAttr(match[1])
		if (!/^https?:\/\//i.test(href)) continue
		const host = hostOf(href)
		if (host === '' || ignored.some((entry) => host === entry || host.endsWith(`.${entry}`))) continue
		if (/\.(png|jpe?g|gif|svg|ico|css|js|woff2?)(\?|$)/i.test(href)) continue
		if (NAV_TITLES.test(cleanTitle(match[2]))) continue
		pushResult(results, seen, match[2], href, '')
		if (results.length >= MAX_RESULTS) break
	}
	return results
}

/**
 * Baidu: `div.result` blocks; the real target often lives in `mu="..."`.
 *
 * @param {string} html - Page.
 * @param {number} limit - Cap.
 * @returns {object[]} Results.
 */
export function parseBaidu(html, limit = MAX_RESULTS) {
	const results = []
	const seen = new Set()
	const blocks = html.split(/<div[^>]+class="result[\s"]/i).slice(1)
	for (const block of blocks) {
		const mu = /\bmu="([^"]+)"/i.exec(block)
		const link = /<h3[^>]*>[\s\S]*?<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
		if (link === null && mu === null) continue
		const snippet = /class="[^"]*content-right[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block)
		pushResult(results, seen, link?.[2] ?? mu?.[1] ?? '', mu?.[1] ?? link?.[1] ?? '', snippet?.[1] ?? '')
		if (results.length >= limit) break
	}
	return results.length > 0 ? results.slice(0, limit) : parseGeneric(html, ['baidu.com', 'bdstatic.com']).slice(0, limit)
}

/**
 * 360 / so.com: `li.res-list` blocks.
 *
 * @param {string} html - Page.
 * @param {number} limit - Cap.
 * @returns {object[]} Results.
 */
export function parseSo360(html, limit = MAX_RESULTS) {
	const results = []
	const seen = new Set()
	const blocks = html.split(/<li\s+class="res-list/i).slice(1)
	for (const block of blocks) {
		const link = /<h3[^>]*>[\s\S]*?<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
		if (link === null) continue
		const snippet = /<p\b[^>]*class="[^"]*res-desc[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(block)
			?? /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(block)
		pushResult(results, seen, link[2], link[1], snippet?.[1] ?? '')
		if (results.length >= limit) break
	}
	return results.length > 0 ? results.slice(0, limit) : parseGeneric(html, ['so.com', '360.cn', 'qhimg.com']).slice(0, limit)
}

/**
 * Sogou: `div.vrwrap` blocks; links are relative `/link?url=...`.
 *
 * @param {string} html - Page.
 * @param {number} limit - Cap.
 * @returns {object[]} Results.
 */
export function parseSogou(html, limit = MAX_RESULTS) {
	const results = []
	const seen = new Set()
	const blocks = html.split(/<div[^>]+class="vrwrap"/i).slice(1)
	for (const block of blocks) {
		const link = /<h3[^>]*>[\s\S]*?<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
		if (link === null) continue
		const href = link[1].startsWith('/') ? `https://www.sogou.com${link[1]}` : link[1]
		pushResult(results, seen, link[2], href, '')
		if (results.length >= limit) break
	}
	return results.length > 0 ? results.slice(0, limit) : parseGeneric(html, ['sogou.com', 'sogoucdn.com']).slice(0, limit)
}

/**
 * Sogou WeChat vertical: signed `/link?url=...` redirects are kept as-is.
 *
 * @param {string} html - Page.
 * @param {number} limit - Cap.
 * @returns {object[]} Results.
 */
export function parseWechat(html, limit = MAX_RESULTS) {
	const results = []
	const seen = new Set()
	const blocks = html.split(/<li[^>]+id="sogou_vr_11002601_box/i).slice(1)
	for (const block of blocks) {
		const link = /<h3[^>]*>[\s\S]*?<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
		if (link === null) continue
		const href = link[1].startsWith('/') ? `https://weixin.sogou.com${link[1]}` : link[1]
		pushResult(results, seen, link[2], href, '')
		if (results.length >= limit) break
	}
	if (results.length > 0) return results.slice(0, limit)
	const anchor = /<a\b[^>]*href\s*=\s*"(https?:\/\/mp\.weixin\.qq\.com\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
	let match
	while ((match = anchor.exec(html)) !== null) {
		pushResult(results, seen, match[2], match[1], '')
		if (results.length >= limit) break
	}
	return results.slice(0, limit)
}

/**
 * Toutiao: hits live in an embedded JSON island, not in anchors.
 *
 * @param {string} html - Page.
 * @param {number} limit - Cap.
 * @returns {object[]} Results.
 */
export function parseToutiao(html, limit = MAX_RESULTS) {
	const results = []
	const seen = new Set()
	const decode = (value) => cleanTitle(value.replace(/\\u003c\/?em\\u003e/gi, '').replace(/\\u002f/gi, '/').replace(/\\"/g, '"'))
	let match
	const forward = /"title":"((?:[^"\\]|\\.)*)"[\s\S]{0,4000}?"article_url":"https?:\/\/toutiao\.com\/group\/(\d+)/g
	while ((match = forward.exec(html)) !== null) {
		pushResult(results, seen, decode(match[1]), `https://www.toutiao.com/group/${match[2]}/`, '')
		if (results.length >= limit) break
	}
	const backward = /"article_url":"https?:\/\/toutiao\.com\/group\/(\d+)[^"]*"[\s\S]{0,2000}?"title":"((?:[^"\\]|\\.)*)"/g
	while ((match = backward.exec(html)) !== null) {
		pushResult(results, seen, decode(match[2]), `https://www.toutiao.com/group/${match[1]}/`, '')
		if (results.length >= limit) break
	}
	return results.length > 0
		? results.slice(0, limit)
		: parseGeneric(html, ['toutiao.com', 'zjurl.cn', 'bytedance.com', 'snssdk.com', 'ixigua.com']).slice(0, limit)
}

/** Anti-bot and interstitial markers. */
const BLOCK_MARKERS = [
	/\bcaptcha\b/i,
	/unusual traffic/i,
	/are you a robot/i,
	/verify you are human/i,
	/访问异常/,
	/安全验证/,
	/验证码/,
	/人机校/,
	/请开启\s*javascript/i,
	/enable javascript/i,
]

/** The five engines this module ships. */
export const SERP_ENGINES = [
	{
		id: 'baidu-html',
		label: '百度网页',
		description: '百度网页搜索 HTML 抓取，无需 Key；可能触发安全验证。',
		url: (query) => `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=20`,
		acceptLanguage: 'zh-CN,zh;q=0.9',
		parse: parseBaidu,
		timeFilter: '',
	},
	{
		id: 'so360',
		label: '360 搜索',
		description: '360 网页搜索 HTML 抓取，无需 Key；中文结果覆盖较好。',
		url: (query) => `https://www.so.com/s?q=${encodeURIComponent(query)}`,
		acceptLanguage: 'zh-CN,zh;q=0.9',
		parse: parseSo360,
		timeFilter: 'bing',
	},
	{
		id: 'sogou',
		label: '搜狗',
		description: '搜狗网页搜索 HTML 抓取，无需 Key；链接多为跳转地址。',
		url: (query) => `https://www.sogou.com/web?query=${encodeURIComponent(query)}`,
		acceptLanguage: 'zh-CN,zh;q=0.9',
		parse: parseSogou,
		timeFilter: 'bing',
	},
	{
		id: 'wechat',
		label: '微信文章',
		description: '搜狗微信文章搜索，无需 Key；结果链接是单次签名跳转。',
		url: (query) => `https://wx.sogou.com/weixin?type=2&query=${encodeURIComponent(query)}`,
		acceptLanguage: 'zh-CN,zh;q=0.9',
		parse: parseWechat,
		timeFilter: '',
	},
	{
		id: 'toutiao',
		label: '今日头条',
		description: '今日头条站内搜索，无需 Key；结果来自页面内嵌 JSON。',
		url: (query) => `https://so.toutiao.com/search?keyword=${encodeURIComponent(query)}`,
		acceptLanguage: 'zh-CN,zh;q=0.9',
		parse: parseToutiao,
		timeFilter: '',
	},
]

/** Lookup by id. */
export const SERP_ENGINE_BY_ID = new Map(SERP_ENGINES.map((engine) => [engine.id, engine]))

/** Server-side time-bucket days, for engines with a bing-style age filter. */
const BUCKET_DAYS = { day: 1, week: 7, month: 30, year: 365 }

/**
 * Append a bing-style age filter.
 *
 * @param {string} url - Engine URL.
 * @param {string} timeRange - Normalized filter label.
 * @returns {string} The URL, possibly with a filter.
 */
function withTime(url, timeRange) {
	const days = BUCKET_DAYS[timeRange]
	if (days === undefined) return url
	return `${url}${url.includes('?') ? '&' : '?'}qft=+filterui:age-lt${days * 1440}`
}

/**
 * Search one engine.
 *
 * @param {object} engine - Registry row.
 * @param {{query: string, maxResults?: number, timeRange?: string, signal?: AbortSignal, fetchImpl?: Function}} options - Search options.
 * @returns {Promise<{sources: object[]}>} Results.
 */
export async function searchSerp(engine, { query, maxResults = 10, timeRange = '', baseUrl = '', signal, fetchImpl }) {
	const doFetch = typeof fetchImpl === 'function' ? fetchImpl : globalThis.fetch
	if (typeof doFetch !== 'function') throw new SearchChannelError('config', '当前 Host 没有可用的 fetch 实现。')
	let url = engine.timeFilter === 'bing' ? withTime(engine.url(query), timeRange) : engine.url(query)
	if (typeof baseUrl === 'string' && baseUrl.trim() !== '') {
		// Allow a mirror/proxy: keep the engine's path and query, swap the origin.
		try {
			const parsed = new URL(url)
			const mirror = new URL(baseUrl.trim())
			parsed.protocol = mirror.protocol
			parsed.host = mirror.host
			url = parsed.toString()
		} catch {
			// A malformed base URL keeps the default host; the panel validates it.
		}
	}
	let response
	try {
		response = await doFetch(url, {
			redirect: 'follow',
			headers: {
				'user-agent': UA,
				accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'accept-language': engine.acceptLanguage,
				'cache-control': 'no-cache',
			},
			signal,
		})
	} catch (error) {
		if (signal !== undefined && signal.aborted) throw new SearchChannelError('timeout', `${engine.label} 请求超时。`)
		throw new SearchChannelError('network', `${engine.label} 网络请求失败。`)
	}
	if (response.status === 403 || response.status === 429) {
		throw new SearchChannelError('bot-wall', `${engine.label} 触发反爬（HTTP ${response.status}）。`, response.status)
	}
	if (!response.ok) {
		throw new SearchChannelError('server', `${engine.label} 请求失败（HTTP ${response.status}）。`, response.status)
	}
	let html
	try {
		html = await response.text()
	} catch {
		throw new SearchChannelError('invalid-response', `${engine.label} 响应无法解码。`, response.status)
	}
	const head = html.slice(0, 4_000)
	if (BLOCK_MARKERS.some((marker) => marker.test(head))) {
		throw new SearchChannelError('bot-wall', `${engine.label} 返回了安全验证页。`, response.status)
	}
	const limit = Math.min(Math.max(Math.floor(Number(maxResults) || 10), 1), MAX_RESULTS)
	return { sources: engine.parse(html, limit) }
}
