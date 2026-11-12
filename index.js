/**
 * dsh-manager — the Host half.
 *
 * The plugin owns two things and exposes them through one authenticated API:
 *
 *   1. a skill provider for hierarchical categories under
 *      `~/.agents/skills/<category>/<skill>/SKILL.md`, with category-level and
 *      skill-level switches persisted in the manager's settings;
 *   2. stdio MCP servers from that same settings file, whose discovered tools
 *      are registered on `ctx.tools` as `mcp__<server>__<tool>`.
 *
 * The browser half (`client.js`) renders the sidebar entry and the panel. No
 * package from the Harness installation is imported: the MCP bridge is a
 * small in-repo client so a profile install needs no extra dependencies.
 *
 * @module dsh-manager
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

import { createLanAccess } from './src/lan-access.js'
import { createMcpManager } from './src/mcp.js'
import { createManagerHandler, ENDPOINTS } from './src/remote.js'
import { DEFAULT_LAN_PORT, SettingsStore } from './src/settings.js'
import { createSkillsManager } from './src/skills.js'

/** The plugin's row name. */
export const name = 'dsh-manager'

/** The API prefix the browser calls. */
export const API_PREFIX = '/api/manager'

/** How large a request body the panel API accepts. */
const MAX_REQUEST_BYTES = 1024 * 1024

/** The services this plugin cannot work without. */
export const inject = ['skills', 'connection']



/**
 * The plugin's own version, read from the package it ships in.
 *
 * @returns {Promise<string>} The version, or an empty string when unreadable.
 */
async function readVersion() {
	try {
		const text = await readFile(new URL('./package.json', import.meta.url), 'utf8')
		const parsed = JSON.parse(text)
		return typeof parsed?.version === 'string' ? parsed.version : ''
	} catch {
		return ''
	}
}

/**
 * Resolve the harness home the same way the rest of the Harness does.
 *
 * @returns {string} The absolute harness home.
 */
function dshHome() {
	const configured = process.env.DSH_HOME
	if (typeof configured === 'string' && configured.trim() !== '') return resolve(configured.trim())
	return join(homedir(), '.dsh')
}

/**
 * Resolve the data folder, rejecting a relative configured path.
 *
 * @param {unknown} configured - The row's `dataDir` value.
 * @param {string} fallback - Default folder.
 * @returns {string} An absolute folder.
 */
function resolveDataDir(configured, fallback) {
	if (configured === undefined || configured === null || configured === '') return fallback
	const value = String(configured).trim()
	if (!isAbsolute(value)) throw new Error(`dsh-manager: dataDir 必须是绝对路径，收到 ${value}`)
	return resolve(value)
}

/**
 * Start the manager: skill provider, MCP connections, and the panel API.
 *
 * @param {object} ctx - Host plugin context.
 * @param {object} [config] - The row's configuration.
 * @returns {Promise<void>} Resolves after registration.
 */
export async function apply(ctx, config) {
	const connection = ctx.get('connection')
	if (connection === undefined) throw new Error('dsh-manager: the Host connection service is not available')

	const home = dshHome()
	const agentsHome = typeof process.env.DSH_AGENTS_HOME === 'string' && process.env.DSH_AGENTS_HOME.trim() !== ''
		? resolve(process.env.DSH_AGENTS_HOME.trim())
		: join(homedir(), '.agents')
	const defaultRoot = join(agentsHome, 'skills')
	const dataDir = resolveDataDir(config?.dataDir, join(home, 'manager'))

	const settings = new SettingsStore({
		path: join(dataDir, 'settings.json'),
		logger: ctx.logger,
		defaults: {
			skills: { roots: [defaultRoot] },
			mcp: { servers: [] },
			lan: { enabled: false, port: DEFAULT_LAN_PORT },
		},
	})
	const ready = settings.load()

	// The registry wants a provider registered synchronously during apply, so
	// this stays ahead of the awaits; the provider waits for `ready` itself.
	const skills = createSkillsManager({ ctx, settings, ready, logger: ctx.logger, defaultRoot })
	ctx.skills.registerProvider((control) => skills.provider(control))
	ctx.effect(() => () => skills.dispose(), 'dsh-manager: skill watchers')

	const version = await readVersion()
	const credentials = ctx.get('credentials')
	const mcp = createMcpManager({ ctx, settings, credentials, version, logger: ctx.logger })
	ctx.effect(() => () => mcp.dispose(), 'dsh-manager: mcp connections')

	await ready
	mcp.start()

	// The LAN listener needs the web server's own origin, which the Host
	// publishes only once it is listening; the manager reads it when the
	// switch is turned on.
	const lan = createLanAccess({
		connection,
		webServer: () => ctx.get('webServer'),
		dataDir,
		logger: ctx.logger,
		port: settings.get().lan.port,
	})
	ctx.effect(() => () => {
		void lan.dispose()
	}, 'dsh-manager: lan access')

	const handler = createManagerHandler({ skills, mcp, lan, settings, version, dataDir, registry: ctx.skills })
	/** Everything that has to be undone when the plugin unloads. */
	const disposers = []
	ctx.effect(() => () => {
		for (const dispose of disposers) {
			try {
				void dispose()
			} catch {
				// A failing disposer must not stop the others.
			}
		}
	}, 'dsh-manager: api routes')

	for (const endpoint of ENDPOINTS) {
		disposers.push(connection.fetch.register({
			path: `${API_PREFIX}/${endpoint}`,
			methods: ['POST'],
			requestBody: 'buffered',
			fetch: async (request) => {
				const declared = Number(request.headers.get('content-length') ?? '')
				if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
					return Response.json({
						error: {
							code: 'dsh-manager/request-too-large',
							message: `请求体超过 ${MAX_REQUEST_BYTES} 字节。`,
							details: {},
						},
					}, { status: 413 })
				}
				let payload = {}
				try {
					payload = await request.json()
				} catch {
					payload = {}
				}
				const result = await handler(endpoint, payload)
				if (!result.ok) return Response.json({ error: result.error }, { status: 400 })
				return Response.json(result.value ?? null)
			},
		}))
	}

	if (settings.get().lan.enabled) {
		const state = await lan.apply(true)
		if (state.error !== '') ctx.logger.warn(`dsh-manager: 局域网访问启动失败：${state.error}`)
	}

	ctx.logger.info(`dsh-manager: 技能根目录 ${defaultRoot}，数据目录 ${dataDir}，接口 ${API_PREFIX}`)
}
