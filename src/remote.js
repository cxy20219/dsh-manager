/**
 * The browser-facing surface of the manager.
 *
 * The panel is a Client plugin, so its data comes through the Host's
 * Connection service: one authenticated prefix (`/api/manager`) owned by this
 * plugin. Every endpoint takes plain JSON and answers plain JSON.
 *
 * @module dsh-manager/remote
 */

import { PROVIDER_NAME } from './skills.js'

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
]

/**
 * Build the endpoint handler.
 *
 * @param {{skills: object, mcp: object, version: string, dataDir: string, registry?: object}} deps - Services the endpoints use.
 * @returns {(endpoint: string, payload: unknown) => Promise<object>} The handler.
 */
export function createManagerHandler({ skills, mcp, version, dataDir, registry }) {
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
				if (summary.provider === PROVIDER_NAME) managed += 1
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
		const snapshot = await skills.snapshot()
		return {
			version,
			dataDir,
			skills: snapshot,
			catalog: await catalogOf(snapshot),
			mcp: mcp.describe(),
		}
	}

	return async function handleManager(endpoint, payload) {
		try {
			switch (endpoint) {
				case 'overview': {
					return { ok: true, value: await overview() }
				}
				case 'skills-refresh': {
					skills.refresh()
					return { ok: true, value: await overview() }
				}
				case 'skill-toggle': {
					const category = text(payload, 'category')
					const name = text(payload, 'name')
					const enabled = payload?.enabled !== false
					if (category === '') throw new Error('缺少分类名')
					if (name === '') await skills.setCategoryEnabled(category, enabled)
					else await skills.setSkillEnabled(category, name, enabled)
					return { ok: true, value: await overview() }
				}
				case 'skill-read': {
					return {
						ok: true,
						value: await skills.read({ category: text(payload, 'category'), name: text(payload, 'name') }),
					}
				}
				case 'skill-create': {
					const created = await skills.create({
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
				default: {
					throw new Error(`未知接口：${endpoint}`)
				}
			}
		} catch (error) {
			return {
				ok: false,
				error: {
					code: 'dsh-manager/error',
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
