/**
 * A small MCP stdio client.
 *
 * The manager owns its server list, so it also owns the connection: spawn the
 * configured command, speak newline-delimited JSON-RPC over stdin/stdout, and
 * expose `initialize`, `tools/list` and `tools/call`. It deliberately keeps no
 * dependencies so installing the plugin needs no network access.
 *
 * @module dsh-manager/mcp-client
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'

/** DeepSeek function-name contract: at most 64 characters. */
export const MAX_PUBLIC_NAME_LENGTH = 64

/** DeepSeek function-name contract: only `[A-Za-z0-9_-]` is allowed. */
const INVALID_NAME_CHARS = /[^A-Za-z0-9_-]/g

/** Hex characters of the identity hash appended on lossy normalization. */
const HASH_LENGTH = 12

/** Protocol revisions this client offers, newest first. */
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

/** Server name accepted by the tool namespace. */
const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/

/**
 * Derive the model-facing public name for one MCP tool.
 *
 * Deterministic pure function of `(serverName, rawName)`; a lossy mapping
 * appends a hash so two distinct tool identities never collapse. This mirrors
 * the shipped MCP bridge's naming contract, so session history and permission
 * rules stay stable if a server later moves between the two plugins.
 *
 * @param {string} serverName - The local namespace from settings.
 * @param {string} rawName - The MCP server's own tool name.
 * @returns {string} The tool name the model sees.
 */
export function publicToolName(serverName, rawName) {
	const joined = `mcp__${serverName}__${rawName}`
	const normalized = joined.replace(INVALID_NAME_CHARS, '_')
	if (normalized === joined && normalized.length <= MAX_PUBLIC_NAME_LENGTH) return normalized
	const hash = createHash('sha256').update(`${serverName}\0${rawName}`).digest('hex').slice(0, HASH_LENGTH)
	return `${normalized.slice(0, MAX_PUBLIC_NAME_LENGTH - HASH_LENGTH - 1)}_${hash}`
}

/**
 * Whether a server name is a valid tool namespace.
 *
 * @param {unknown} name - Candidate.
 * @returns {boolean} True when valid.
 */
export function isServerName(name) {
	return typeof name === 'string' && SERVER_NAME.test(name)
}

/**
 * Build the child environment: the ambient environment minus credential-shaped
 * and `DSH_*` names, then the server's explicit entries.
 *
 * @param {Record<string, string>} [extra] - Configured variables.
 * @returns {Record<string, string>} The child environment.
 */
export function buildChildEnv(extra = {}) {
	const env = {}
	for (const [key, value] of Object.entries(process.env)) {
		if (typeof value !== 'string') continue
		if (/KEY|PASSWORD|SECRET|TOKEN/i.test(key)) continue
		if (key.startsWith('DSH_')) continue
		env[key] = value
	}
	for (const [key, value] of Object.entries(extra)) {
		if (typeof value === 'string' && value !== '') env[key] = value
	}
	return env
}

/**
 * One stdio MCP connection.
 */
export class McpStdioClient {
	#command
	#args
	#cwd
	#env
	#clientVersion
	#logger
	#onToolsChanged
	#onStderr
	#onExit
	#requestTimeoutMs
	#child
	#buffer = ''
	#pending = new Map()
	#nextId = 0
	#terminated = false
	#stderrBuffer = ''
	#stderrTail = []

	/**
	 * @param {object} options - Connection options.
	 */
	constructor(options) {
		this.#command = options.command
		this.#args = Array.isArray(options.args) ? options.args : []
		this.#cwd = typeof options.cwd === 'string' && options.cwd !== '' ? options.cwd : undefined
		this.#env = options.env ?? {}
		this.#clientVersion = typeof options.clientVersion === 'string' ? options.clientVersion : '0.1.0'
		this.#logger = options.logger
		this.#onToolsChanged = options.onToolsChanged
		this.#onStderr = options.onStderr
		this.#onExit = options.onExit
		this.#requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) ? options.requestTimeoutMs : 60_000
		this.serverInfo = undefined
		this.capabilities = {}
		this.protocolVersion = undefined
	}

	/** Recent stderr lines, for the panel's diagnostics. */
	get stderr() {
		return [...this.#stderrTail]
	}

	/**
	 * Start the child process and complete the MCP handshake.
	 *
	 * @returns {Promise<{serverInfo: object | undefined, capabilities: object, protocolVersion: string | undefined}>} Negotiated identity.
	 */
	async connect() {
		if (typeof this.#command !== 'string' || this.#command.trim() === '') {
			throw new Error('MCP 服务缺少启动命令')
		}
		this.#spawn()
		let lastError
		for (const version of PROTOCOL_VERSIONS) {
			try {
				const result = await this.request('initialize', {
					protocolVersion: version,
					capabilities: {},
					clientInfo: { name: 'dsh-manager', version: this.#clientVersion },
				})
				this.serverInfo = result?.serverInfo
				this.capabilities = result?.capabilities ?? {}
				this.protocolVersion = typeof result?.protocolVersion === 'string' ? result.protocolVersion : version
				this.notify('notifications/initialized')
				return {
					serverInfo: this.serverInfo,
					capabilities: this.capabilities,
					protocolVersion: this.protocolVersion,
				}
			} catch (error) {
				lastError = error
				// Only a protocol-level rejection is worth retrying with an older
				// revision; a transport failure already terminated the child.
				if (this.#terminated || error?.rpcCode === undefined) break
			}
		}
		this.#terminate(lastError ?? new Error('MCP 初始化失败'), false)
		throw lastError ?? new Error('MCP 初始化失败')
	}

	/**
	 * Read the server's complete tool list, following pagination cursors.
	 *
	 * @returns {Promise<object[]>} Tool descriptors.
	 */
	async listTools() {
		const tools = []
		let cursor
		for (let page = 0; page < 50; page += 1) {
			const result = await this.request('tools/list', cursor === undefined ? {} : { cursor })
			for (const tool of Array.isArray(result?.tools) ? result.tools : []) {
				if (tool !== null && typeof tool === 'object' && typeof tool.name === 'string' && tool.name !== '') {
					tools.push(tool)
				}
			}
			cursor = typeof result?.nextCursor === 'string' && result.nextCursor !== '' ? result.nextCursor : undefined
			if (cursor === undefined) return tools
		}
		throw new Error('MCP tools/list 分页超过 50 页，已放弃')
	}

	/**
	 * Invoke one tool by its raw MCP name.
	 *
	 * @param {string} name - Raw tool name.
	 * @param {object} args - Arguments object.
	 * @param {{signal?: AbortSignal, timeoutMs?: number}} [options] - Cancellation and deadline.
	 * @returns {Promise<object>} The MCP result.
	 */
	async callTool(name, args, options = {}) {
		const result = await this.request('tools/call', { name, arguments: args ?? {} }, {
			signal: options.signal,
			timeoutMs: options.timeoutMs,
		})
		return result !== null && typeof result === 'object' ? result : {}
	}

	/**
	 * Send one request and wait for its response.
	 *
	 * @param {string} method - JSON-RPC method.
	 * @param {object} [params] - Request params.
	 * @param {{signal?: AbortSignal, timeoutMs?: number}} [options] - Cancellation and deadline.
	 * @returns {Promise<any>} The response result.
	 */
	request(method, params, options = {}) {
		if (this.#terminated) return Promise.reject(new Error('MCP 连接已关闭'))
		const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : this.#requestTimeoutMs
		const signal = options.signal
		return new Promise((resolve, reject) => {
			const id = (this.#nextId += 1)
			const timer = setTimeout(() => {
				this.#pending.delete(id)
				reject(new Error(`MCP 请求超时（${Math.round(timeoutMs / 1000)} 秒）：${method}`))
			}, Math.max(1, timeoutMs))
			timer.unref?.()
			const onAbort = () => {
				finish()
				this.notify('notifications/cancelled', { requestId: id, reason: 'aborted' })
				const error = new Error('MCP 请求已取消')
				error.name = 'AbortError'
				reject(error)
			}
			const finish = () => {
				clearTimeout(timer)
				this.#pending.delete(id)
				signal?.removeEventListener('abort', onAbort)
			}
			if (signal !== undefined) {
				if (signal.aborted) {
					finish()
					const error = new Error('MCP 请求已取消')
					error.name = 'AbortError'
					reject(error)
					return
				}
				signal.addEventListener('abort', onAbort, { once: true })
			}
			this.#pending.set(id, {
				resolve: (value) => {
					finish()
					resolve(value)
				},
				reject: (error) => {
					finish()
					reject(error)
				},
			})
			try {
				this.#write({ jsonrpc: '2.0', id, method, params: params ?? {} })
			} catch (error) {
				finish()
				reject(error)
			}
		})
	}

	/**
	 * Send one notification.
	 *
	 * @param {string} method - JSON-RPC method.
	 * @param {object} [params] - Notification params.
	 * @returns {void}
	 */
	notify(method, params) {
		if (this.#terminated) return
		try {
			this.#write({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) })
		} catch {
			// The exit path reports the failure.
		}
	}

	/**
	 * Stop the child and release every pending request.
	 *
	 * @returns {Promise<void>} Resolves after the child exited or was killed.
	 */
	async close() {
		const child = this.#child
		this.#terminate(new Error('MCP 连接已关闭'), false)
		if (child === undefined || child.exitCode !== null || child.signalCode !== null) return
		await new Promise((resolve) => {
			const timer = setTimeout(() => {
				try {
					child.kill('SIGKILL')
				} catch {
					// Already gone.
				}
				resolve()
			}, 1500)
			timer.unref?.()
			child.once('exit', () => {
				clearTimeout(timer)
				resolve()
			})
		})
	}

	/** Start the configured process. */
	#spawn() {
		let child
		try {
			child = spawn(this.#command, this.#args, {
				cwd: this.#cwd,
				env: buildChildEnv(this.#env),
				stdio: ['pipe', 'pipe', 'pipe'],
				windowsHide: true,
			})
		} catch (error) {
			this.#terminate(error, false)
			throw error
		}
		this.#child = child
		child.stdout?.setEncoding('utf8')
		child.stderr?.setEncoding('utf8')
		child.on('error', (error) => this.#terminate(error, true))
		child.on('exit', (code, signal) => {
			const reason = new Error(`MCP 进程已退出（code=${code ?? 'null'}, signal=${signal ?? 'null'}）`)
			reason.exitCode = code
			reason.signal = signal
			this.#terminate(reason, true)
		})
		child.stdout?.on('data', (chunk) => this.#ingest(chunk))
		child.stderr?.on('data', (chunk) => this.#noteStderr(String(chunk)))
	}

	/**
	 * Write one newline-delimited message to the child.
	 *
	 * @param {object} message - JSON-RPC message.
	 * @returns {void}
	 */
	#write(message) {
		const child = this.#child
		if (this.#terminated || child === undefined || child.stdin === null || child.stdin.destroyed) {
			throw new Error('MCP 连接已关闭')
		}
		child.stdin.write(`${JSON.stringify(message)}\n`, 'utf8', (error) => {
			if (error) this.#terminate(error, true)
		})
	}

	/**
	 * Apply one stdout chunk to the line buffer.
	 *
	 * @param {string} chunk - Decoded text.
	 * @returns {void}
	 */
	#ingest(chunk) {
		this.#buffer += chunk
		for (;;) {
			const newline = this.#buffer.indexOf('\n')
			if (newline < 0) return
			const line = this.#buffer.slice(0, newline).replace(/\r$/, '')
			this.#buffer = this.#buffer.slice(newline + 1)
			if (line.trim() === '') continue
			let message
			try {
				message = JSON.parse(line)
			} catch {
				// A server that logs to stdout is out of spec but common; keep the
				// line as diagnostics instead of failing the session.
				this.#noteStderr(line)
				continue
			}
			this.#dispatch(message)
		}
	}

	/**
	 * Route one decoded JSON-RPC message.
	 *
	 * @param {unknown} message - Decoded message.
	 * @returns {void}
	 */
	#dispatch(message) {
		if (message === null || typeof message !== 'object') return
		if (typeof message.method === 'string') {
			if (message.id !== undefined && message.id !== null) {
				this.#answerServer(message)
				return
			}
			if (message.method === 'notifications/tools/list_changed') this.#onToolsChanged?.()
			return
		}
		if (!Object.hasOwn(message, 'id')) return
		const pending = this.#pending.get(message.id)
		if (pending === undefined) return
		if (Object.hasOwn(message, 'error') && message.error !== undefined) {
			const error = new Error(message.error?.message || 'MCP 服务返回错误')
			error.rpcCode = message.error?.code
			error.rpcData = message.error?.data
			pending.reject(error)
			return
		}
		pending.resolve(message.result)
	}

	/**
	 * Answer a server-to-client request without implementing its capability.
	 *
	 * @param {object} message - The request.
	 * @returns {void}
	 */
	#answerServer(message) {
		if (message.method === 'ping') {
			this.#reply(message.id, {})
			return
		}
		if (message.method === 'roots/list') {
			this.#reply(message.id, { roots: [] })
			return
		}
		try {
			this.#write({
				jsonrpc: '2.0',
				id: message.id,
				error: { code: -32601, message: `不支持的客户端方法：${message.method}` },
			})
		} catch {
			// The exit path reports the failure.
		}
	}

	/**
	 * Answer one server request.
	 *
	 * @param {number | string} id - Request id.
	 * @param {object} result - Result value.
	 * @returns {void}
	 */
	#reply(id, result) {
		try {
			this.#write({ jsonrpc: '2.0', id, result })
		} catch {
			// The exit path reports the failure.
		}
	}

	/**
	 * Keep the last stderr lines for diagnostics.
	 *
	 * @param {string} chunk - Text.
	 * @returns {void}
	 */
	#noteStderr(chunk) {
		this.#stderrBuffer += chunk
		const lines = this.#stderrBuffer.split('\n')
		this.#stderrBuffer = lines.pop() ?? ''
		for (const line of lines) {
			const trimmed = line.trim()
			if (trimmed === '') continue
			this.#stderrTail.push(trimmed.slice(0, 500))
			if (this.#stderrTail.length > 20) this.#stderrTail.shift()
			this.#onStderr?.(trimmed)
		}
	}

	/**
	 * Release the child and pending requests once.
	 *
	 * @param {Error} error - Failure surfaced to pending requests.
	 * @param {boolean} notify - Whether the owner should observe an exit.
	 * @returns {void}
	 */
	#terminate(error, notify) {
		if (this.#terminated) return
		this.#terminated = true
		for (const pending of this.#pending.values()) pending.reject(error)
		this.#pending.clear()
		const child = this.#child
		if (child !== undefined) {
			try {
				child.stdin?.end()
			} catch {
				// Already closed.
			}
			try {
				child.kill('SIGTERM')
			} catch {
				// Already gone.
			}
		}
		if (notify) {
			this.#logger?.warn?.(`dsh-manager: MCP 连接关闭（${error.message}）`)
			this.#onExit?.({ error, stderr: this.stderr })
		}
	}
}
