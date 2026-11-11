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
			port: normalizePort(lan.port, defaults.lan?.port ?? DEFAULT_LAN_PORT),
		},
	}
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
