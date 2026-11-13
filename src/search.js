/**
 * The manager's native multi-channel search.
 *
 * The panel owns the channel switches, base URLs and API keys; each channel
 * adapter makes one HTTP request per search. Keys live in the Host's
 * credential store (`dsh-manager/search-<id>`), never in the settings file.
 * A search either fans out to every enabled channel and merges the sources,
 * or walks the priority order and stops at the first channel with a hit.
 * Failed channels rest for a short cooldown; successful results are cached in
 * memory for five minutes.
 *
 * @module dsh-manager/search
 */

import { normalizeTimeRange, SEARCH_CHANNELS, SEARCH_CHANNEL_BY_ID, SearchChannelError } from './search-providers.js'

/** Most sources the merged result keeps. */
export const MAX_RESULTS = 20

/** Most sources requested from one channel. */
export const PER_CHANNEL_RESULTS = 10

/** How long one channel gets before its request is aborted. */
export const CHANNEL_TIMEOUT_MS = 20_000

/** Cap for provider answer text. */
const MAX_CONTENT_CHARS = 4_000

/** Cap for a source field. */
const MAX_FIELD_CHARS = 4_000

/** Longest accepted base URL. */
const MAX_BASE_URL_CHARS = 500

/** Credential record prefix. */
const RECORD_PREFIX = 'dsh-manager/search-'

/** Result cache lifetime. */
const CACHE_TTL_MS = 5 * 60_000

/** Result cache capacity. */
const CACHE_MAX_ENTRIES = 50

/** How long a failed channel rests, by failure class. */
const COOLDOWN_MS = {
	auth: 5 * 60_000,
	quota: 5 * 60_000,
	'rate-limit': 60_000,
	'bot-wall': 60_000,
}

/**
 * Build the search manager.
 *
 * @param {{settings: object, credentials?: object, logger?: object, fetchImpl?: Function}} options - Wiring.
 * @returns {{describe: () => Promise<object>, save: (input: object) => Promise<object>, test: (input: object) => Promise<object>, search: (input: object) => Promise<object>}} The manager.
 */
export function createSearchManager({ settings, credentials, logger, fetchImpl }) {
	const cache = new Map()
	const cooldowns = new Map()
	/**
	 * One channel's stored switch and base URL.
	 *
	 * @param {string} id - Channel id.
	 * @returns {{enabled: boolean, baseUrl: string}} The config.
	 */
	function configOf(id) {
		const channels = settings.get().search?.channels
		const stored = channels !== null && typeof channels === 'object' ? channels[id] : undefined
		return {
			enabled: stored?.enabled === true,
			baseUrl: typeof stored?.baseUrl === 'string' ? stored.baseUrl : '',
		}
	}

	/**
	 * The credential record key for one channel.
	 *
	 * @param {string} id - Channel id.
	 * @returns {string} The record key.
	 */
	function credentialKey(id) {
		return `${RECORD_PREFIX}${id}`
	}
	/**
	 * The configured channel order, with any new channel appended.
	 *
	 * @returns {string[]} Channel ids in priority order.
	 */
	function orderOf() {
		const stored = settings.get().search?.order
		const order = []
		const seen = new Set()
		for (const id of Array.isArray(stored) ? stored : []) {
			if (typeof id !== 'string' || seen.has(id) || !SEARCH_CHANNEL_BY_ID.has(id)) continue
			seen.add(id)
			order.push(id)
		}
		for (const channel of SEARCH_CHANNELS) {
			if (seen.has(channel.id)) continue
			seen.add(channel.id)
			order.push(channel.id)
		}
		return order
	}

	/** @returns {'merge' | 'fallback'} The search mode. */
	function modeOf() {
		return settings.get().search?.mode === 'fallback' ? 'fallback' : 'merge'
	}

	/**
	 * The active cooldown for one channel.
	 *
	 * @param {string} id - Channel id.
	 * @returns {number} Remaining milliseconds, or 0.
	 */
	function cooldownMsOf(id) {
		const entry = cooldowns.get(id)
		if (entry === undefined) return 0
		const remaining = entry.until - Date.now()
		if (remaining > 0) return remaining
		cooldowns.delete(id)
		return 0
	}

	/**
	 * Record a channel failure that should rest the channel.
	 *
	 * Configuration errors are deliberately excluded: a missing key is fixed
	 * by the operator, not by time.
	 *
	 * @param {string} id - Channel id.
	 * @param {string} code - Failure class.
	 * @returns {void}
	 */
	function setCooldown(id, code) {
		const duration = COOLDOWN_MS[code]
		if (duration === undefined) {
			cooldowns.delete(id)
			return
		}
		cooldowns.set(id, { until: Date.now() + duration, code })
	}

	/** @returns {Record<string, number>} Remaining cooldowns by channel id. */
	function activeCooldowns() {
		const active = {}
		for (const [id, entry] of cooldowns) {
			const remaining = entry.until - Date.now()
			if (remaining > 0) active[id] = remaining
			else cooldowns.delete(id)
		}
		return active
	}

	/** Drop cached results after a configuration change. */
	function clearCache() {
		cache.clear()
	}

	/**
	 * The cache key for one live search.
	 *
	 * @param {string} query - Query.
	 * @param {number} limit - Merged limit.
	 * @param {string} mode - Search mode.
	 * @param {object[]} enabled - Enabled channels in priority order.
	 * @param {string} timeRange - Fixed time filter.
	 * @returns {string} Cache key.
	 */
	function cacheKeyOf(query, limit, mode, enabled, timeRange) {
		return JSON.stringify({
			query,
			limit,
			mode,
			timeRange,
			channels: enabled.map((channel) => [channel.id, configOf(channel.id).baseUrl]),
		})
	}

	/**
	 * Read a live result from the LRU cache.
	 *
	 * @param {string} key - Cache key.
	 * @returns {object | null} Cached result.
	 */
	function cacheGet(key) {
		const entry = cache.get(key)
		if (entry === undefined) return null
		if (entry.expiresAt <= Date.now()) {
			cache.delete(key)
			return null
		}
		cache.delete(key)
		cache.set(key, entry)
		return entry.value
	}

	/**
	 * Store a successful live result.
	 *
	 * @param {string} key - Cache key.
	 * @param {object} value - Result payload.
	 * @returns {void}
	 */
	function cacheSet(key, value) {
		if (cache.size >= CACHE_MAX_ENTRIES) {
			const oldest = cache.keys().next().value
			if (oldest !== undefined) cache.delete(oldest)
		}
		cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
	}

	/**
	 * Resolve one channel's key: stored record first, then its environment name.
	 *
	 * @param {object} channel - Channel metadata.
	 * @returns {Promise<{value: string, source: string}>} The key and its source.
	 */
	async function keyOf(channel) {
		if (credentials !== undefined) {
			try {
				const record = await credentials.readRecord(credentialKey(channel.id))
				const value = record?.kind === 'api-key' && typeof record.key === 'string' ? record.key.trim() : ''
				if (value !== '') return { value, source: 'record' }
			} catch (error) {
				logger?.warn?.(`dsh-manager: 读取 ${channel.label} 的搜索凭证失败（${error instanceof Error ? error.message : String(error)}）`)
			}
			// Reuse a key already configured in the Host's credential center under
			// the provider's conventional name (the same ref dsh-free-search and
			// the official integration use). The manager-specific record still wins.
			if (channel.envName !== '' && typeof credentials.resolve === 'function') {
				try {
					const resolved = await credentials.resolve(channel.envName)
					const value = typeof resolved === 'string'
						? resolved.trim()
						: (typeof resolved?.value === 'string' ? resolved.value.trim() : '')
					if (value !== '') return { value, source: 'host' }
				} catch (error) {
					logger?.warn?.(`dsh-manager: 解析宿主凭据 ${channel.envName} 失败（${error instanceof Error ? error.message : String(error)}）`)
				}
			}
		}
		const ambient = process.env[channel.envName]
		if (typeof ambient === 'string' && ambient.trim() !== '') return { value: ambient.trim(), source: 'env' }
		return { value: '', source: '' }
	}

	/**
	 * The panel view of one channel; never includes the key.
	 *
	 * @param {object} channel - Channel metadata.
	 * @returns {Promise<object>} The channel view.
	 */
	async function channelView(channel) {
		const config = configOf(channel.id)
		const key = channel.keyMode === 'none' ? { value: '', source: '' } : await keyOf(channel)
		return {
			id: channel.id,
			label: channel.label,
			description: channel.description,
			keyMode: channel.keyMode,
			requiresKey: channel.keyMode === 'required',
			keySupported: channel.keyMode !== 'none',
			keyOptional: channel.keyMode === 'optional',
			free: channel.free === true,
			defaultBaseUrl: channel.defaultBaseUrl,
			envName: channel.envName,
			enabled: config.enabled,
			baseUrl: config.baseUrl,
			keyConfigured: key.value !== '',
			keySource: key.source,
			keyWritable: credentials !== undefined,
			cooldownMs: cooldownMsOf(channel.id),
		}
	}

	/**
	 * The full channel list plus the merge limits.
	 *
	 * @returns {Promise<object>} The status view.
	 */
	async function describe() {
		const order = orderOf()
		const views = await Promise.all(order.map(async (id) => {
			const channel = SEARCH_CHANNEL_BY_ID.get(id)
			return channel === undefined ? null : channelView(channel)
		}))
		const channels = views.filter((channel) => channel !== null)
		return {
			channels,
			enabledCount: channels.filter((channel) => channel.enabled).length,
			maxResults: MAX_RESULTS,
			perChannelResults: PER_CHANNEL_RESULTS,
			mode: modeOf(),
			order,
			cooldowns: activeCooldowns(),
			cacheTtlMs: CACHE_TTL_MS,
		}
	}

	/**
	 * Validate and normalize an operator-entered base URL.
	 *
	 * @param {unknown} value - Raw base URL.
	 * @returns {string} The stored form (empty means the channel default).
	 */
	function normalizeBaseUrl(value) {
		if (typeof value !== 'string') throw new Error('服务地址必须是字符串。')
		const trimmed = value.trim()
		if (trimmed === '') return ''
		if (trimmed.length > MAX_BASE_URL_CHARS) throw new Error(`服务地址不能超过 ${MAX_BASE_URL_CHARS} 个字符。`)
		let url
		try {
			url = new URL(trimmed)
		} catch {
			throw new Error('服务地址不是有效的 URL。')
		}
		if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('服务地址只支持 http/https。')
		if (url.username !== '' || url.password !== '') throw new Error('服务地址不能包含用户名或密码，请把凭证填在 API Key 里。')
		if (url.search !== '' || url.hash !== '') throw new Error('服务地址不要带查询参数或锚点。')
		return trimmed.replace(/\/+$/, '')
	}

	/**
	 * Save one channel's switch, base URL, or key.
	 *
	 * `enabled` and `baseUrl` omitted mean "keep"; an `apiKey` of `''` also
	 * means "keep", and `clearKey: true` removes the stored key.
	 *
	 * @param {{id?: unknown, enabled?: unknown, baseUrl?: unknown, apiKey?: unknown, clearKey?: unknown}} input - Request payload.
	 * @returns {Promise<object>} The refreshed status view.
	 */
	async function save(input) {
		const id = typeof input?.id === 'string' ? input.id : ''
		const channel = SEARCH_CHANNEL_BY_ID.get(id)
		if (channel === undefined) throw new Error('未知的搜索渠道。')
		const current = configOf(id)
		const next = { enabled: current.enabled, baseUrl: current.baseUrl }
		if (typeof input?.enabled === 'boolean') next.enabled = input.enabled
		if (input?.baseUrl !== undefined) next.baseUrl = normalizeBaseUrl(input.baseUrl)
		if (input?.apiKey !== undefined) {
			if (typeof input.apiKey !== 'string') throw new Error('API Key 必须是字符串。')
			if (channel.keyMode === 'none') throw new Error(`${channel.label} 不需要 API Key。`)
			const value = input.apiKey.trim()
			if (value !== '') {
				if (credentials === undefined) throw new Error(`当前 Host 没有凭证服务，无法保存 API Key；可改用环境变量 ${channel.envName}。`)
				await credentials.modifyRecord(credentialKey(id), async () => ({ kind: 'api-key', key: value }))
			}
		}
		if (input?.clearKey === true) {
			if (credentials === undefined) throw new Error('当前 Host 没有凭证服务，无法清除 API Key。')
			await credentials.deleteRecord(credentialKey(id)).catch(() => {})
		}
		await settings.update((draft) => {
			draft.search = draft.search !== null && typeof draft.search === 'object' ? draft.search : {}
			draft.search.channels = draft.search.channels !== null && typeof draft.search.channels === 'object' ? draft.search.channels : {}
			draft.search.channels[id] = next
			return draft
		})
		cooldowns.delete(id)
		clearCache()
		return describe()
	}

	/**
	 * Persist the channel priority order.
	 *
	 * @param {{ids?: unknown}} input - Requested order.
	 * @returns {Promise<object>} The refreshed status view.
	 */
	async function saveOrder(input) {
		const requested = Array.isArray(input?.ids) ? input.ids : []
		const order = []
		const seen = new Set()
		for (const id of requested) {
			if (typeof id !== 'string' || !SEARCH_CHANNEL_BY_ID.has(id)) throw new Error('搜索渠道顺序里有未知的渠道。')
			if (seen.has(id)) throw new Error('搜索渠道顺序不能重复。')
			seen.add(id)
			order.push(id)
		}
		for (const channel of SEARCH_CHANNELS) {
			if (!seen.has(channel.id)) order.push(channel.id)
		}
		await settings.update((draft) => {
			draft.search = draft.search !== null && typeof draft.search === 'object' ? draft.search : {}
			draft.search.order = order
			return draft
		})
		clearCache()
		return describe()
	}

	/**
	 * Persist the search mode.
	 *
	 * @param {{mode?: unknown}} input - `merge` or `fallback`.
	 * @returns {Promise<object>} The refreshed status view.
	 */
	async function saveMode(input) {
		const mode = input?.mode
		if (mode !== 'merge' && mode !== 'fallback') throw new Error('搜索模式只能是 merge 或 fallback。')
		await settings.update((draft) => {
			draft.search = draft.search !== null && typeof draft.search === 'object' ? draft.search : {}
			draft.search.mode = mode
			return draft
		})
		clearCache()
		return describe()
	}

	/**
	 * Clear every channel cooldown.
	 *
	 * @returns {Promise<object>} The refreshed status view.
	 */
	async function clearCooldowns() {
		cooldowns.clear()
		clearCache()
		return describe()
	}

	/**
	 * Run one channel's adapter with a bounded timeout.
	 *
	 * @param {object} channel - Channel metadata.
	 * @param {{enabled: boolean, baseUrl: string}} config - Stored config.
	 * @param {string} apiKey - Resolved key.
	 * @param {string} query - Search query.
	 * @param {number} maxResults - Per-channel cap.
	 * @param {string} [timeRange] - Fixed time filter.
	 * @returns {Promise<object>} The adapter outcome.
	 */
	async function runChannel(channel, config, apiKey, query, maxResults, timeRange = '') {
		const signal = AbortSignal.timeout(CHANNEL_TIMEOUT_MS)
		return await channel.search({
			query,
			maxResults,
			timeRange,
			apiKey,
			baseUrl: config.baseUrl,
			signal,
			fetchImpl,
		})
	}

	/**
	 * Normalize one adapter failure for the panel.
	 *
	 * @param {unknown} error - Thrown value.
	 * @returns {{code: string, message: string}} The error view.
	 */
	function errorView(error) {
		if (error instanceof SearchChannelError) return { code: error.code, message: error.message }
		if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
			return { code: 'timeout', message: '搜索超时。' }
		}
		return {
			code: 'server',
			message: error instanceof Error ? error.message : String(error),
		}
	}

	/**
	 * Filter and cap one channel's sources, adding its identity.
	 *
	 * @param {unknown} rawSources - Adapter sources.
	 * @param {object} channel - Channel metadata.
	 * @param {number} limit - Maximum sources.
	 * @returns {object[]} Normalized sources.
	 */
	function normalizeSources(rawSources, channel, limit) {
		if (!Array.isArray(rawSources)) return []
		const sources = []
		for (const raw of rawSources) {
			if (sources.length >= limit) break
			if (raw === null || typeof raw !== 'object') continue
			const url = typeof raw.url === 'string' ? raw.url.trim() : ''
			if (!isHttpUrl(url) || url.length > MAX_FIELD_CHARS) continue
			const source = {
				url,
				title: clip(typeof raw.title === 'string' ? raw.title.trim() : '', MAX_FIELD_CHARS),
				snippet: clip(typeof raw.snippet === 'string' ? raw.snippet : '', MAX_FIELD_CHARS),
				publishedAt: clip(typeof raw.publishedAt === 'string' ? raw.publishedAt.trim() : '', 200),
				channel: channel.id,
				channelLabel: channel.label,
			}
			sources.push(source)
		}
		return sources
	}

	/**
	 * Merge channel results round-robin by rank, deduplicating URLs.
	 *
	 * @param {object[]} runs - Per-channel run results.
	 * @param {number} limit - Merged cap.
	 * @returns {object[]} The merged sources.
	 */
	function mergeSources(runs, limit) {
		const lists = runs
			.filter((run) => run.ok && run.sources.length > 0)
			.map((run) => run.sources)
		const seen = new Set()
		const merged = []
		let rank = 0
		while (merged.length < limit) {
			let consumed = false
			for (const sources of lists) {
				const source = sources[rank]
				if (source === undefined) continue
				consumed = true
				const key = urlKey(source.url)
				if (key === '' || seen.has(key)) continue
				seen.add(key)
				merged.push(source)
				if (merged.length >= limit) break
			}
			if (!consumed) break
			rank += 1
		}
		return merged
	}

	/**
	 * Test one channel without changing the enabled switches or live state.
	 *
	 * @param {{id?: unknown, query?: unknown}} input - Channel and optional query.
	 * @returns {Promise<object>} The test view.
	 */
	async function test(input) {
		const id = typeof input?.id === 'string' ? input.id : ''
		const channel = SEARCH_CHANNEL_BY_ID.get(id)
		if (channel === undefined) throw new Error('未知的搜索渠道。')
		const query = typeof input?.query === 'string' && input.query.trim() !== '' ? input.query.trim() : 'DeepSeek Harness'
		const config = configOf(id)
		const key = channel.keyMode === 'none' ? { value: '', source: '' } : await keyOf(channel)
		if (channel.keyMode === 'required' && key.value === '') {
			return {
				ok: false,
				id,
				label: channel.label,
				query,
				elapsedMs: 0,
				count: 0,
				sources: [],
				failure: { code: 'config', message: `${channel.label} 缺少 API Key。` },
			}
		}
		const started = Date.now()
		try {
			const outcome = await runChannel(channel, config, key.value, query, 5, normalizeTimeRange(input?.timeRange))
			cooldowns.delete(id)
			const sources = normalizeSources(outcome?.sources, channel, 5)
			return {
				ok: true,
				id,
				label: channel.label,
				query,
				elapsedMs: Date.now() - started,
				count: sources.length,
				sources: sources.slice(0, 3),
				cooldownMs: 0,
			}
		} catch (error) {
			const failure = errorView(error)
			setCooldown(id, failure.code)
			return {
				ok: false,
				id,
				label: channel.label,
				query,
				elapsedMs: Date.now() - started,
				count: 0,
				sources: [],
				failure,
				cooldownMs: cooldownMsOf(id),
			}
		}
	}

	/**
	 * Run one channel, recording a cooldown when it fails.
	 *
	 * @param {object} channel - Channel metadata.
	 * @param {string} query - Search query.
	 * @param {number} perChannel - Per-channel cap.
	 * @returns {Promise<object>} One run result.
	 */
	async function attemptChannel(channel, query, perChannel, timeRange) {
		const config = configOf(channel.id)
		const key = channel.keyMode === 'none' ? { value: '', source: '' } : await keyOf(channel)
		if (channel.keyMode === 'required' && key.value === '') {
			return {
				channel,
				ok: false,
				sources: [],
				content: '',
				elapsedMs: 0,
				error: { code: 'config', message: `${channel.label} 缺少 API Key。` },
			}
		}
		const started = Date.now()
		try {
			const outcome = await runChannel(channel, config, key.value, query, perChannel, timeRange)
			cooldowns.delete(channel.id)
			return {
				channel,
				ok: true,
				sources: normalizeSources(outcome?.sources, channel, perChannel),
				content: typeof outcome?.content === 'string' ? outcome.content.trim() : '',
				elapsedMs: Date.now() - started,
			}
		} catch (error) {
			const failure = errorView(error)
			setCooldown(channel.id, failure.code)
			const cooldownMs = cooldownMsOf(channel.id)
			return {
				channel,
				ok: false,
				sources: [],
				content: '',
				elapsedMs: Date.now() - started,
				error: failure,
				...(cooldownMs > 0 ? { cooldownMs } : {}),
			}
		}
	}

	/**
	 * Build the run result for a channel that is resting.
	 *
	 * @param {object} channel - Channel metadata.
	 * @param {number} remainingMs - Remaining cooldown.
	 * @returns {object} One run result.
	 */
	function cooledRun(channel, remainingMs) {
		return {
			channel,
			ok: false,
			sources: [],
			content: '',
			elapsedMs: 0,
			error: {
				code: 'cooldown',
				message: `${channel.label} 冷却中，约 ${Math.ceil(remainingMs / 1000)} 秒后重试。`,
			},
			cooldownMs: remainingMs,
		}
	}

	/**
	 * Run one channel unless it is cooling down.
	 *
	 * @param {object} channel - Channel metadata.
	 * @param {string} query - Search query.
	 * @param {number} perChannel - Per-channel cap.
	 * @returns {Promise<object>} One run result.
	 */
	async function runOne(channel, query, perChannel, timeRange) {
		const remainingMs = cooldownMsOf(channel.id)
		if (remainingMs > 0) return cooledRun(channel, remainingMs)
		return attemptChannel(channel, query, perChannel, timeRange)
	}

	/**
	 * Run one query across enabled channels.
	 *
	 * `merge` fans out to every enabled channel and merges by rank. `fallback`
	 * walks the configured order and stops at the first channel that returns a
	 * source; a successful empty response does not stop the walk.
	 *
	 * @param {{query?: unknown, maxResults?: unknown}} input - Query and cap.
	 * @returns {Promise<object>} The result and one status per attempted channel.
	 */
	async function search(input) {
		const query = typeof input?.query === 'string' ? input.query.trim() : ''
		if (query === '') throw new Error('请输入搜索关键词。')
		if (query.length > 2_000) throw new Error('搜索关键词不能超过 2000 个字符。')
		const limit = readMaxResults(input?.maxResults)
		const timeRange = normalizeTimeRange(input?.timeRange)
		const requested = Array.isArray(input?.channels)
			? [...new Set(input.channels.filter((id) => typeof id === 'string'))]
			: []
		for (const id of requested) {
			if (!SEARCH_CHANNEL_BY_ID.has(id)) throw new Error(`未知的搜索渠道：${id}`)
		}
		const order = orderOf()
		const enabled = order
			.map((id) => SEARCH_CHANNEL_BY_ID.get(id))
			.filter((channel) => channel !== undefined && configOf(channel.id).enabled && (requested.length === 0 || requested.includes(channel.id)))
		if (enabled.length === 0) throw new Error('没有启用的搜索渠道，请先在下方打开并配置至少一个渠道。')
		const mode = modeOf()
		const perChannel = Math.min(PER_CHANNEL_RESULTS, limit)
		const cacheKey = cacheKeyOf(query, limit, mode, enabled, timeRange)
		const cached = cacheGet(cacheKey)
		if (cached !== null) return { ...cached, cached: true }

		const started = Date.now()
		const runs = []
		if (mode === 'fallback') {
			for (const channel of enabled) {
				const run = await runOne(channel, query, perChannel, timeRange)
				runs.push(run)
				if (run.ok === true && run.sources.length > 0) break
			}
		} else {
			runs.push(...await Promise.all(enabled.map((channel) => runOne(channel, query, perChannel, timeRange))))
		}

		const sources = mode === 'fallback'
			? (runs.find((run) => run.ok === true && run.sources.length > 0)?.sources ?? []).slice(0, limit)
			: mergeSources(runs, limit)
		const contentRuns = mode === 'fallback'
			? runs.filter((run) => run.ok === true && run.sources.length > 0).slice(0, 1)
			: runs.filter((run) => run.ok === true && run.content !== '')
		const content = contentRuns
			.map((run) => `${run.channel.label}：${run.content}`)
			.join('\n\n')
		const allCooling = runs.length > 0 && runs.every((run) => run.error?.code === 'cooldown')
		const payload = {
			query,
			mode,
			timeRange,
			channelsRequested: requested,
			cached: false,
			elapsedMs: Date.now() - started,
			maxResults: limit,
			sources,
			content: clip(content, MAX_CONTENT_CHARS),
			allCooling,
			channels: runs.map((run) => ({
				id: run.channel.id,
				label: run.channel.label,
				ok: run.ok,
				count: run.sources.length,
				elapsedMs: run.elapsedMs,
				...(run.error === undefined ? {} : { error: run.error }),
				...(run.cooldownMs === undefined ? {} : { cooldownMs: run.cooldownMs }),
			})),
		}
		if (sources.length > 0) cacheSet(cacheKey, payload)
		return payload
	}

	return { describe, save, saveOrder, saveMode, clearCooldowns, test, search }
}

/**
 * Validate a requested merged result count.
 *
 * @param {unknown} value - Raw count.
 * @returns {number} The accepted count.
 */
function readMaxResults(value) {
	if (value === undefined || value === null) return MAX_RESULTS
	const parsed = Number(value)
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_RESULTS) {
		throw new Error(`maxResults 必须是 1 到 ${MAX_RESULTS} 的整数。`)
	}
	return parsed
}

/**
 * Whether a URL is an absolute HTTP(S) URL.
 *
 * @param {string} value - Candidate.
 * @returns {boolean} Whether it is a web URL.
 */
function isHttpUrl(value) {
	try {
		const url = new URL(value)
		return url.protocol === 'http:' || url.protocol === 'https:'
	} catch {
		return false
	}
}

/**
 * Deduplication key for a URL: no fragment, normalized origin.
 *
 * @param {string} value - URL.
 * @returns {string} The key, or an empty string.
 */
function urlKey(value) {
	try {
		const url = new URL(value)
		url.hash = ''
		return url.toString()
	} catch {
		return ''
	}
}

/**
 * Clip text without splitting a surrogate pair.
 *
 * @param {string} value - Text.
 * @param {number} limit - Maximum characters.
 * @returns {string} The clipped text.
 */
function clip(value, limit) {
	if (value.length <= limit) return value
	return [...value].slice(0, limit).join('') + '…'
}
