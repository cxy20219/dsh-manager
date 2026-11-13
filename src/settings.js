/**
 * The manager's own durable settings.
 *
 * The profile patch belongs to the user: plugin code never rewrites it. Both
 * the skill selection and the MCP server list are manager-owned data, so they
 * live next to the plugin in one JSON document with owner-only permissions.
 *
 * @module dsh-manager/settings
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** The port the LAN listener uses when the settings name none. */
export const DEFAULT_LAN_PORT = 8443

/** Most domain rules the settings keep. */
export const MAX_BLOCKED_DOMAINS = 200

/**
 * Turn arbitrary JSON into the settings shape the manager assumes.
 *
 * @param {unknown} raw - Value read from disk.
 * @param {object} defaults - Defaults for this installation.
 * @returns {object} A complete, normalized settings document.
 */
export function normalizeSettings(raw, defaults) {
	const source = raw !== null && typeof raw === 'object' ? raw : {}
	const skills = source.skills !== null && typeof source.skills === 'object' ? source.skills : {}
	const mcp = source.mcp !== null && typeof source.mcp === 'object' ? source.mcp : {}
	const lan = source.lan !== null && typeof source.lan === 'object' ? source.lan : {}
	const modes = source.modes !== null && typeof source.modes === 'object' ? source.modes : {}
	const search = source.search !== null && typeof source.search === 'object' ? source.search : {}
	const roots = Array.isArray(skills.roots)
		? uniqueStrings(skills.roots)
		: [...defaults.skills.roots]
	const servers = Array.isArray(mcp.servers) ? mcp.servers.map(normalizeServer).filter((server) => server !== undefined) : []
	return {
		version: 1,
		skills: {
			roots: roots.length > 0 ? roots : [...defaults.skills.roots],
			disabledCategories: uniqueStrings(skills.disabledCategories),
			disabledSkills: uniqueStrings(skills.disabledSkills),
		},
		mcp: {
			servers: dedupeServers(servers),
		},
		lan: {
			enabled: lan.enabled === true,
			secure: lan.secure === true,
			port: normalizePort(lan.port, defaults.lan?.port ?? DEFAULT_LAN_PORT),
		},
		modes: {
			// The switch the user set for each shipped mode. A mode added later
			// starts from its default instead of reading as "off".
			enabled: normalizeModeSwitches(modes.enabled, defaults.modes?.enabled),
		},
		search: {
			// One row per search channel: the switch and an optional base URL.
			// API keys are credentials, never settings, so they are not here.
			channels: normalizeSearchChannels(search.channels, defaults.search?.channels),
			mode: search.mode === 'fallback' || search.mode === 'auto' ? search.mode : 'merge',
			order: normalizeSearchOrder(search.order, defaults.search?.order),
			safeSearch: search.safeSearch !== false,
			cooldowns: normalizeCooldowns(search.cooldowns),
			blockedDomains: normalizeBlockedDomains(search.blockedDomains),
			freeFallbackSeeded: search.freeFallbackSeeded === true,
		},
	}
}

/**
 * Normalize the per-channel search switches and base URLs.
 *
 * The union of defaults and stored ids is kept so a channel added by a newer
 * build starts from its default row, while a stored row is not lost when a
 * test store omits the search defaults.
 *
 * @param {unknown} stored - The persisted channel map.
 * @param {object} [defaults] - Default channel rows.
 * @returns {Record<string, {enabled: boolean, baseUrl: string}>} The normalized channel map.
 */
function normalizeSearchChannels(stored, defaults) {
	const base = defaults !== null && typeof defaults === 'object' ? defaults : {}
	const overrides = stored !== null && typeof stored === 'object' ? stored : {}
	const channels = {}
	for (const id of new Set([...Object.keys(base), ...Object.keys(overrides)])) {
		if (!/^[a-z][a-z0-9-]*$/.test(id)) continue
		const fallback = base[id] !== null && typeof base[id] === 'object' ? base[id] : {}
		const value = overrides[id] !== null && typeof overrides[id] === 'object' ? overrides[id] : {}
		channels[id] = {
			enabled: (value.enabled ?? fallback.enabled) === true,
			baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl.trim() : typeof fallback.baseUrl === 'string' ? fallback.baseUrl.trim() : '',
		}
	}
	return channels
}

/**
 * Normalize the channel priority order.
 *
 * Stored ids keep their order; new ids are appended in the default order.
 * Unknown or duplicate ids are dropped.
 *
 * @param {unknown} stored - The persisted order.
 * @param {unknown} defaults - The default order.
 * @returns {string[]} Channel ids in priority order.
 */
function normalizeSearchOrder(stored, defaults) {
	const base = Array.isArray(defaults) ? defaults.filter((id) => typeof id === 'string' && /^[a-z][a-z0-9-]*$/.test(id)) : []
	const order = []
	const seen = new Set()
	for (const id of Array.isArray(stored) ? stored : []) {
		if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id) || seen.has(id)) continue
		seen.add(id)
		order.push(id)
	}
	for (const id of base) {
		if (seen.has(id)) continue
		seen.add(id)
		order.push(id)
	}
	return order
}

/**
 * Normalize persisted channel cooldowns.
 *
 * The manager keeps cooldowns in memory for fast reads and mirrors the live
 * ones here so a restart does not immediately re-hit a channel that just
 * failed. Expired and malformed entries are dropped instead of resurfacing.
 *
 * @param {unknown} value - Stored cooldown map.
 * @returns {Record<string, {until: number, code: string}>} The live entries.
 */
export function normalizeCooldowns(value) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
	const now = Date.now()
	const cooldowns = {}
	for (const [id, entry] of Object.entries(value)) {
		if (!/^[a-z][a-z0-9-]*$/.test(id)) continue
		const until = Number(entry?.until)
		if (!Number.isFinite(until) || until <= now) continue
		cooldowns[id] = {
			until: Math.floor(until),
			code: typeof entry?.code === 'string' ? entry.code.slice(0, 40) : 'unknown',
		}
	}
	return cooldowns
}

/**
 * Normalize the operator's domain blocklist into bare hostnames.
 *
 * Pasting a full URL is the common mistake; accept it and strip the scheme,
 * path, port and a leading `www.` so matching stays a plain suffix test. Rules
 * that are not plausible hostnames are dropped rather than kept as dead
 * entries. Matching semantics live in the search manager: a rule blocks its
 * own host and every subdomain.
 *
 * @param {unknown} value - Stored rules.
 * @returns {string[]} Unique bare hostnames, in the entered order.
 */
export function normalizeBlockedDomains(value) {
	if (!Array.isArray(value)) return []
	const domains = []
	const seen = new Set()
	for (const raw of value) {
		if (typeof raw !== 'string') continue
		let host = raw.trim().toLowerCase()
		if (host === '') continue
		host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
		const cut = host.search(/[/?#]/)
		if (cut >= 0) host = host.slice(0, cut)
		const colon = host.lastIndexOf(':')
		if (colon >= 0 && /^\d+$/.test(host.slice(colon + 1))) host = host.slice(0, colon)
		host = host.replace(/^www\./, '').replace(/\.+$/, '')
		if (host === '' || host.startsWith('.') || !/^[a-z0-9][a-z0-9.-]*$/.test(host)) continue
		if (seen.has(host)) continue
		seen.add(host)
		domains.push(host)
		if (domains.length >= MAX_BLOCKED_DOMAINS) break
	}
	return domains
}

/**
 * Keep one boolean per mode id, defaults first and the stored value on top.
 *
 * @param {unknown} stored - The persisted switch map.
 * @param {object} [defaults] - Default switches for this installation.
 * @returns {Record<string, boolean>} The normalized switch map.
 */
function normalizeModeSwitches(stored, defaults) {
	const base = defaults !== null && typeof defaults === 'object' ? defaults : {}
	const overrides = stored !== null && typeof stored === 'object' ? stored : {}
	const switches = {}
	for (const [id, value] of Object.entries({ ...base, ...overrides })) {
		if (typeof value === 'boolean') switches[id] = value
	}
	return switches
}

/**
 * Normalize the port of the LAN listener.
 *
 * @param {unknown} value - The candidate port.
 * @param {number} fallback - The default port.
 * @returns {number} The port.
 */
function normalizePort(value, fallback) {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 65535) return fallback
	return value
}

/**
 * Normalize one persisted MCP server row.
 *
 * @param {unknown} value - Candidate row.
 * @returns {object | undefined} The row, or undefined when unusable.
 */
function normalizeServer(value) {
	if (value === null || typeof value !== 'object') return undefined
	const id = typeof value.id === 'string' && value.id !== '' ? value.id : undefined
	const name = typeof value.name === 'string' && value.name !== '' ? value.name : undefined
	const command = typeof value.command === 'string' && value.command !== '' ? value.command : undefined
	if (id === undefined || name === undefined || command === undefined) return undefined
	return {
		id,
		name,
		command,
		args: uniqueStrings(value.args),
		cwd: typeof value.cwd === 'string' ? value.cwd : '',
		envKeys: uniqueStrings(value.envKeys),
		enabled: value.enabled !== false,
	}
}

/**
 * Keep the first row for each id and each name.
 *
 * @param {object[]} servers - Candidate rows.
 * @returns {object[]} The deduplicated rows.
 */
function dedupeServers(servers) {
	const ids = new Set()
	const names = new Set()
	const kept = []
	for (const server of servers) {
		if (ids.has(server.id) || names.has(server.name)) continue
		ids.add(server.id)
		names.add(server.name)
		kept.push(server)
	}
	return kept
}

/**
 * Read unique non-empty strings from a value.
 *
 * @param {unknown} value - Candidate array.
 * @returns {string[]} The unique strings.
 */
function uniqueStrings(value) {
	if (!Array.isArray(value)) return []
	const seen = new Set()
	for (const item of value) {
		if (typeof item !== 'string' || item === '') continue
		seen.add(item)
	}
	return [...seen]
}

/** In-process settings store for the manager's own data. */
export class SettingsStore {
	#path
	#logger
	#defaults
	#state
	#loaded = false
	#chain = Promise.resolve()
	#listeners = new Set()

	/**
	 * @param {{path: string, defaults: object, logger?: object}} options - Store options.
	 */
	constructor({ path, defaults, logger }) {
		this.#path = path
		this.#defaults = defaults
		this.#logger = logger
		this.#state = normalizeSettings(undefined, defaults)
	}

	/** Whether {@link load} finished (a missing file counts as loaded). */
	get loaded() {
		return this.#loaded
	}

	/** The current settings document. Treat it as readonly. */
	get() {
		return this.#state
	}

	/**
	 * Read the file once, falling back to defaults when it is absent or broken.
	 *
	 * @returns {Promise<void>} Resolves when loaded.
	 */
	async load() {
		try {
			const text = await readFile(this.#path, 'utf8')
			this.#state = normalizeSettings(JSON.parse(text), this.#defaults)
		} catch (error) {
			if (error?.code !== 'ENOENT') {
				this.#logger?.warn?.(`dsh-manager: 设置读取失败，使用默认值（${error instanceof Error ? error.message : String(error)}）`)
			}
		}
		this.#loaded = true
	}

	/**
	 * Subscribe to committed changes.
	 *
	 * Listeners run after the document is persisted, so a throwing listener
	 * cannot leave memory and disk disagreeing. The manager's system-prompt
	 * section uses this to follow the search switches.
	 *
	 * @param {(state: object) => void} listener - Called with the new state.
	 * @returns {() => void} Unsubscribe.
	 */
	onChange(listener) {
		if (typeof listener !== 'function') return () => {}
		this.#listeners.add(listener)
		return () => { this.#listeners.delete(listener) }
	}

	/**
	 * Notify subscribers; one failing listener must not stop the rest.
	 *
	 * @returns {void}
	 */
	#notify() {
		for (const listener of this.#listeners) {
			try {
				listener(this.#state)
			} catch (error) {
				this.#logger?.warn?.(`dsh-manager: 设置变更回调失败（${error instanceof Error ? error.message : String(error)}）`)
			}
		}
	}

	/**
	 * Apply one change and persist it, serialized with other writes.
	 *
	 * @param {(draft: object) => object | Promise<object>} mutate - Mutates a draft; returning a value replaces the draft.
	 * @returns {Promise<object>} The stored document.
	 */
	update(mutate) {
		const run = this.#chain.then(async () => {
			const draft = structuredClone(this.#state)
			const next = (await mutate(draft)) ?? draft
			this.#state = normalizeSettings(next, this.#defaults)
			await this.#save()
			this.#notify()
			return this.#state
		})
		this.#chain = run.catch(() => {})
		return run
	}

	/**
	 * Write the current document atomically with owner-only permissions.
	 *
	 * @returns {Promise<void>} Resolves after the rename.
	 */
	async #save() {
		await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 })
		const temporary = `${this.#path}.tmp-${process.pid}-${Date.now()}`
		await writeFile(temporary, `${JSON.stringify(this.#state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
		await rename(temporary, this.#path)
	}
}
