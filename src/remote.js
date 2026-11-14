/**
 * The browser-facing surface of the manager.
 *
 * The panel is a Client plugin, so its data comes through the Host's
 * Connection service: one authenticated prefix (`/api/manager`) owned by this
 * plugin. Every endpoint takes plain JSON and answers plain JSON.
 *
 * @module dsh-manager/remote
 */

import { legacyCreate, legacyRead, legacySnapshot, legacyToggle } from './skills-adapter.js'
import { KERNEL_EXTERNAL_PROVIDER } from './skills-kernel.js'

/** The endpoints the panel may call. */
export const ENDPOINTS = [
	'overview',
	'skills-refresh',
	'skill-toggle',
	'skill-read',
	'skill-create',
	'mcp-status',
	'mcp-save',
	'mcp-remove',
	'mcp-toggle',
	'mcp-reconnect',
	'lan-status',
	'lan-toggle',
	'lan-ca',
	'search-status',
	'search-save',
	'search-order',
	'search-mode',
	'search-safe-search',
	'search-blocked-domains',
	'search-cooldowns-clear',
	'search-test',
	'search-test-all',
	'search-query',
	'mode-toggle',
]

/**
 * Build the endpoint handler.
 *
 * @param {{mcp: object, modes?: object, lan?: object, settings?: object, version: string, dataDir: string, registry?: object, search?: object}} deps - Services the endpoints use.
 * @returns {(endpoint: string, payload: unknown) => Promise<object>} The handler.
 */
export function createManagerHandler({ mcp, modes, lan, settings, version, dataDir, registry, search, kernel }) {
	/**
	 * The catalog the agent is actually offered, projected against this scan.
	 *
	 * The registry merges every provider, so this is also how a skill from a
	 * higher-priority provider that shadows one of ours becomes visible. The
	 * lookup has no workspace, so project-level skills are out of scope.
	 *
	 * @param {object} snapshot - The manager's own scanned skills.
	 * @returns {Promise<object>} The catalog view.
	 */
	async function catalogOf(snapshot) {
		const empty = { total: 0, visible: 0, managed: 0, external: [], missing: [], unavailable: false, error: '' }
		if (registry === undefined || typeof registry.list !== 'function') return { ...empty, unavailable: true }
		try {
			const summaries = await registry.list({})
			let managed = 0
			let visible = 0
			const external = []
			const present = new Set()
			for (const summary of summaries) {
				present.add(summary.name)
				// Both the kernel's overlay provider and its agent-scoped twin count
				// as "managed by this plugin"; anything else is another provider's.
				if (summary.provider === KERNEL_EXTERNAL_PROVIDER) managed += 1
				else external.push(summary.name)
				if (summary.invocation?.modelInvocable !== false) visible += 1
			}
			const missing = []
			for (const category of snapshot.categories) {
				for (const skill of category.skills) {
					if (skill.enabled && !present.has(skill.name)) missing.push(skill.name)
				}
			}
			return {
				total: summaries.length,
				visible,
				managed,
				external: external.sort(),
				missing: missing.sort(),
				unavailable: false,
				error: '',
			}
		} catch (error) {
			return {
				...empty,
				error: error instanceof Error ? error.message : String(error),
			}
		}
	}

	/**
	 * The full panel state.
	 *
	 * @returns {Promise<object>} The overview.
	 */
	async function overview() {
		const snapshot = await legacySnapshot()
		return {
			version,
			dataDir,
			skills: snapshot,
			catalog: await catalogOf(snapshot),
			// Whether the vendored skill kernel mounted and how many routes it
			// handed to the Host. A mounted kernel with zero routes is the failure
			// mode that would otherwise look like "no skills".
			kernel: kernel === undefined ? { mounted: false, routes: 0, error: 'not wired' } : { mounted: kernel.mounted, routes: kernel.routes, error: kernel.error },
			mcp: mcp.describe(),
			modes: modes === undefined ? { available: false, modes: [] } : modes.status(),
			lan: lan === undefined ? { enabled: false, running: false, address: '', port: 0, upstream: '', error: '' } : lan.summary(),
		}
	}

	return async function handleManager(endpoint, payload) {
		try {
			switch (endpoint) {
				case 'overview': {
					return { ok: true, value: await overview() }
				}
				case 'skills-refresh': {
					// The kernel rescans on every read, so a refresh is just a re-read.
					return { ok: true, value: await overview() }
				}
				case 'skill-toggle': {
					await legacyToggle({
						category: text(payload, 'category'),
						name: text(payload, 'name'),
						enabled: payload?.enabled !== false,
					})
					return { ok: true, value: await overview() }
				}
				case 'skill-read': {
					return {
						ok: true,
						value: await legacyRead({ category: text(payload, 'category'), name: text(payload, 'name') }),
					}
				}
				case 'skill-create': {
					const created = await legacyCreate({
						category: text(payload, 'category'),
						name: text(payload, 'name'),
						description: text(payload, 'description'),
					})
					return { ok: true, value: { ...created, overview: await overview() } }
				}
				case 'mcp-status': {
					return { ok: true, value: mcp.describe() }
				}
				case 'mcp-save': {
					const saved = await mcp.save({
						id: text(payload, 'id'),
						name: text(payload, 'name'),
						command: text(payload, 'command'),
						args: Array.isArray(payload?.args) ? payload.args : [],
						cwd: text(payload, 'cwd'),
						env: payload?.env,
						enabled: payload?.enabled !== false,
					})
					return { ok: true, value: { server: saved, overview: await overview() } }
				}
				case 'mcp-remove': {
					await mcp.remove({ id: text(payload, 'id') })
					return { ok: true, value: await overview() }
				}
				case 'mcp-toggle': {
					const server = await mcp.setEnabled({ id: text(payload, 'id'), enabled: payload?.enabled !== false })
					return { ok: true, value: { server, overview: await overview() } }
				}
				case 'mcp-reconnect': {
					const server = await mcp.reconnect({ id: text(payload, 'id') })
					return { ok: true, value: { server, overview: await overview() } }
				}
				case 'lan-status': {
					if (lan === undefined) throw new Error('当前 Host 没有局域网访问服务')
					return { ok: true, value: lan.status() }
				}
				case 'lan-ca': {
					if (lan === undefined) throw new Error('当前 Host 没有局域网访问服务')
					return { ok: true, value: lan.ca() }
				}
				case 'lan-toggle': {
					if (lan === undefined) throw new Error('当前 Host 没有局域网访问服务')
					const enabled = payload?.enabled !== false
					const secure = payload?.secure === true
					if (settings !== undefined) {
						await settings.update((draft) => {
							draft.lan = { ...draft.lan, enabled, secure }
							return draft
						})
					}
					const state = await lan.apply(enabled, secure)
					return { ok: true, value: state }
				}
				case 'search-status': {
					if (search === undefined) throw new Error('当前 Host 没有联网搜索服务')
					return { ok: true, value: await search.describe() }
				}
				case 'search-save': {
					if (search === undefined) throw new Error('当前 Host 没有联网搜索服务')
					return {
						ok: true,
						value: await search.save({
							id: text(payload, 'id'),
							enabled: payload?.enabled,
							baseUrl: payload?.baseUrl,
							apiKey: payload?.apiKey,
							clearKey: payload?.clearKey === true,
						}),
					}
				}
				case 'search-order': {
					if (search === undefined) throw new Error('当前 Host 没有联网搜索服务')
					return { ok: true, value: await search.saveOrder({ ids: payload?.ids }) }
				}
				case 'search-mode': {
					if (search === undefined) throw new Error('当前 Host 没有联网搜索服务')
					return { ok: true, value: await search.saveMode({ mode: payload?.mode }) }
				}
				case 'search-safe-search': {
					if (search === undefined) throw new Error('当前 Host 没有联网搜索服务')
					return { ok: true, value: await search.saveSafeSearch({ safeSearch: payload?.safeSearch }) }
				}
				case 'search-blocked-domains': {
					if (search === undefined) throw new Error('当前 Host 没有联网搜索服务')
					return { ok: true, value: await search.saveBlockedDomains({ domains: payload?.domains }) }
				}
				case 'search-cooldowns-clear': {
					if (search === undefined) throw new Error('当前 Host 没有联网搜索服务')
					return { ok: true, value: await search.clearCooldowns() }
				}
				case 'search-test': {
					if (search === undefined) throw new Error('当前 Host 没有联网搜索服务')
					return {
						ok: true,
						value: await search.test({
							id: text(payload, 'id'),
							query: text(payload, 'query'),
						}),
					}
				}
				case 'search-test-all': {
					if (search === undefined) throw new Error('当前 Host 没有联网搜索服务')
					return {
						ok: true,
						value: await search.testAll({
							query: text(payload, 'query'),
							all: payload?.all === true,
						}),
					}
				}
				case 'search-query': {
					if (search === undefined) throw new Error('当前 Host 没有联网搜索服务')
					return {
						ok: true,
						value: await search.search({
							query: text(payload, 'query'),
							maxResults: payload?.maxResults,
							timeRange: text(payload, 'timeRange'),
						}),
					}
				}
				case 'mode-toggle': {
					if (modes === undefined) throw new Error('当前 Host 没有模式服务')
					await modes.setEnabled(text(payload, 'id'), payload?.enabled !== false)
					return { ok: true, value: await overview() }
				}
				default: {
					throw new Error(`未知接口：${endpoint}`)
				}
			}
		} catch (error) {
			return {
				ok: false,
				error: {
					code: typeof error?.code === 'string' && error.code !== '' ? error.code : 'dsh-manager/error',
					message: error instanceof Error ? error.message : String(error),
					details: {},
				},
			}
		}
	}
}

/**
 * Read one string field from a payload.
 *
 * @param {unknown} payload - Request payload.
 * @param {string} field - Field name.
 * @returns {string} The field's value, or an empty string.
 */
function text(payload, field) {
	const value = payload?.[field]
	return typeof value === 'string' ? value : ''
}
