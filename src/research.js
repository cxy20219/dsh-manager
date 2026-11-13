/**
 * Focused research pipeline.
 *
 * This is a smaller port of dsh-free-search's research tool: plan a few
 * queries, merge the manager's search results, fetch the top pages directly,
 * extract readable text, and expose the fetched bodies through `cache_search`.
 * It deliberately does not ship the original semantic reranker, model-based
 * evidence gate or SQLite cache; those are separate capabilities.
 *
 * @module dsh-manager/research
 */

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/** Maximum characters of one fetched body kept in memory. */
const MAX_BODY_CHARS = 20_000

/** Cache entries and age. */
const MAX_CACHE_ENTRIES = 200
const CACHE_TTL_MS = 7 * 86_400_000

/** Fetch timeout. */
const FETCH_TIMEOUT_MS = 15_000

/** A desktop user agent for direct page fetches. */
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/**
 * Whether an IP literal is loopback/private/link-local/reserved.
 *
 * @param {string} address - IP literal.
 * @returns {boolean} Whether it must not be fetched.
 */
function isPrivateAddress(address) {
	const value = String(address).trim().toLowerCase()
	const family = isIP(value)
	if (family === 4) {
		const parts = value.split('.').map(Number)
		if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
		const [a, b] = parts
		if (a === 0 || a === 10 || a === 127) return true
		if (a === 169 && b === 254) return true
		if (a === 172 && b >= 16 && b <= 31) return true
		if (a === 192 && b === 168) return true
		if (a === 100 && b >= 64 && b <= 127) return true
		if (a === 198 && (b === 18 || b === 19)) return true
		return false
	}
	if (family === 6) {
		if (value === '::' || value === '::1') return true
		if (value.startsWith('fc') || value.startsWith('fd')) return true
		if (/^fe[89ab]/.test(value)) return true
		const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
		if (mapped !== null) return isPrivateAddress(mapped[1])
		return false
	}
	return true
}

/**
 * Default DNS resolver.
 *
 * @param {string} hostname - Host.
 * @returns {Promise<Array<{address: string}>>} Addresses.
 */
async function defaultResolve(hostname) {
	return await lookup(hostname, { all: true, verbatim: true })
}

/**
 * Reject non-http(s), local names and private addresses.
 *
 * @param {string} value - URL.
 * @param {Function} resolveHost - DNS resolver.
 * @returns {Promise<URL>} The checked URL.
 */
async function assertSafeUrl(value, resolveHost) {
	let url
	try {
		url = new URL(value)
	} catch {
		throw new Error('invalid URL')
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('only http(s) URLs are supported')
	const host = url.hostname.toLowerCase()
	if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) {
		throw new Error('local hostnames are not fetched')
	}
	if (isIP(host) !== 0) {
		if (isPrivateAddress(host)) throw new Error('private IPs are not fetched')
		return url
	}
	const addresses = await resolveHost(host)
	if (!Array.isArray(addresses) || addresses.length === 0) throw new Error('hostname did not resolve')
	if (addresses.some((entry) => isPrivateAddress(entry.address))) throw new Error('private IPs are not fetched')
	return url
}

/**
 * Decode the basic HTML entities found in page text.
 *
 * @param {string} value - HTML.
 * @returns {string} Text.
 */
function decodeEntities(value) {
	return String(value)
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
}

/**
 * Extract a readable title and body from an HTML document.
 *
 * @param {string} html - HTML.
 * @returns {{title: string, text: string}} Extracted text.
 */
function extractHtml(html) {
	const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim()
	const text = decodeEntities(String(html)
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
		.replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
		.replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim()
	return { title, text }
}

/**
 * Clip text without splitting a surrogate pair.
 *
 * @param {string} value - Text.
 * @param {number} limit - Cap.
 * @returns {{text: string, truncated: boolean}} Clipped text.
 */
function clip(value, limit) {
	const chars = [...value]
	if (chars.length <= limit) return { text: value, truncated: false }
	return { text: chars.slice(0, limit).join(''), truncated: true }
}

/**
 * Run tasks with bounded concurrency.
 *
 * @param {unknown[]} items - Items.
 * @param {number} limit - Concurrency.
 * @param {Function} run - Worker.
 * @returns {Promise<unknown[]>} Results in input order.
 */
async function mapLimit(items, limit, run) {
	const results = new Array(items.length)
	let next = 0
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const index = next
			next += 1
			results[index] = await run(items[index], index)
		}
	})
	await Promise.all(workers)
	return results
}

/**
 * Build the research service.
 *
 * @param {{search: object, fetchImpl?: Function, resolveHost?: Function}} options - Wiring.
 * @returns {{run: Function, cacheSearch: Function}} Service.
 */
export function createResearchService({ search, fetchImpl, resolveHost = defaultResolve }) {
	const cache = new Map()

	/**
	 * Put one fetched document in the cache.
	 *
	 * @param {object} document - Body document.
	 * @returns {void}
	 */
	function remember(document) {
		cache.delete(document.url)
		cache.set(document.url, document)
		while (cache.size > MAX_CACHE_ENTRIES) {
			const oldest = cache.keys().next().value
			if (oldest === undefined) break
			cache.delete(oldest)
		}
	}

	/**
	 * Fetch one source safely.
	 *
	 * @param {object} source - Search source.
	 * @returns {Promise<{document: object, note: string}>} Fetched document or snippet-only fallback.
	 */
	async function fetchDocument(source) {
		const cached = cache.get(source.url)
		if (cached !== undefined && Date.now() - Date.parse(cached.fetchedAt) < CACHE_TTL_MS) {
			return { document: { ...cached, title: cached.title || source.title || source.url }, note: '' }
		}
		try {
			const url = await assertSafeUrl(source.url, resolveHost)
			const doFetch = typeof fetchImpl === 'function' ? fetchImpl : globalThis.fetch
			const response = await doFetch(url, {
				headers: {
					'user-agent': USER_AGENT,
					accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8',
				},
				redirect: 'error',
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			})
			if (!response.ok) throw new Error(`HTTP ${response.status}`)
			const type = String(response.headers.get('content-type') ?? '').toLowerCase()
			if (!/text\/|json|xml|xhtml|html/.test(type)) throw new Error(`unsupported content type ${type || 'unknown'}`)
			const raw = await response.text()
			const isHtml = /html|xhtml/.test(type)
			const extracted = isHtml ? extractHtml(raw) : { title: '', text: raw.replace(/\s+/g, ' ').trim() }
			const clipped = clip(extracted.text, MAX_BODY_CHARS)
			const document = {
				url: source.url,
				title: extracted.title || source.title || source.url,
				text: clipped.text,
				kind: 'body',
				fetchedAt: new Date().toISOString(),
				...(clipped.truncated ? { truncated: true } : {}),
			}
			remember(document)
			return { document, note: '' }
		} catch (error) {
			return {
				document: {
					url: source.url,
					title: source.title || source.url,
					text: '',
					kind: 'snippet-only',
					fetchedAt: new Date().toISOString(),
				},
				note: `${source.url}: ${error instanceof Error ? error.message : String(error)}`,
			}
		}
	}

	/**
	 * Run one research question.
	 *
	 * @param {{question: string, depth?: number}} input - Question and depth.
	 * @returns {Promise<object>} Research package.
	 */
	async function run(input) {
		const question = typeof input?.question === 'string' ? input.question.trim() : ''
		if (question === '') throw new Error('research needs a question.')
		const depthNumber = Number.isInteger(input?.depth) ? input.depth : 2
		const depth = Math.min(Math.max(depthNumber, 1), 3)
		const queryCount = depth === 1 ? 1 : depth === 2 ? 3 : 5
		const documentCount = depth === 1 ? 2 : depth === 2 ? 4 : 6
		const queries = [
			question,
			`${question} overview`,
			`${question} latest`,
			`${question} documentation`,
			`${question} issues`,
		].slice(0, queryCount)
		const notes = []
		const started = Date.now()
		const results = await mapLimit(queries, 2, async (query) => {
			try {
				return await search.search({ query, maxResults: 10 })
			} catch (error) {
				notes.push(`search "${query}": ${error instanceof Error ? error.message : String(error)}`)
				return { sources: [] }
			}
		})

		const seen = new Set()
		const sources = []
		for (const result of results) {
			for (const source of Array.isArray(result?.sources) ? result.sources : []) {
				const url = typeof source.url === 'string' ? source.url : ''
				if (url === '' || seen.has(url)) continue
				seen.add(url)
				const item = { url, title: typeof source.title === 'string' ? source.title : '', snippet: typeof source.snippet === 'string' ? source.snippet : '' }
				if (typeof source.publishedAt === 'string' && source.publishedAt !== '') item.publishedAt = source.publishedAt
				sources.push(item)
				if (sources.length >= 20) break
			}
			if (sources.length >= 20) break
		}

		const fetched = await mapLimit(sources.slice(0, documentCount), 3, (source) => fetchDocument(source))
		const documents = fetched.map((entry) => entry.document)
		for (const entry of fetched) if (entry.note !== '') notes.push(entry.note)
		const bodyCount = documents.filter((document) => document.kind === 'body').length
		const domains = new Set(sources.map((source) => {
			try { return new URL(source.url).hostname.replace(/^www\./i, '').toLowerCase() } catch { return '' }
		}).filter(Boolean)).size
		const dated = sources.filter((source) => typeof source.publishedAt === 'string' && source.publishedAt !== '').length
		const level = sources.length >= 8 && domains >= 3 && bodyCount >= 3 && dated >= 2
			? 'high'
			: sources.length >= 3 && domains >= 2 && bodyCount >= 1
				? 'medium'
				: 'low'
		const quality = {
			level,
			note: level === 'high'
				? 'enough independent sources and fetched bodies for a confident answer'
				: level === 'medium'
					? 'thin evidence: verify key claims against the listed sources before concluding'
					: 'insufficient evidence: do not state conclusions as fact; report the gap',
			sources: sources.length,
			domains,
			fetched: bodyCount,
		}
		if (documents.some((document) => document.kind === 'snippet-only') && notes.length === 0) notes.push('some pages could not be fetched; those sources have snippets only')
		return {
			question,
			queries,
			elapsedMs: Date.now() - started,
			sources,
			documents,
			notes,
			quality,
		}
	}

	/**
	 * Full-text search over fetched bodies.
	 *
	 * @param {{query: string, limit?: number}} input - Query and limit.
	 * @returns {{query: string, hits: object[]}} Hits.
	 */
	function cacheSearch(input) {
		const query = typeof input?.query === 'string' ? input.query.trim() : ''
		const limit = Math.min(Math.max(Number.isInteger(input?.limit) ? input.limit : 8, 1), 20)
		if (query === '') throw new Error('cache_search needs a query.')
		const terms = new Set()
		for (const run of query.match(/[\u3400-\u9fff]+/g) ?? []) {
			if (run.length === 2) terms.add(run)
			for (let index = 0; index + 1 < run.length; index += 1) terms.add(run.slice(index, index + 2))
		}
		for (const word of query.toLowerCase().split(/[^a-z0-9]+/)) if (word.length >= 2) terms.add(word)
		const list = []
		for (const [url, document] of cache) {
			if (Date.now() - Date.parse(document.fetchedAt) > CACHE_TTL_MS) {
				cache.delete(url)
				continue
			}
			const title = document.title.toLowerCase()
			const text = document.text.toLowerCase()
			let score = 0
			for (const term of terms) {
				const needle = term.toLowerCase()
				if (title.includes(needle)) score += 5
				let from = 0
				while (from < text.length) {
					const at = text.indexOf(needle, from)
					if (at < 0) break
					score += 1
					from = at + needle.length
					if (score > 100) break
				}
			}
			if (score === 0) continue
			const first = document.text.toLowerCase().indexOf([...terms][0]?.toLowerCase() ?? query.toLowerCase())
			const excerpt = document.text.slice(Math.max(0, first - 120), Math.max(0, first - 120) + 400)
			list.push({ url: document.url, title: document.title, excerpt, fetchedAt: document.fetchedAt, score })
		}
		list.sort((a, b) => b.score - a.score)
		return { query, hits: list.slice(0, limit).map(({ score, ...hit }) => hit) }
	}

	return { run, cacheSearch }
}
