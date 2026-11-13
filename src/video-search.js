/**
 * Keyless video search.
 *
 * Adapted from dsh-free-search (MIT, DDDMUC): Bing Videos' async fragment and
 * DuckDuckGo's v.js endpoint. Both are HTML/JSON scrapes and may stop working
 * when the upstream page changes; a failure is reported, never fabricated.
 *
 * @module dsh-manager/video-search
 */

/** Desktop user agent. */
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Supported sources. */
export const VIDEO_SOURCES = Object.freeze(['bing', 'ddg'])

/**
 * Clamp a result count.
 *
 * @param {unknown} value - Candidate.
 * @returns {number} 1-10.
 */
function limitOf(value) {
	const number = Number.isInteger(value) ? value : 5
	return Math.min(Math.max(number, 1), 10)
}

/**
 * Fetch text with a 15 second cap.
 *
 * @param {Function} fetchImpl - Fetch implementation.
 * @param {string} url - URL.
 * @param {AbortSignal} [signal] - Caller cancellation.
 * @param {object} [headers] - Extra headers.
 * @returns {Promise<string>} Body.
 */
async function fetchText(fetchImpl, url, signal, headers = {}) {
	const doFetch = typeof fetchImpl === 'function' ? fetchImpl : globalThis.fetch
	const timeout = AbortSignal.timeout(15_000)
	const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
	const response = await doFetch(url, {
		headers: {
			'user-agent': USER_AGENT,
			'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
			accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
			...headers,
		},
		signal: combined,
		redirect: 'follow',
	})
	if (!response.ok) throw new Error(`HTTP ${response.status}`)
	return response.text()
}

/**
 * Decode HTML entities used in attributes.
 *
 * @param {string} value - Text.
 * @returns {string} Decoded text.
 */
function decodeEntities(value) {
	return String(value)
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
}

/**
 * Strip tags.
 *
 * @param {unknown} value - HTML.
 * @returns {string} Text.
 */
function stripTags(value) {
	return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Deduplicate and cap sources.
 *
 * @param {object[]} sources - Candidates.
 * @param {number} limit - Cap.
 * @returns {object[]} Sources.
 */
function uniqueSources(sources, limit) {
	const seen = new Set()
	const kept = []
	for (const source of sources) {
		const url = typeof source?.url === 'string' ? source.url.trim() : ''
		if (!/^https?:\/\//i.test(url) || seen.has(url)) continue
		seen.add(url)
		const item = { url }
		if (typeof source.title === 'string' && source.title.trim() !== '') item.title = source.title.trim()
		if (typeof source.snippet === 'string' && source.snippet.trim() !== '') item.snippet = source.snippet.trim()
		kept.push(item)
		if (kept.length >= limit) break
	}
	return kept
}

/**
 * Search Bing Videos' async fragment endpoint.
 *
 * @param {string} query - Query.
 * @param {number} limit - Cap.
 * @param {AbortSignal} [signal] - Caller cancellation.
 * @param {Function} fetchImpl - Fetch implementation.
 * @returns {Promise<object[]>} Sources.
 */
async function searchBingVideos(query, limit, signal, fetchImpl) {
	const params = new URLSearchParams({ q: query, count: String(limit), first: '1', mmasync: '1' })
	const html = await fetchText(fetchImpl, `https://www.bing.com/videos/asyncv2?${params}`, signal)
	if (/captcha|unusual traffic|robot check/i.test(html.slice(0, 5_000))) throw new Error('Bing Videos is rate-limited')
	const sources = []
	for (const attribute of html.match(/vrhm="([^"]*)"/g) ?? []) {
		let meta
		try {
			meta = JSON.parse(decodeEntities(attribute.slice(6, -1)))
		} catch {
			continue
		}
		const url = meta?.murl
		if (typeof url !== 'string' || url === '') continue
		const bits = [meta.du, meta.vd].filter((value) => typeof value === 'string' && value.trim() !== '')
		sources.push({
			url,
			...(meta.vt ? { title: stripTags(meta.vt) } : {}),
			...(bits.length > 0 ? { snippet: bits.join(' · ') } : {}),
		})
	}
	return sources
}

/**
 * Search DuckDuckGo Videos.
 *
 * @param {string} query - Query.
 * @param {number} limit - Cap.
 * @param {AbortSignal} [signal] - Caller cancellation.
 * @param {Function} fetchImpl - Fetch implementation.
 * @returns {Promise<object[]>} Sources.
 */
async function searchDdgVideos(query, limit, signal, fetchImpl) {
	const landing = await fetchText(fetchImpl, `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=videos&ia=videos`, signal)
	const token = landing.match(/vqd=["']?([\d-]+)/)?.[1]
	if (token === undefined) throw new Error('DuckDuckGo Videos: could not obtain vqd token')
	const params = new URLSearchParams({ l: 'us-en', o: 'json', q: query, vqd: token, f: ',,,', p: '1' })
	const text = await fetchText(fetchImpl, `https://duckduckgo.com/v.js?${params}`, signal, { accept: 'application/json, text/javascript, */*' })
	const start = text.indexOf('{')
	const end = text.lastIndexOf('}')
	if (start < 0 || end <= start) throw new Error('DuckDuckGo Videos: unexpected response')
	let data
	try {
		data = JSON.parse(text.slice(start, end + 1))
	} catch {
		throw new Error('DuckDuckGo Videos: invalid JSON')
	}
	const sources = []
	for (const item of data.results ?? []) {
		const url = typeof item?.content === 'string' && item.content !== '' ? item.content : item?.url
		if (typeof url !== 'string' || url === '') continue
		const bits = [item.uploader, item.duration, item.published].filter((value) => typeof value === 'string' && value.trim() !== '')
		sources.push({
			url,
			...(item.title ? { title: stripTags(item.title) } : {}),
			...(bits.length > 0 ? { snippet: bits.join(' · ') } : {}),
		})
	}
	return sources
}

/**
 * Search videos across sources, falling back from Bing to DuckDuckGo.
 *
 * @param {{query: string, source?: string, maxResults?: number, signal?: AbortSignal, fetchImpl?: Function}} options - Request.
 * @returns {Promise<{provider: string, sources: object[], truncated: boolean}>} Result.
 */
export async function searchVideo({ query, source, maxResults, signal, fetchImpl }) {
	const text = typeof query === 'string' ? query.trim() : ''
	if (text === '') throw new Error('video search needs a query')
	const limit = limitOf(maxResults)
	const requested = typeof source === 'string' ? source.trim().toLowerCase() : ''
	const order = requested === 'bing' ? ['bing'] : requested === 'ddg' ? ['ddg'] : ['bing', 'ddg']
	const collected = []
	const used = []
	let firstError = null
	for (const provider of order) {
		try {
			const sources = provider === 'bing'
				? await searchBingVideos(text, limit, signal, fetchImpl)
				: await searchDdgVideos(text, limit, signal, fetchImpl)
			if (sources.length > 0) used.push(provider)
			collected.push(...sources)
			if (collected.length >= limit) break
		} catch (error) {
			firstError = firstError ?? error
		}
	}
	const sources = uniqueSources(collected, limit)
	if (sources.length === 0) throw new Error(`video search failed: ${firstError instanceof Error ? firstError.message : 'no results'}`)
	return { provider: used.join('+') || 'video', sources, truncated: false }
}
