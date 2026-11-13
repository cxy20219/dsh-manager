/**
 * Focused research pipeline.
 *
 * A trimmed port of dsh-free-search's research tool: plan a few queries, merge
 * the manager's search results, rank the candidates (lexically, or with a
 * model reranker when a key is configured), fetch the top pages through the
 * quality fetch chain, extract readable text, grade the evidence, and expose
 * the fetched bodies through `cache_search`.
 *
 * The whole run shares one time budget. When the first pass leaves thin
 * evidence and time remains, it fetches a couple more pages instead of asking
 * the model to start over. Nothing here writes to the profile: the only
 * persistent state is the fetched-body cache.
 *
 * @module dsh-manager/research
 */

import { readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import { truncateText } from './safe-text.js'

/** Maximum characters of one fetched body kept in memory. */
const MAX_BODY_CHARS = 20_000

/** Cache entries and age. */
const MAX_CACHE_ENTRIES = 200
const CACHE_TTL_MS = 7 * 86_400_000

/** Fetch timeout. */
const FETCH_TIMEOUT_MS = 15_000

/** Wall-clock budget for one research run. */
const RESEARCH_BUDGET_MS = 90_000

/** Extra pages fetched when the first pass is thin. */
const ESCALATION_PAGES = 2

/** Minimum remaining time before an escalation fetch is worth starting. */
const ESCALATION_MIN_MS = 8_000

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
export async function assertSafeUrl(value, resolveHost = defaultResolve) {
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
 * Registrable-domain approximation for source diversity.
 *
 * This is not a full public-suffix list, but it collapses the common
 * `co.uk` / `com.cn` / `github.io` cases without adding a dependency.
 *
 * @param {string} value - URL.
 * @returns {string} Site key, or an empty string.
 */
function siteOf(value) {
	try {
		const host = new URL(value).hostname.replace(/^www\./i, '').toLowerCase()
		const parts = host.split('.')
		if (parts.length <= 2) return host
		const lastTwo = parts.slice(-2).join('.')
		if (/^(?:co|com|net|org|gov|edu|ac|or|ne|go)\.[a-z]{2}$/.test(lastTwo)) return parts.slice(-3).join('.')
		return lastTwo
	} catch {
		return ''
	}
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
 * Token set for lexical ranking: CJK bigrams plus ASCII words.
 *
 * @param {string} value - Text.
 * @returns {Set<string>} Terms.
 */
function queryTerms(value) {
	const text = String(value ?? '').toLowerCase()
	const terms = new Set()
	for (const run of text.match(/[\u3400-\u9fff]+/g) ?? []) {
		if (run.length === 1) terms.add(run)
		for (let index = 0; index + 1 < run.length; index += 1) terms.add(run.slice(index, index + 2))
	}
	for (const word of text.split(/[^a-z0-9]+/)) if (word.length >= 2) terms.add(word)
	return terms
}

/**
 * Grade the evidence package.
 *
 * The level answers "how much can this package support a conclusion", not
 * "how relevant is it". A run that hit its deadline, or that failed to fetch
 * anything, cannot be high even if many URLs came back.
 *
 * @param {{sources: number, domains: number, dated: number, bodies: number, failed: number, exhausted: boolean}} input - Counts.
 * @returns {{level: string, degraded: boolean, note: string}} The grade.
 */
function assessQuality({ sources, domains, dated, bodies, failed, exhausted }) {
	let level = 'low'
	if (sources >= 8 && domains >= 3 && bodies >= 3 && dated >= 2) level = 'high'
	else if (sources >= 3 && domains >= 2 && bodies >= 1) level = 'medium'
	const degraded = exhausted === true || (failed >= 2 && bodies === 0)
	if (degraded) level = 'low'
	const note = level === 'high'
		? 'enough independent sources and fetched bodies for a confident answer'
		: level === 'medium'
			? 'thin evidence: verify key claims against the listed sources before concluding'
			: 'insufficient evidence: do not state conclusions as fact; report the gap'
	return { level, degraded, note }
}

/**
 * Order candidates by lexical overlap with the question.
 *
 * This is the cheap tier: title hits weigh more than snippet hits, and ties
 * keep the search engines' consensus order. A model reranker, when configured,
 * runs on top of this list.
 *
 * @param {object[]} sources - Candidate sources.
 * @param {string} question - Research question.
 * @returns {{source: object, score: number}[]} Ranked entries.
 */
function lexicalRank(sources, question) {
	const terms = queryTerms(question)
	return (Array.isArray(sources) ? sources : [])
		.map((source, index) => {
			const title = String(source?.title ?? '').toLowerCase()
			const snippet = String(source?.snippet ?? '').toLowerCase()
			let score = 0
			for (const term of terms) {
				if (title.includes(term)) score += 5
				if (snippet.includes(term)) score += 1
			}
			return { source, score, index }
		})
		.sort((a, b) => b.score - a.score || a.index - b.index)
}

/**
 * Build the research service.
 *
 * @param {{search: object, fetchImpl?: Function, resolveHost?: Function}} options - Wiring.
 * @returns {{run: Function, cacheSearch: Function}} Service.
 */
export function createResearchService({ search, fetchImpl, resolveHost = defaultResolve, fetchPage, cachePath, rerank, budgetMs = RESEARCH_BUDGET_MS }) {
	const cache = new Map()
	let saveTimer = null
	let writing = Promise.resolve()

	if (typeof cachePath === 'string' && cachePath !== '') {
		try {
			const parsed = JSON.parse(readFileSync(cachePath, 'utf8'))
			for (const document of Array.isArray(parsed?.documents) ? parsed.documents : []) {
				if (document === null || typeof document !== 'object') continue
				if (typeof document.url !== 'string' || document.url === '') continue
				if (document.kind !== 'body' || typeof document.text !== 'string') continue
				const fetched = Date.parse(document.fetchedAt)
				if (!Number.isFinite(fetched) || Date.now() - fetched > CACHE_TTL_MS) continue
				cache.set(document.url, document)
				if (cache.size >= MAX_CACHE_ENTRIES) break
			}
		} catch {
			// A missing or broken cache is a cold start, not a failure.
		}
	}

	/** Persist the cache atomically, coalescing concurrent writes. */
	function persist() {
		if (typeof cachePath !== 'string' || cachePath === '') return writing
		writing = writing.then(async () => {
			await mkdir(dirname(cachePath), { recursive: true })
			const temporary = `${cachePath}.tmp`
			await writeFile(temporary, JSON.stringify({ version: 1, documents: [...cache.values()] }), { mode: 0o600 })
			await rename(temporary, cachePath)
		}).catch(() => {})
		return writing
	}

	/** Schedule one debounced write. */
	function schedulePersist() {
		if (typeof cachePath !== 'string' || cachePath === '' || saveTimer !== null) return
		saveTimer = setTimeout(() => {
			saveTimer = null
			void persist()
		}, 1_000)
		saveTimer.unref?.()
	}

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
	async function fetchDocument(source, deadline = Number.POSITIVE_INFINITY) {
		const cached = cache.get(source.url)
		if (cached !== undefined && Date.now() - Date.parse(cached.fetchedAt) < CACHE_TTL_MS) {
			return { document: { ...cached, title: cached.title || source.title || source.url }, note: '' }
		}
		const remaining = Number.isFinite(deadline) ? deadline - Date.now() : FETCH_TIMEOUT_MS
		if (remaining <= 0) throw new Error('budget exhausted before fetch')
		try {
			if (typeof fetchPage === 'function') {
				const result = await fetchPage(source.url)
				const body = result?.body
				if (body === undefined || typeof body.content !== 'string') throw new Error('page fetcher returned no body')
				const isHtml = body.kind === 'html'
				const extracted = isHtml ? extractHtml(body.content) : { title: '', text: body.content.replace(/\s+/g, ' ').trim() }
				const clipped = clip(extracted.text, MAX_BODY_CHARS)
				const document = {
					url: source.url,
					title: extracted.title || source.title || source.url,
					text: clipped.text,
					kind: 'body',
					fetchedAt: new Date().toISOString(),
					...(clipped.truncated || result.truncated === true ? { truncated: true } : {}),
				}
				remember(document)
				return { document, note: '' }
			}
			const url = await assertSafeUrl(source.url, resolveHost)
			const doFetch = typeof fetchImpl === 'function' ? fetchImpl : globalThis.fetch
			const response = await doFetch(url, {
				headers: {
					'user-agent': USER_AGENT,
					accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8',
				},
				redirect: 'error',
				signal: AbortSignal.timeout(Math.max(1_000, Math.min(FETCH_TIMEOUT_MS, remaining))),
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
		const cjk = /[\u3400-\u9fff]/.test(question)
		const suffixes = cjk
			? ['', ' 最新', ' 文档', ' 问题', ' 教程']
			: ['', ' overview', ' latest', ' documentation', ' issues']
		const queries = suffixes.slice(0, queryCount).map((suffix) => `${question}${suffix}`)
		const notes = []
		const started = Date.now()
		const budget = Number.isFinite(budgetMs) && budgetMs >= 0 ? budgetMs : RESEARCH_BUDGET_MS
		const deadline = started + budget
		const results = await mapLimit(queries, 2, async (query) => {
			if (Date.now() >= deadline) {
				notes.push(`budget exhausted before query "${query}"`)
				return { sources: [] }
			}
			try {
				return await search.search({ query, maxResults: 10 })
			} catch (error) {
				notes.push(`search "${query}": ${error instanceof Error ? error.message : String(error)}`)
				return { sources: [] }
			}
		})

		const seen = new Set()
		const perSite = new Map()
		const candidates = []
		for (const result of results) {
			for (const source of Array.isArray(result?.sources) ? result.sources : []) {
				const url = typeof source.url === 'string' ? source.url : ''
				if (url === '' || seen.has(url)) continue
				const site = siteOf(url)
				if (site !== '' && (perSite.get(site) ?? 0) >= 3) continue
				seen.add(url)
				if (site !== '') perSite.set(site, (perSite.get(site) ?? 0) + 1)
				const item = { url, title: typeof source.title === 'string' ? source.title : '', snippet: typeof source.snippet === 'string' ? source.snippet : '' }
				if (typeof source.publishedAt === 'string' && source.publishedAt !== '') item.publishedAt = source.publishedAt
				candidates.push(item)
				if (candidates.length >= 20) break
			}
			if (candidates.length >= 20) break
		}

		// Lexical ranking picks the fetch window; a configured model reranker
		// (SiliconFlow bge-reranker) refines that order when it has a key.
		let sources = lexicalRank(candidates, question).map((entry) => entry.source)
		if (typeof rerank === 'function' && sources.length > 1) {
			try {
				const scores = await rerank(question, sources.map((source) => `${source.title}\n${source.snippet}`))
				if (Array.isArray(scores) && scores.length === sources.length && scores.every((score) => Number.isFinite(score))) {
					sources = sources
						.map((source, index) => ({ source, score: scores[index], index }))
						.sort((a, b) => b.score - a.score || a.index - b.index)
						.map((entry) => entry.source)
				}
			} catch (error) {
				notes.push(`rerank: ${error instanceof Error ? error.message : String(error)}`)
			}
		}

		const domains = new Set(sources.map((source) => siteOf(source.url)).filter(Boolean)).size
		const dated = sources.filter((source) => typeof source.publishedAt === 'string' && source.publishedAt !== '').length
		let fetched = await mapLimit(sources.slice(0, documentCount), 3, (source) => fetchDocument(source, deadline))
		const firstBodies = fetched.filter((entry) => entry.document.kind === 'body').length
		const provisional = assessQuality({ sources: sources.length, domains, dated, bodies: firstBodies, failed: 0, exhausted: false })
		if (provisional.level !== 'high' && sources.length > documentCount && deadline - Date.now() > ESCALATION_MIN_MS) {
			const more = await mapLimit(sources.slice(documentCount, documentCount + ESCALATION_PAGES), 2, (source) => fetchDocument(source, deadline))
			if (more.length > 0) {
				fetched = [...fetched, ...more]
				const extraBodies = more.filter((entry) => entry.document.kind === 'body').length
				notes.push(`escalated: fetched ${extraBodies} more page(s) because the first pass looked thin`)
			}
		}
		const documents = fetched.map((entry) => entry.document)
		for (const entry of fetched) if (entry.note !== '') notes.push(entry.note)
		const bodyCount = documents.filter((document) => document.kind === 'body').length
		const failed = fetched.length - bodyCount
		const quality = {
			...assessQuality({ sources: sources.length, domains, dated, bodies: bodyCount, failed, exhausted: Date.now() >= deadline }),
			sources: sources.length,
			domains,
			fetched: bodyCount,
			...(failed > 0 ? { failed } : {}),
		}
		if (documents.some((document) => document.kind === 'snippet-only') && notes.length === 0) notes.push('some pages could not be fetched; those sources have snippets only')
		schedulePersist()
		return {
			question,
			queries,
			elapsedMs: Date.now() - started,
			budgetMs: budget,
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
			const fetched = Date.parse(document.fetchedAt)
			if (!Number.isFinite(fetched) || Date.now() - fetched > CACHE_TTL_MS) {
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
			const start = Math.max(0, first - 120)
			const excerpt = truncateText(document.text.slice(start, start + 400), 400)
			list.push({ url: document.url, title: document.title, excerpt, fetchedAt: document.fetchedAt, score })
		}
		list.sort((a, b) => b.score - a.score)
		return { query, hits: list.slice(0, limit).map(({ score, ...hit }) => hit) }
	}

	return {
		run,
		cacheSearch,
		/** Flush pending persistence (tests and lifecycle hooks). */
		async flush() {
			if (saveTimer !== null) {
				clearTimeout(saveTimer)
				saveTimer = null
			}
			await persist()
		},
	}
}
