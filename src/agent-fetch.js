/**
 * Quality fetch provider for the agent's `web_fetch` tool.
 *
 * The same tiers dsh-free-search uses, minus the headless browser: direct HTTP
 * first, then Exa contents, Firecrawl and finally the Crawl4AI relay when their
 * keys are configured. The browser tier is deliberately omitted: spawning a
 * local Chrome/Edge is a different security decision and needs a CLI binary.
 *
 * @module dsh-manager/agent-fetch
 */

import { assertSafeUrl } from './research.js'
import { stripLoneSurrogates, truncateText } from './safe-text.js'

/** Provider id written into `web.fetchProvider`. */
export const FETCH_PROVIDER_ID = 'dsh-manager-fetch'

/** Bodies below this length are treated as challenge/placeholder pages. */
const MIN_TEXT_CHARS = 300

/** Hard cap for one body. */
const MAX_TEXT_CHARS = 200_000

/** Request headers. */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Crawl4AI's scrape endpoint (no /v1 prefix; auth is the X-API-Key header). */
const CRAWL4AI_ENDPOINT = 'https://api.crawl4ai.com/scrape'

/**
 * Combine a caller signal with a timeout.
 *
 * @param {AbortSignal} [signal] - Caller signal.
 * @param {number} timeoutMs - Timeout.
 * @returns {AbortSignal} Combined signal.
 */
function withTimeout(signal, timeoutMs) {
	const timeout = AbortSignal.timeout(timeoutMs)
	return signal === undefined ? timeout : AbortSignal.any([signal, timeout])
}

/**
 * Clip a body and report whether it was cut.
 *
 * @param {string} value - Body.
 * @returns {{content: string, truncated: boolean}} Clipped body.
 */
function clipBody(value) {
	if (value.length <= MAX_TEXT_CHARS) return { content: stripLoneSurrogates(value), truncated: false }
	return { content: truncateText(value, MAX_TEXT_CHARS), truncated: true }
}

/**
 * Build the fetch provider.
 *
 * @param {{search: object, fetchImpl?: Function, resolveHost?: Function, logger?: object}} options - Wiring.
 * @returns {{id: string, available: Function, fetch: Function}} Provider.
 */
export function createAgentFetchProvider({ search, credentials, fetchImpl, resolveHost, logger }) {
	const doFetch = typeof fetchImpl === 'function' ? fetchImpl : globalThis.fetch
	const resolve = (id) => (typeof search?.resolveKey === 'function' ? search.resolveKey(id) : Promise.resolve(''))

	/**
	 * Resolve a non-channel credential, e.g. the Crawl4AI key.
	 *
	 * @param {string} name - Credential reference.
	 * @returns {Promise<string>} The key, or an empty string.
	 */
	async function resolveCredential(name) {
		if (credentials !== undefined && credentials !== null && typeof credentials.resolve === 'function') {
			try {
				const resolved = await credentials.resolve(name)
				const value = typeof resolved === 'string'
					? resolved
					: (typeof resolved?.value === 'string' ? resolved.value : '')
				if (value.trim() !== '') return value.trim()
			} catch {
				// Fall through to the environment.
			}
		}
		const ambient = process.env[name]
		return typeof ambient === 'string' ? ambient.trim() : ''
	}

	/**
	 * Fetch a URL while checking every redirect hop.
	 *
	 * @param {string} value - URL.
	 * @param {AbortSignal} [signal] - Caller signal.
	 * @returns {Promise<Response>} Final response.
	 */
	async function fetchFollowing(value, signal) {
		let current = value
		for (let hop = 0; hop < 4; hop += 1) {
			const checked = await assertSafeUrl(current, resolveHost)
			const response = await doFetch(checked, {
				headers: {
					'user-agent': UA,
					accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8',
				},
				redirect: 'manual',
				signal: withTimeout(signal, 20_000),
			})
			if (response.status < 300 || response.status >= 400) return response
			const location = response.headers.get('location')
			if (location === null || location === '') return response
			current = new URL(location, checked).toString()
		}
		throw new Error('too many redirects')
	}

	/**
	 * Read a textual response.
	 *
	 * @param {Response} response - Response.
	 * @returns {Promise<{kind: string, content: string, truncated: boolean}>} Body.
	 */
	async function readBody(response) {
		const type = String(response.headers.get('content-type') ?? '').toLowerCase()
		if (!/text\/|html|xhtml|json|xml/.test(type)) throw new Error(`unsupported content type ${type || 'unknown'}`)
		const text = await response.text()
		const clipped = clipBody(text)
		return {
			kind: /html|xhtml/.test(type) ? 'html' : 'text',
			content: clipped.content,
			truncated: clipped.truncated,
		}
	}

	/**
	 * Direct HTTP tier.
	 *
	 * @param {string} url - URL.
	 * @param {AbortSignal} [signal] - Caller signal.
	 * @returns {Promise<object>} Provider result.
	 */
	async function direct(url, signal) {
		const response = await fetchFollowing(url, signal)
		if (!response.ok) throw new Error(`direct HTTP ${response.status}`)
		const body = await readBody(response)
		if (body.content.length < MIN_TEXT_CHARS) throw new Error(`direct: short body (${body.content.length}B)`)
		return { url, statusCode: response.status, body, truncated: body.truncated }
	}

	/**
	 * POST a JSON API and parse a JSON response.
	 *
	 * @param {string} endpoint - URL.
	 * @param {string} key - API key.
	 * @param {object} payload - Body.
	 * @param {AbortSignal} [signal] - Caller signal.
	 * @returns {Promise<object>} Parsed JSON.
	 */
	async function postJson(endpoint, key, payload, signal) {
		const response = await doFetch(endpoint, {
			method: 'POST',
			headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify(payload),
			redirect: 'error',
			signal: withTimeout(signal, 30_000),
		})
		if (!response.ok) throw new Error(`HTTP ${response.status}`)
		return await response.json()
	}

	/**
	 * Exa contents tier.
	 *
	 * @param {string} url - URL.
	 * @param {AbortSignal} [signal] - Caller signal.
	 * @returns {Promise<object | null>} Provider result or null.
	 */
	async function exaTier(url, signal) {
		const key = await resolve('exa')
		if (key === '') return null
		const data = await postJson('https://api.exa.ai/contents', key, { ids: [url], text: true }, signal)
		const status = (data.statuses ?? []).find((entry) => entry.id === url) ?? data.statuses?.[0]
		if (status !== undefined && status.status !== 'success') throw new Error(`Exa: ${status.status}`)
		const hit = (data.results ?? []).find((entry) => entry.id === url || entry.url === url) ?? data.results?.[0]
		const text = typeof hit?.text === 'string' ? hit.text : ''
		if (text.trim().length < MIN_TEXT_CHARS) throw new Error('Exa: short content')
		const clipped = clipBody(text)
		return { url, statusCode: 200, body: { kind: 'text', content: clipped.content }, truncated: clipped.truncated }
	}

	/**
	 * Firecrawl scrape tier.
	 *
	 * @param {string} url - URL.
	 * @param {AbortSignal} [signal] - Caller signal.
	 * @returns {Promise<object | null>} Provider result or null.
	 */
	async function firecrawlTier(url, signal) {
		const key = await resolve('firecrawl')
		if (key === '') return null
		const data = await postJson('https://api.firecrawl.dev/v2/scrape', key, { url, formats: ['markdown'] }, signal)
		const markdown = typeof data?.data?.markdown === 'string' ? data.data.markdown : ''
		if (markdown.trim().length < MIN_TEXT_CHARS) throw new Error('Firecrawl: short content')
		const clipped = clipBody(markdown)
		return { url, statusCode: 200, body: { kind: 'text', content: clipped.content }, truncated: clipped.truncated }
	}

	/**
	 * Crawl4AI relay tier.
	 *
	 * @param {string} url - URL.
	 * @param {AbortSignal} [signal] - Caller signal.
	 * @returns {Promise<object | null>} Provider result or null.
	 */
	async function crawl4aiTier(url, signal) {
		const key = await resolveCredential('CRAWL4AI_API_KEY')
		if (key === '') return null
		const response = await doFetch(CRAWL4AI_ENDPOINT, {
			method: 'POST',
			headers: {
				'x-api-key': key,
				'content-type': 'application/json',
				accept: 'application/json',
			},
			body: JSON.stringify({ url }),
			redirect: 'error',
			signal: withTimeout(signal, 45_000),
		})
		if (!response.ok) throw new Error(`crawl4ai HTTP ${response.status}`)
		const data = await response.json()
		const markdown = typeof data?.markdown === 'string' ? data.markdown : ''
		if (markdown.trim().length < MIN_TEXT_CHARS) throw new Error('crawl4ai: short content')
		const clipped = clipBody(markdown)
		return { url, statusCode: 200, body: { kind: 'text', content: clipped.content }, truncated: clipped.truncated }
	}

	return {
		id: FETCH_PROVIDER_ID,
		available() {
			return true
		},
		async fetch(request, signal) {
			const url = String(request?.url ?? '')
			if (!/^https?:\/\//i.test(url)) throw new Error(`dsh-manager-fetch: only http(s) URLs are supported (got "${url.slice(0, 60)}")`)
			await assertSafeUrl(url, resolveHost)
			const errors = []
			for (const tier of [direct, exaTier, firecrawlTier, crawl4aiTier]) {
				try {
					const result = await tier(url, signal)
					if (result !== null) return result
				} catch (error) {
					errors.push(error instanceof Error ? error.message : String(error))
				}
			}
			logger?.warn?.(`dsh-manager-fetch: all tiers failed for ${url}: ${errors.join('; ')}`)
			throw new Error(`dsh-manager-fetch: could not fetch ${url} (${errors.join('; ')})`)
		},
	}
}
