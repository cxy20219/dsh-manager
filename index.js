/**
 * dsh-manager — the Host half.
 *
 * The plugin owns four things and exposes them through one authenticated API:
 *
 *   1. a skill provider for hierarchical categories under
 *      `~/.agents/skills/<category>/<skill>/SKILL.md`, with category-level and
 *      skill-level switches persisted in the manager's settings;
 *   2. stdio MCP servers from that same settings file, whose discovered tools
 *      are registered on `ctx.tools` as `mcp__<server>__<tool>`;
 *   3. a native multi-channel web-search tab: each channel has its own switch,
 *      base URL and API key (in the credential store), and one query fans out
 *      to every enabled channel before the results are merged; the same engine
 *      is also exposed to the agent as the `ctx.web` provider `dsh-manager`
 *      plus the agent `web_search` / research / platform tools;
 *   4. the agent presets it ships, registered through the Host's
 *      `agentPresets` service and unregistered when the panel switches them
 *      off. A preset is how a mode decides the tools a new session gets.
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

import { registerAgentSearch } from './src/agent-search.js'
import { createLanAccess } from './src/lan-access.js'
import { createMcpManager } from './src/mcp.js'
import { createModes } from './src/modes.js'
import { createManagerHandler, ENDPOINTS } from './src/remote.js'
import { DEFAULT_LAN_PORT, SettingsStore } from './src/settings.js'
import { createSearchManager } from './src/search.js'
import { SEARCH_CHANNELS } from './src/search-providers.js'
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

	const searchChannels = {}
	for (const channel of SEARCH_CHANNELS) searchChannels[channel.id] = { enabled: false, baseUrl: '' }
	const searchOrder = SEARCH_CHANNELS.map((channel) => channel.id)
	const settings = new SettingsStore({
		path: join(dataDir, 'settings.json'),
		logger: ctx.logger,
		defaults: {
			skills: { roots: [defaultRoot] },
			mcp: { servers: [] },
			lan: { enabled: false, secure: false, port: DEFAULT_LAN_PORT },
			modes: { enabled: { simple: true } },
			search: { channels: searchChannels, mode: 'merge', order: searchOrder },
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
	const search = createSearchManager({ settings, credentials, logger: ctx.logger })
	registerAgentSearch({ ctx, search, logger: ctx.logger })

	// Registering a mode mounts a whole plugin tree, which waits on the Host
	// Loader. Kicking that off detached keeps this row's own activation out of
	// that wait; the panel reports each mode's outcome, and a failed mount is a
	// visible error instead of a missing entry.
	const modes = createModes({
		getAgentPresets: () => ctx.get('agentPresets'),
		settings,
		logger: ctx.logger,
	})
	ctx.effect(() => () => {
		void modes.dispose()
	}, 'dsh-manager: modes')
	void modes.start().catch((error) => {
		ctx.logger.warn(`dsh-manager: 模式启动失败：${error instanceof Error ? error.message : String(error)}`)
	})

	// The LAN listener needs the web server's own origin, which the Host
	// publishes only once it is listening; the manager reads it when the
	// switch is turned on.
	const lan = createLanAccess({
		connection,
		webServer: () => ctx.get('webServer'),
		dataDir,
		logger: ctx.logger,
		port: settings.get().lan.port,
		secure: settings.get().lan.secure,
	})
	ctx.effect(() => () => {
		void lan.dispose()
	}, 'dsh-manager: lan access')

	const handler = createManagerHandler({
		skills,
		mcp,
		modes,
		lan,
		settings,
		version,
		dataDir,
		registry: ctx.skills,
		search,
	})
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
		const state = await lan.apply(true, settings.get().lan.secure)
		if (state.error !== '') ctx.logger.warn(`dsh-manager: 局域网访问启动失败：${state.error}`)
	}

	ctx.logger.info(`dsh-manager: 技能根目录 ${defaultRoot}，数据目录 ${dataDir}，接口 ${API_PREFIX}`)
}
