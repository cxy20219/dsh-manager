/**
 * Keyless platform search.
 *
 * Adapted from dsh-free-search (MIT, DDDMUC) and trimmed to the keyless public
 * endpoints the manager uses. Platform search is intentionally separate from
 * the 14 general channels: these adapters target one site's own index, so the
 * caller must name the platform.
 *
 * @module dsh-manager/platform-search
 */

/** Platform labels shown to the model. */
export const PLATFORMS = Object.freeze({
	github: 'GitHub',
	v2ex: 'V2EX',
	bilibili: 'Bilibili',
	reddit: 'Reddit',
	hn: 'Hacker News',
	stackoverflow: 'Stack Overflow',
	wikipedia: 'Wikipedia',
	npm: 'npm',
	youtube: 'YouTube',
	vimeo: 'Vimeo',
	juejin: '掘金',
	douban: '豆瓣',
	qiita: 'Qiita',
})

/** Platform ids. */
export const PLATFORM_IDS = Object.freeze(Object.keys(PLATFORMS))

/** Desktop user agent for the HTML endpoints. */
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

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
 * Fetch text with a user agent and a 15 second cap.
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
		headers: { 'user-agent': USER_AGENT, ...headers },
		signal: combined,
		redirect: 'follow',
	})
	if (!response.ok) throw new Error(`HTTP ${response.status}`)
	return response.text()
}

/**
 * Fetch and parse JSON.
 *
 * @param {Function} fetchImpl - Fetch implementation.
 * @param {string} url - URL.
 * @param {AbortSignal} [signal] - Caller cancellation.
 * @param {object} [headers] - Extra headers.
 * @returns {Promise<unknown>} Parsed body.
 */
async function fetchJson(fetchImpl, url, signal, headers = {}) {
	const text = await fetchText(fetchImpl, url, signal, { accept: 'application/json', ...headers })
	try {
		return JSON.parse(text)
	} catch {
		throw new Error('returned non-JSON')
	}
}

/**
 * Strip tags and collapse whitespace.
 *
 * @param {unknown} value - HTML fragment.
 * @returns {string} Text.
 */
function stripTags(value) {
	return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
}

/**
 * Return a balanced JSON object starting at `start`.
 *
 * @param {string} text - Source text.
 * @param {number} start - Opening brace position.
 * @returns {string | null} JSON slice.
 */
function sliceBalancedObject(text, start) {
	let depth = 0
	let inString = false
	let escaped = false
	for (let index = start; index < text.length; index += 1) {
		const char = text[index]
		if (inString) {
			if (escaped) escaped = false
			else if (char === '\\') escaped = true
			else if (char === '"') inString = false
			continue
		}
		if (char === '"') inString = true
		else if (char === '{') depth += 1
		else if (char === '}') {
			depth -= 1
			if (depth === 0) return text.slice(start, index + 1)
		}
	}
	return null
}

/**
 * Collect values for a key from a nested JSON tree.
 *
 * @param {unknown} node - Tree.
 * @param {string} key - Key.
 * @returns {object[]} Matches.
 */
function collectByKey(node, key) {
	const found = []
	const visit = (value) => {
		if (Array.isArray(value)) {
			for (const item of value) visit(item)
			return
		}
		if (value === null || typeof value !== 'object') return
		for (const [name, child] of Object.entries(value)) {
			if (name === key && child !== null && typeof child === 'object') found.push(child)
			visit(child)
		}
	}
	visit(node)
	return found
}

/**
 * Check whether a string contains CJK characters.
 *
 * @param {string} value - Text.
 * @returns {boolean} Whether CJK is present.
 */
function hasCjk(value) {
	return /[\u3400-\u9fff]/.test(String(value))
}

/**
 * Deduplicate sources by URL and cap them.
 *
 * @param {object[]} sources - Candidate sources.
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
		if (typeof source.publishedAt === 'string' && source.publishedAt.trim() !== '') item.publishedAt = source.publishedAt.trim()
		kept.push(item)
		if (kept.length >= limit) break
	}
	return kept
}

/** Individual platform adapters. */
const ADAPTERS = {
	async github(query, limit, signal, fetchImpl) {
		const data = await fetchJson(fetchImpl, `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${limit}`, signal, { accept: 'application/vnd.github+json' })
		return (data.items ?? []).map((item) => ({
			url: item.html_url,
			title: item.full_name ?? item.name,
			snippet: `${item.description ?? ''}${item.stargazers_count ? ` ⭐${item.stargazers_count}` : ''}`.trim(),
		}))
	},
	async v2ex(query, limit, signal, fetchImpl) {
		const topics = await fetchJson(fetchImpl, 'https://www.v2ex.com/api/topics/hot.json', signal)
		const needle = query.toLowerCase()
		return (Array.isArray(topics) ? topics : [])
			.filter((topic) => String(topic.title ?? '').toLowerCase().includes(needle) || String(topic.content ?? '').toLowerCase().includes(needle))
			.slice(0, limit)
			.map((topic) => ({
				url: `https://www.v2ex.com/t/${topic.id}`,
				title: topic.title,
				...(topic.content ? { snippet: String(topic.content).slice(0, 200) } : {}),
			}))
	},
	async bilibili(query, limit, signal, fetchImpl) {
		const data = await fetchJson(fetchImpl, `https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodeURIComponent(query)}`, signal, { referer: 'https://www.bilibili.com' })
		if (data.code !== 0) throw new Error(`Bilibili error: ${data.message ?? data.code}`)
		const sources = []
		for (const section of data.data?.result ?? []) {
			for (const item of section.data ?? []) {
				if (!item.arcurl) continue
				sources.push({
					url: item.arcurl,
					title: item.title ? stripTags(item.title) : item.bvid,
					...(item.desc ? { snippet: String(item.desc).slice(0, 200) } : {}),
				})
				if (sources.length >= limit) return sources
			}
		}
		return sources
	},
	async reddit(query, limit, signal, fetchImpl) {
		const data = await fetchJson(fetchImpl, `https://old.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=${limit}&sort=relevance`, signal)
		return (data.data?.children ?? [])
			.map((child) => child.data)
			.filter((post) => post && post.url)
			.map((post) => ({
				url: post.url,
				title: post.title ?? '',
				...(post.selftext ? { snippet: String(post.selftext).slice(0, 200) } : {}),
			}))
	},
	async hn(query, limit, signal, fetchImpl) {
		const data = await fetchJson(fetchImpl, `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${limit}`, signal)
		return (data.hits ?? [])
			.filter((hit) => hit.title || hit.story_title)
			.map((hit) => ({
				url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
				title: hit.title ?? hit.story_title,
				snippet: `HN discussion · ${hit.points ?? 0} points · ${hit.num_comments ?? 0} comments`,
			}))
	},
	async stackoverflow(query, limit, signal, fetchImpl) {
		const data = await fetchJson(fetchImpl, `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=${limit}&filter=!nNPvSNVZJS`, signal)
		if (data.error_message) throw new Error(`Stack Exchange error: ${data.error_message}`)
		return (data.items ?? []).map((item) => ({
			url: item.link,
			title: item.title,
			snippet: `${item.is_answered ? '✓ answered' : 'unanswered'} · score ${item.score ?? 0} · ${item.answer_count ?? 0} answers`,
		}))
	},
	async wikipedia(query, limit, signal, fetchImpl) {
		const host = hasCjk(query) ? 'zh.wikipedia.org' : 'en.wikipedia.org'
		const data = await fetchJson(fetchImpl, `https://${host}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${limit}`, signal)
		return (data.query?.search ?? []).map((item) => ({
			url: `https://${host}/wiki/${encodeURIComponent(String(item.title).replace(/ /g, '_'))}`,
			title: item.title,
			...(item.snippet ? { snippet: stripTags(item.snippet).slice(0, 200) } : {}),
		}))
	},
	async npm(query, limit, signal, fetchImpl) {
		const data = await fetchJson(fetchImpl, `https://registry.npmjs.com/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}`, signal)
		return (data.objects ?? [])
			.map((object) => object.package)
			.filter((pkg) => pkg && pkg.name)
			.map((pkg) => ({
				url: pkg.links?.npm ?? `https://www.npmjs.com/package/${pkg.name}`,
				title: pkg.name,
				snippet: `v${pkg.version ?? '?'}${pkg.description ? ` — ${String(pkg.description).slice(0, 160)}` : ''}`,
			}))
	},
	async youtube(query, limit, signal, fetchImpl) {
		const html = await fetchText(fetchImpl, `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, signal, { 'accept-language': 'en-US,en;q=0.9' })
		const index = html.indexOf('ytInitialData')
		const brace = index < 0 ? -1 : html.indexOf('{', index)
		const jsonText = brace < 0 ? null : sliceBalancedObject(html, brace)
		if (jsonText === null) throw new Error('YouTube: ytInitialData not found')
		const data = JSON.parse(jsonText)
		const sources = []
		for (const video of collectByKey(data, 'videoRenderer')) {
			const id = video?.videoId
			if (typeof id !== 'string' || id === '') continue
			const title = video.title?.runs?.[0]?.text ?? video.title?.simpleText
			const owner = video.ownerText?.runs?.[0]?.text ?? video.longBylineText?.runs?.[0]?.text
			const bits = [owner, video.lengthText?.simpleText, video.viewCountText?.simpleText, video.publishedTimeText?.simpleText].filter((value) => typeof value === 'string' && value.trim() !== '')
			sources.push({
				url: `https://www.youtube.com/watch?v=${id}`,
				...(title ? { title: stripTags(title) } : {}),
				...(bits.length > 0 ? { snippet: bits.join(' · ') } : {}),
			})
			if (sources.length >= limit) break
		}
		return sources
	},
	async vimeo(query, limit, signal, fetchImpl) {
		const html = await fetchText(fetchImpl, `https://vimeo.com/search?q=${encodeURIComponent(query)}`, signal, { 'accept-language': 'en-US,en;q=0.9' })
		const sources = []
		const seen = new Set()
		const pattern = /"uri"\s*:\s*"\/videos\/(\d+)"/g
		let match
		while ((match = pattern.exec(html)) !== null) {
			const id = match[1]
			if (seen.has(id)) continue
			seen.add(id)
			const nearby = html.slice(Math.max(0, match.index - 600), match.index + 200)
			const name = nearby.match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/)
			let title
			if (name) {
				try { title = JSON.parse(`"${name[1]}"`) } catch { title = name[1] }
			}
			sources.push({ url: `https://vimeo.com/${id}`, ...(title ? { title: stripTags(title) } : {}) })
			if (sources.length >= limit) break
		}
		return sources
	},
	async juejin(query, limit, signal, fetchImpl) {
		const data = await fetchJson(fetchImpl, `https://api.juejin.cn/search_api/v1/search?query=${encodeURIComponent(query)}&id_type=0&cursor=0&limit=${limit}`, signal)
		if (data.err_no !== 0) throw new Error(`Juejin error: ${data.err_msg ?? data.err_no}`)
		return (data.data ?? [])
			.map((item) => item.result_model?.article_info)
			.filter((article) => article && article.article_id)
			.map((article) => ({
				url: `https://juejin.cn/post/${article.article_id}`,
				title: article.title ?? '',
				...(article.brief_content ? { snippet: String(article.brief_content).slice(0, 200) } : {}),
			}))
	},
	async douban(query, limit, signal, fetchImpl) {
		const html = await fetchText(fetchImpl, `https://www.douban.com/search?q=${encodeURIComponent(query)}&cat=1001`, signal, { 'accept-language': 'zh-CN,zh;q=0.9' })
		const sources = []
		for (const block of html.split('<div class="result">').slice(1)) {
			const heading = block.match(/<h3>([\s\S]*?)<\/h3>/)?.[1]
			if (heading === undefined) continue
			const anchor = heading.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
			if (anchor === null) continue
			let url = anchor[1].replace(/&amp;/g, '&')
			const wrapped = url.match(/[?&]url=([^&]+)/)
			if (wrapped) {
				try { url = decodeURIComponent(wrapped[1]) } catch { /* keep raw */ }
			}
			const title = stripTags(anchor[2])
			const info = block.match(/<div class="info">([\s\S]*?)<\/div>/)?.[1]
			if (!/^https?:\/\//i.test(url) || title === '') continue
			sources.push({ url, title, ...(info ? { snippet: stripTags(info).slice(0, 200) } : {}) })
			if (sources.length >= limit) break
		}
		return sources
	},
	async qiita(query, limit, signal, fetchImpl) {
		const data = await fetchJson(fetchImpl, `https://qiita.com/api/v2/items?query=${encodeURIComponent(query)}&per_page=${limit}`, signal)
		return (Array.isArray(data) ? data : []).map((item) => ({
			url: item.url,
			title: item.title ?? '',
			...(item.body ? { snippet: stripTags(item.body).slice(0, 200) } : {}),
		}))
	},
}

/**
 * Search one platform.
 *
 * @param {{platform: string, query: string, maxResults?: number, signal?: AbortSignal, fetchImpl?: Function}} options - Request.
 * @returns {Promise<{platform: string, label: string, sources: object[], truncated: boolean}>} Result.
 */
export async function searchPlatform({ platform, query, maxResults, signal, fetchImpl }) {
	const adapter = ADAPTERS[platform]
	if (adapter === undefined) throw new Error(`unknown platform "${platform}"; valid: ${PLATFORM_IDS.join(', ')}`)
	const text = typeof query === 'string' ? query.trim() : ''
	if (text === '') throw new Error('platform search needs a query')
	const limit = limitOf(maxResults)
	const sources = await adapter(text, limit, signal, fetchImpl)
	return {
		platform,
		label: PLATFORMS[platform],
		sources: uniqueSources(sources, limit),
		truncated: false,
	}
}
