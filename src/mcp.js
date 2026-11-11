/**
 * The MCP manager: persisted stdio server rows, their live connections, and
 * the tools each connection contributes to `ctx.tools`.
 *
 * One row per server, addressed by an opaque id so renaming a server does not
 * orphan its stored credentials. Environment values live in the Host's
 * credential store; the settings document only keeps their names.
 *
 * @module dsh-manager/mcp
 */

import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'

import { McpStdioClient, isServerName, publicToolName } from './mcp-client.js'

/** Environment variable names accepted from the panel. */
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Longest text this bridge forwards from one MCP result. */
const MAX_RESULT_TEXT = 200_000

/**
 * Build the MCP manager.
 *
 * @param {{ctx: object, settings: object, credentials?: object, version: string, logger: object}} options - Dependencies.
 * @returns {object} The manager.
 */
export function createMcpManager({ ctx, settings, credentials, version, logger }) {
	/** id → panel status */
	const statuses = new Map()
	/** id → {client, token, disposers, chain} */
	const live = new Map()
	let disposed = false

	/**
	 * The tool registry, when this Host has one.
	 *
	 * @returns {object | undefined} `ctx.tools`.
	 */
	function toolRegistry() {
		return ctx.get('tools')
	}

	/**
	 * The persisted server rows.
	 *
	 * @returns {object[]} Server rows.
	 */
	function servers() {
		return settings.get().mcp.servers
	}

	/**
	 * Find one persisted server.
	 *
	 * @param {string} id - Server id.
	 * @returns {object | undefined} The row.
	 */
	function findServer(id) {
		return servers().find((server) => server.id === id)
	}

	/**
	 * Credential record key for one server's environment.
	 *
	 * @param {string} id - Server id.
	 * @returns {string} The record key.
	 */
	function credentialKey(id) {
		return `dsh-manager/${id}`
	}

	/**
	 * Read a server's stored environment.
	 *
	 * @param {object} server - Server row.
	 * @returns {Promise<Record<string, string>>} Environment entries.
	 */
	async function envFor(server) {
		if (credentials === undefined) return {}
		try {
			const record = await credentials.readRecord(credentialKey(server.id))
			if (record === undefined || record.kind !== 'api-key') return {}
			return record.env === undefined ? {} : { ...record.env }
		} catch (error) {
			logger?.warn?.(`dsh-manager: 读取 ${server.name} 的环境变量失败（${errorMessage(error)}）`)
			return {}
		}
	}

	/**
	 * Project one server and its live status for the panel.
	 *
	 * @param {object} server - Server row.
	 * @returns {object} Panel-facing status.
	 */
	function publicStatus(server) {
		const status = statuses.get(server.id) ?? emptyStatus()
		return {
			id: server.id,
			name: server.name,
			command: server.command,
			args: [...server.args],
			cwd: server.cwd,
			envKeys: [...server.envKeys],
			enabled: server.enabled,
			state: status.state,
			error: status.error,
			tools: status.tools.map((tool) => ({ ...tool })),
			serverInfo: status.serverInfo,
			protocolVersion: status.protocolVersion,
			stderr: [...status.stderr],
		}
	}

	/**
	 * Stop one connection and unregister its tools.
	 *
	 * @param {string} id - Server id.
	 * @returns {Promise<void>} Resolves after teardown.
	 */
	async function stop(id) {
		const entry = live.get(id)
		live.delete(id)
		if (entry === undefined) return
		for (const dispose of entry.disposers) safeDispose(dispose)
		entry.disposers = []
		await entry.client.close().catch(() => {})
	}

	/**
	 * Connect one server and publish its tools.
	 *
	 * @param {object} server - Server row.
	 * @returns {Promise<void>} Resolves after the attempt settled.
	 */
	async function connect(server) {
		await stop(server.id)
		if (disposed) return
		if (server.enabled === false) {
			statuses.set(server.id, emptyStatus())
			return
		}
		statuses.set(server.id, { ...emptyStatus(), state: 'connecting' })
		const token = {}
		let client
		try {
			const env = await envFor(server)
			client = new McpStdioClient({
				command: server.command,
				args: server.args,
				cwd: server.cwd,
				env,
				clientVersion: version,
				logger,
				onToolsChanged: () => scheduleSync(server),
				onStderr: (line) => pushStderr(server.id, line),
				onExit: (info) => handleExit(server, token, info),
			})
			const negotiated = await client.connect()
			if (disposed) {
				await client.close()
				return
			}
			live.set(server.id, { client, token, disposers: [], chain: Promise.resolve() })
			statuses.set(server.id, {
				state: 'ready',
				error: '',
				tools: [],
				stderr: client.stderr,
				serverInfo: negotiated.serverInfo,
				protocolVersion: negotiated.protocolVersion,
			})
			await syncTools(server)
		} catch (error) {
			await stop(server.id)
			statuses.set(server.id, {
				state: 'error',
				error: errorMessage(error),
				tools: [],
				stderr: client?.stderr ?? [],
			})
			logger?.warn?.(`dsh-manager: MCP 服务 ${server.name} 连接失败（${errorMessage(error)}）`)
		}
	}

	/**
	 * React to a connection that ended on its own.
	 *
	 * @param {object} server - Server row.
	 * @param {object} token - The connection's identity token.
	 * @param {{error: Error, stderr: string[]}} info - Exit details.
	 * @returns {void}
	 */
	function handleExit(server, token, info) {
		const entry = live.get(server.id)
		if (entry === undefined || entry.token !== token) return
		live.delete(server.id)
		for (const dispose of entry.disposers) safeDispose(dispose)
		statuses.set(server.id, {
			state: 'error',
			error: info?.error?.message ?? 'MCP 连接已断开',
			tools: [],
			stderr: info?.stderr ?? [],
		})
	}

	/**
	 * Queue a tool-list refresh so two syncs never interleave.
	 *
	 * @param {object} server - Server row.
	 * @returns {void}
	 */
	function scheduleSync(server) {
		const entry = live.get(server.id)
		if (entry === undefined) return
		entry.chain = entry.chain
			.then(() => syncTools(server))
			.catch((error) => {
				const status = statuses.get(server.id)
				if (status !== undefined) {
					statuses.set(server.id, { ...status, state: 'error', error: `刷新工具失败：${errorMessage(error)}` })
				}
			})
	}

	/**
	 * Re-list the server's tools and swap the registered generation.
	 *
	 * @param {object} server - Server row.
	 * @returns {Promise<void>} Resolves after the swap.
	 */
	async function syncTools(server) {
		const entry = live.get(server.id)
		if (entry === undefined) return
		const registry = toolRegistry()
		if (registry === undefined) throw new Error('Host 没有 tools 服务，MCP 工具无法注册')
		const rawTools = await entry.client.listTools()
		for (const dispose of entry.disposers) safeDispose(dispose)
		entry.disposers = []
		const registered = []
		const seen = new Set()
		try {
			for (const tool of rawTools) {
				const publicName = publicToolName(server.name, tool.name)
				if (seen.has(publicName)) continue
				seen.add(publicName)
				entry.disposers.push(registry.register(createToolDefinition(server, tool, publicName)))
				registered.push({
					raw: tool.name,
					public: publicName,
					description: typeof tool.description === 'string' ? tool.description : '',
				})
			}
		} catch (error) {
			for (const dispose of entry.disposers) safeDispose(dispose)
			entry.disposers = []
			throw error
		}
		const status = statuses.get(server.id)
		if (status === undefined) return
		statuses.set(server.id, { ...status, state: 'ready', error: '', tools: registered })
	}

	/**
	 * Build one model-facing tool over the live connection.
	 *
	 * @param {object} server - Server row.
	 * @param {object} tool - MCP tool descriptor.
	 * @param {string} publicName - Function-name-safe tool name.
	 * @returns {object} A `ctx.tools.register` definition.
	 */
	function createToolDefinition(server, tool, publicName) {
		const description = typeof tool.description === 'string' && tool.description !== ''
			? tool.description
			: `MCP 工具（服务 ${server.name}）：${tool.name}`
		const parameters = tool.inputSchema !== null && typeof tool.inputSchema === 'object'
			? tool.inputSchema
			: { type: 'object', properties: {} }
		return {
			name: publicName,
			description,
			parameters,
			output: {
				schema: { type: 'object', additionalProperties: true },
				render: (_args, value) => [{ type: 'text', text: renderValueText(value) }],
			},
			async execute(args, exec) {
				const entry = live.get(server.id)
				if (entry === undefined) throw new Error(`MCP 服务 ${server.name} 未连接`)
				const result = await entry.client.callTool(tool.name, args ?? {}, { signal: exec.signal })
				if (result?.isError === true) {
					throw new Error(resultText(result) || `MCP 工具 ${tool.name} 执行失败`)
				}
				return {
					text: truncate(resultText(result) || '（工具没有返回文本内容）', MAX_RESULT_TEXT),
					structuredContent: result?.structuredContent ?? null,
				}
			},
		}
	}

	/**
	 * Persist the stored tool-list diagnostics line.
	 *
	 * @param {string} id - Server id.
	 * @param {string} line - stderr line.
	 * @returns {void}
	 */
	function pushStderr(id, line) {
		const status = statuses.get(id)
		if (status === undefined) return
		const stderr = [...status.stderr, line].slice(-20)
		statuses.set(id, { ...status, stderr })
	}

	/**
	 * Start every enabled server in the background.
	 *
	 * @returns {void}
	 */
	function start() {
		for (const server of servers()) {
			if (server.enabled) {
				void connect(server)
			} else {
				statuses.set(server.id, emptyStatus())
			}
		}
	}

	/**
	 * Create or update one server.
	 *
	 * @param {object} request - Panel payload.
	 * @returns {Promise<object>} The stored row's status.
	 */
	async function save(request) {
		const name = typeof request?.name === 'string' ? request.name.trim() : ''
		if (!isServerName(name)) throw new Error('服务名只能包含字母、数字、下划线或横线，长度 1–32')
		const command = typeof request?.command === 'string' ? request.command.trim() : ''
		if (command === '') throw new Error('请填写启动命令')
		if (/[\r\n\0]/.test(command)) throw new Error('启动命令不能包含换行')
		const args = Array.isArray(request?.args)
			? request.args.map((arg) => String(arg)).filter((arg) => arg !== '')
			: []
		if (args.some((arg) => arg.includes('\0'))) throw new Error('参数不能包含空字符')
		const cwd = typeof request?.cwd === 'string' ? request.cwd.trim() : ''
		if (cwd !== '' && (!isAbsolute(cwd) || /[\r\n\0]/.test(cwd))) throw new Error('工作目录必须是绝对路径')
		const requestedId = typeof request?.id === 'string' && request.id !== '' ? request.id : ''
		// The credential record is addressed as `<scope>/<id>`, and every segment
		// must start with a lowercase letter. A bare UUID may start with a digit,
		// so the prefix is what keeps the record key addressable.
		const id = requestedId === '' ? `mcp-${randomUUID()}` : requestedId
		const existing = findServer(id)
		if (requestedId !== '' && existing === undefined) throw new Error('要修改的 MCP 服务不存在')
		const clash = servers().find((server) => server.name === name && server.id !== id)
		if (clash !== undefined) throw new Error(`服务名已被占用：${name}`)
		const enabled = request?.enabled !== false
		let envKeys = existing?.envKeys ?? []
		if (request?.env !== undefined) {
			const env = normalizeEnv(request.env)
			if (Object.keys(env).length > 0) {
				if (credentials === undefined) throw new Error('Host 没有凭证服务，无法保存环境变量；请先启用凭证插件')
				await credentials.modifyRecord(credentialKey(id), async () => ({ kind: 'api-key', env }))
			} else if (credentials !== undefined) {
				await credentials.deleteRecord(credentialKey(id)).catch(() => {})
			}
			envKeys = Object.keys(env)
		}
		const row = { id, name, command, args, cwd, envKeys, enabled }
		await settings.update((draft) => {
			const index = draft.mcp.servers.findIndex((server) => server.id === id)
			if (index >= 0) draft.mcp.servers[index] = row
			else draft.mcp.servers.push(row)
			return draft
		})
		await stop(id)
		if (enabled) void connect(row)
		else statuses.set(id, emptyStatus())
		return publicStatus(row)
	}

	/**
	 * Remove one server, its tools, and its stored environment.
	 *
	 * @param {{id: string}} request - Panel payload.
	 * @returns {Promise<void>} Resolves after removal.
	 */
	async function remove(request) {
		const id = typeof request?.id === 'string' ? request.id : ''
		if (findServer(id) === undefined) throw new Error('MCP 服务不存在')
		await stop(id)
		statuses.delete(id)
		if (credentials !== undefined) await credentials.deleteRecord(credentialKey(id)).catch(() => {})
		await settings.update((draft) => {
			draft.mcp.servers = draft.mcp.servers.filter((server) => server.id !== id)
			return draft
		})
	}

	/**
	 * Switch one server on or off.
	 *
	 * @param {{id: string, enabled: boolean}} request - Panel payload.
	 * @returns {Promise<object>} The fresh row status.
	 */
	async function setEnabled(request) {
		const id = typeof request?.id === 'string' ? request.id : ''
		const server = findServer(id)
		if (server === undefined) throw new Error('MCP 服务不存在')
		const enabled = request?.enabled !== false
		await settings.update((draft) => {
			const row = draft.mcp.servers.find((entry) => entry.id === id)
			if (row !== undefined) row.enabled = enabled
			return draft
		})
		const next = findServer(id)
		await stop(id)
		if (enabled) void connect(next)
		else statuses.set(id, emptyStatus())
		return publicStatus(next)
	}

	/**
	 * Reconnect one server now.
	 *
	 * @param {{id: string}} request - Panel payload.
	 * @returns {Promise<object>} The row status.
	 */
	async function reconnect(request) {
		const id = typeof request?.id === 'string' ? request.id : ''
		const server = findServer(id)
		if (server === undefined) throw new Error('MCP 服务不存在')
		if (!server.enabled) throw new Error('请先启用这个 MCP 服务')
		void connect(server)
		return { ...publicStatus(server), state: 'connecting' }
	}

	/**
	 * Project the whole MCP section for the panel.
	 *
	 * @returns {object} Panel-facing state.
	 */
	function describe() {
		return {
			available: toolRegistry() !== undefined,
			credentials: credentials !== undefined,
			servers: servers().map((server) => publicStatus(server)),
		}
	}

	/**
	 * Close every connection.
	 *
	 * @returns {Promise<void>} Resolves after teardown.
	 */
	async function dispose() {
		disposed = true
		await Promise.all([...live.keys()].map((id) => stop(id)))
		statuses.clear()
	}

	return { start, save, remove, setEnabled, reconnect, describe, dispose }
}

/**
 * Validate and normalize an environment map from the panel.
 *
 * @param {unknown} value - Candidate environment.
 * @returns {Record<string, string>} The accepted entries.
 */
function normalizeEnv(value) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('环境变量必须是 KEY=VALUE 的映射')
	}
	const env = {}
	for (const [key, raw] of Object.entries(value)) {
		if (!ENV_KEY.test(key)) throw new Error(`环境变量名不合法：${key}`)
		if (typeof raw !== 'string') throw new Error(`环境变量 ${key} 的值必须是文本`)
		if (raw.includes('\0')) throw new Error(`环境变量 ${key} 的值包含空字符`)
		if (raw === '') continue
		env[key] = raw
	}
	return env
}

/**
 * Flatten an MCP result's content blocks into model-readable text.
 *
 * @param {object} result - MCP `tools/call` result.
 * @returns {string} The text.
 */
function resultText(result) {
	const parts = []
	for (const block of Array.isArray(result?.content) ? result.content : []) {
		if (block === null || typeof block !== 'object') continue
		if (block.type === 'text' && typeof block.text === 'string') {
			parts.push(block.text)
			continue
		}
		if (block.type === 'image') {
			parts.push(`[图片 ${typeof block.mimeType === 'string' ? block.mimeType : ''}，二进制内容未展开]`)
			continue
		}
		if (block.type === 'audio') {
			parts.push(`[音频 ${typeof block.mimeType === 'string' ? block.mimeType : ''}，二进制内容未展开]`)
			continue
		}
		if (block.type === 'resource') {
			const resource = block.resource
			if (resource !== null && typeof resource === 'object' && typeof resource.text === 'string') {
				parts.push(resource.text)
			} else {
				parts.push(`[资源 ${resource?.uri ?? ''}]`)
			}
			continue
		}
		if (block.type === 'resource_link') {
			parts.push(`[资源链接 ${typeof block.uri === 'string' ? block.uri : ''}]`)
			continue
		}
		parts.push(JSON.stringify(block))
	}
	return parts.join('\n\n')
}

/**
 * Render a tool result value as text for the model.
 *
 * @param {unknown} value - The canonical value.
 * @returns {string} Non-empty text.
 */
function renderValueText(value) {
	if (value !== null && typeof value === 'object' && typeof value.text === 'string' && value.text !== '') return value.text
	return JSON.stringify(value ?? null, null, 2)
}

/**
 * Bound one result's forwarded text.
 *
 * @param {string} text - Text.
 * @param {number} limit - Maximum length.
 * @returns {string} The bounded text.
 */
function truncate(text, limit) {
	if (text.length <= limit) return text
	return `${text.slice(0, limit)}\n\n[... 结果已截断，共 ${text.length} 字符]`
}

/**
 * Dispose one registration without letting a failure stop the others.
 *
 * @param {() => void} dispose - The disposer.
 * @returns {void}
 */
function safeDispose(dispose) {
	try {
		dispose()
	} catch {
		// A failing disposer must not stop the swap.
	}
}

/**
 * A fresh status for a stopped or disabled server.
 *
 * @returns {object} Empty status.
 */
function emptyStatus() {
	return { state: 'stopped', error: '', tools: [], stderr: [] }
}

/**
 * Read one error's message.
 *
 * @param {unknown} error - Thrown value.
 * @returns {string} The message.
 */
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error)
}
