/**
 * LAN access: an encrypted, QR-addressable door into this Harness.
 *
 * The Harness web server owns exactly one listener, and it binds loopback.
 * A second listener therefore cannot be mounted, and the shipped composition
 * refuses a wildcard bind on purpose. This module keeps the kernel untouched:
 * it opens its own HTTPS listener on one concrete LAN address and forwards
 * every request to the running web server, so a phone on the same network
 * opens the same GUI, over TLS, with the browser's own session cookie.
 *
 * Two details make the forwarded requests pass the Host's browser fence:
 *
 *   - the `Host` and `Origin` headers are rewritten to the upstream's own
 *     authority, because that authority is the loopback one the fence trusts;
 *   - the launch token in the QR URL is the Host's own token, so the index
 *     request exchanges it for a signed session cookie exactly as it does for
 *     a local browser.
 *
 * The listener is bound to one address, never to every interface, and it only
 * exists while the panel's switch is on.
 *
 * @module dsh-manager/lan-access
 */

import { execFile } from 'node:child_process'
import { X509Certificate, createHash } from 'node:crypto'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import { promisify } from 'node:util'

import { encodeQr } from './qr.js'

const execFileAsync = promisify(execFile)

/** The port the listener uses when the row config names none. */
export const DEFAULT_PORT = 8443

/** The certificate lifetime in days. */
const CERTIFICATE_DAYS = 825

/** The openssl binaries tried in order. */
const OPENSSL_CANDIDATES = ['/usr/bin/openssl', '/opt/homebrew/bin/openssl', 'openssl']

/**
 * The LAN addresses this machine offers, best first.
 *
 * Only routable IPv4 addresses qualify: loopback aliases, link-local
 * addresses and interfaces marked internal are skipped, because a phone
 * cannot reach them. Home networks come first, since that is where the
 * phone usually is.
 *
 * @param {Record<string, Array<object>>} [interfaces] - The interface table.
 * @returns {string[]} The candidate addresses.
 */
export function detectLanAddresses(interfaces = networkInterfaces()) {
	const candidates = []
	for (const [name, entries] of Object.entries(interfaces ?? {})) {
		for (const entry of entries ?? []) {
			if (entry.family !== 'IPv4' && entry.family !== 4) continue
			if (entry.internal === true) continue
			const address = entry.address
			if (typeof address !== 'string' || address === '') continue
			if (address.startsWith('169.254.')) continue
			candidates.push({ address, name })
		}
	}
	const rank = (address) => {
		if (address.startsWith('192.168.')) return 0
		if (address.startsWith('10.')) return 1
		if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2
		return 3
	}
	candidates.sort((left, right) => {
		const byRank = rank(left.address) - rank(right.address)
		return byRank !== 0 ? byRank : left.address.localeCompare(right.address)
	})
	return candidates.map((candidate) => candidate.address)
}

/**
 * Split an origin into the parts the proxy needs.
 *
 * @param {string} origin - The origin, for example `http://127.0.0.1:50326`.
 * @returns {{protocol: string, hostname: string, port: number, authority: string}} The parts.
 */
function parseOrigin(origin) {
	const url = new URL(origin)
	const protocol = url.protocol
	const port = url.port !== '' ? Number(url.port) : protocol === 'https:' ? 443 : 80
	return {
		protocol,
		hostname: url.hostname,
		port,
		authority: url.host === '' ? `${url.hostname}:${String(port)}` : url.host,
	}
}

/**
 * Rewrite the headers a browser sent into the upstream's own authority.
 *
 * The Host fence accepts a loopback authority and compares the `Origin`
 * against the `Host`, so both have to name the upstream.
 *
 * @param {Record<string, string | string[] | undefined>} headers - The incoming headers.
 * @param {object} upstream - The upstream parts.
 * @returns {Record<string, string | string[] | undefined>} The rewritten headers.
 */
export function rewriteRequestHeaders(headers, upstream) {
	const rewritten = { ...headers }
	rewritten.host = upstream.authority
	if (typeof rewritten.origin === 'string') rewritten.origin = `${upstream.protocol}//${upstream.authority}`
	if (typeof rewritten.referer === 'string') {
		rewritten.referer = rewritten.referer.replace(/^https?:\/\/[^/]+/, `${upstream.protocol}//${upstream.authority}`)
	}
	delete rewritten['x-forwarded-host']
	delete rewritten['x-forwarded-proto']
	return rewritten
}

/**
 * Add the `Secure` attribute to a cookie the upstream issued.
 *
 * The upstream serves plain HTTP, so it cannot mark its cookie as secure.
 * This listener is the one the browser talks to, and it is TLS.
 *
 * @param {string} cookie - The `Set-Cookie` value.
 * @returns {string} The value with `Secure` added.
 */
function withSecureCookie(cookie) {
	if (/\bsecure\b/i.test(cookie)) return cookie
	return `${cookie}; Secure`
}

/**
 * Find an openssl binary that answers.
 *
 * @returns {Promise<string | undefined>} The binary path, or undefined.
 */
async function findOpenssl() {
	for (const candidate of OPENSSL_CANDIDATES) {
		try {
			await execFileAsync(candidate, ['version'])
			return candidate
		} catch {
			// Try the next candidate.
		}
	}
	return undefined
}

/**
 * The openssl configuration that names one address as the subject.
 *
 * @param {string} address - The IP address the certificate is issued for.
 * @returns {string} The configuration file content.
 */
function opensslConfiguration(address) {
	return [
		'[req]',
		'distinguished_name = dn',
		'x509_extensions = ext',
		'prompt = no',
		'[dn]',
		`CN = ${address}`,
		'[ext]',
		`subjectAltName = IP:${address}`,
		'basicConstraints = critical,CA:FALSE',
		'keyUsage = critical,digitalSignature,keyEncipherment',
		'extendedKeyUsage = serverAuth',
		'',
	].join('\n')
}

/**
 * The fingerprint of a certificate, as browsers show it.
 *
 * @param {string} pem - The certificate in PEM form.
 * @returns {string} The SHA-256 fingerprint.
 */
function certificateFingerprint(pem) {
	return new X509Certificate(pem).fingerprint256.replaceAll(':', '')
}

/**
 * The SAN addresses of a certificate.
 *
 * @param {string} pem - The certificate in PEM form.
 * @returns {string[]} The subject alternative names.
 */
function certificateAddresses(pem) {
	const certificate = new X509Certificate(pem)
	const names = certificate.subjectAltName ?? ''
	return names.split(',').map((entry) => entry.trim().replace(/^IP Address:/, '')).filter((entry) => entry !== '')
}

/**
 * Issue or reuse the TLS material of one address.
 *
 * @param {{dir: string, address: string, logger?: object}} options - The options.
 * @returns {Promise<{key: string, cert: string, fingerprint: string, validTo: string, reused: boolean}>} The material.
 */
export async function ensureCertificate({ dir, address, logger }) {
	await mkdir(dir, { recursive: true, mode: 0o700 })
	const keyPath = join(dir, 'key.pem')
	const certPath = join(dir, 'cert.pem')
	try {
		const [key, cert] = await Promise.all([readFile(keyPath, 'utf8'), readFile(certPath, 'utf8')])
		const certificate = new X509Certificate(cert)
		const expired = Date.parse(certificate.validTo) <= Date.now()
		if (!expired && certificateAddresses(cert).includes(address)) {
			return {
				key,
				cert,
				fingerprint: certificateFingerprint(cert),
				validTo: certificate.validTo,
				reused: true,
			}
		}
	} catch {
		// No usable material on disk: issue a new one.
	}

	const openssl = await findOpenssl()
	if (openssl === undefined) throw new Error('找不到 openssl，无法生成自签证书')
	const configPath = join(dir, 'openssl.cnf')
	await writeFile(configPath, opensslConfiguration(address), { encoding: 'utf8', mode: 0o600 })
	try {
		await execFileAsync(openssl, [
			'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes',
			'-days', String(CERTIFICATE_DAYS),
			'-keyout', keyPath, '-out', certPath,
			'-config', configPath,
		])
	} catch (error) {
		throw new Error(`openssl 生成证书失败：${error instanceof Error ? error.message : String(error)}`)
	}
	// openssl writes the key with the ambient umask; the private key stays
	// owner-only.
	await chmod(keyPath, 0o600).catch(() => {})
	await chmod(certPath, 0o644).catch(() => {})
	const [key, cert] = await Promise.all([readFile(keyPath, 'utf8'), readFile(certPath, 'utf8')])
	const certificate = new X509Certificate(cert)
	logger?.info?.(`dsh-manager: 已为 ${address} 生成自签证书，${certificate.validTo} 到期`)
	return {
		key,
		cert,
		fingerprint: certificateFingerprint(cert),
		validTo: certificate.validTo,
		reused: false,
	}
}

/**
 * Build the LAN access manager.
 *
 * @param {{connection: object, webServer: object | (() => object | undefined), dataDir: string, logger?: object, port?: number, address?: string}} options - The options.
 * @returns {object} The manager.
 */
export function createLanAccess({ connection, webServer, dataDir, logger, port, address }) {
	const state = {
		enabled: false,
		running: false,
		address: '',
		listenPort: port ?? DEFAULT_PORT,
		url: '',
		matrix: [],
		certificate: null,
		upstream: '',
		error: '',
	}
	let server = null
	// The upstream keeps its connections alive; the manager owns them so a
	// stopped listener leaves no socket behind.
	const upstreamAgent = new http.Agent({ keepAlive: true })
	const upstreamTlsAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: false })

	/**
	 * The current state of the listener.
	 *
	 * @returns {object} The state.
	 */
	function status() {
		return {
			enabled: state.enabled,
			running: state.running,
			addresses: detectLanAddresses(),
			address: state.address,
			port: state.listenPort,
			url: state.url,
			matrix: state.matrix,
			certificate: state.certificate,
			upstream: state.upstream,
			error: state.error,
		}
	}

	/**
	 * The state without the access link and its QR code.
	 *
	 * @returns {object} The summary.
	 */
	function summary() {
		return {
			enabled: state.enabled,
			running: state.running,
			address: state.address,
			port: state.listenPort,
			upstream: state.upstream,
			error: state.error,
		}
	}

	/**
	 * Forward one request to the upstream web server.
	 *
	 * @param {object} req - The incoming request.
	 * @param {object} res - The response.
	 * @param {object} upstream - The upstream parts.
	 * @returns {void}
	 */
	function forward(req, res, upstream) {
		const headers = rewriteRequestHeaders(req.headers, upstream)
		const secure = upstream.protocol === 'https:'
		const agent = secure ? https : http
		const proxied = agent.request({
			host: upstream.hostname,
			port: upstream.port,
			method: req.method,
			path: req.url,
			headers,
			rejectUnauthorized: false,
			agent: secure ? upstreamTlsAgent : upstreamAgent,
		}, (upstreamRes) => {
			const responseHeaders = { ...upstreamRes.headers }
			if (Array.isArray(responseHeaders['set-cookie'])) {
				responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map(withSecureCookie)
			}
			res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders)
			upstreamRes.pipe(res)
		})
		proxied.on('error', (error) => {
			logger?.warn?.(`dsh-manager: 局域网代理转发失败：${error instanceof Error ? error.message : String(error)}`)
			if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
			res.end('dsh lan access: upstream unavailable\n')
		})
		req.pipe(proxied)
	}

	/**
	 * Forward one WebSocket upgrade to the upstream web server.
	 *
	 * @param {object} req - The upgrade request.
	 * @param {object} socket - The client socket.
	 * @param {Buffer} head - The bytes that arrived with the handshake.
	 * @param {object} upstream - The upstream parts.
	 * @returns {void}
	 */
	function forwardUpgrade(req, socket, head, upstream) {
		const headers = rewriteRequestHeaders(req.headers, upstream)
		const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`]
		for (const [name, value] of Object.entries(headers)) {
			if (value === undefined) continue
			if (Array.isArray(value)) for (const item of value) lines.push(`${name}: ${item}`)
			else lines.push(`${name}: ${value}`)
		}
		const connect = upstream.protocol === 'https:'
			? tls.connect({ host: upstream.hostname, port: upstream.port, rejectUnauthorized: false })
			: net.connect({ host: upstream.hostname, port: upstream.port })
		connect.on('connect', () => {
			connect.write(`${lines.join('\r\n')}\r\n\r\n`)
			if (head !== undefined && head.length > 0) connect.write(head)
			socket.pipe(connect)
			connect.pipe(socket)
		})
		connect.on('error', () => socket.destroy())
		socket.on('error', () => connect.destroy())
	}

	/**
	 * Start the listener.
	 *
	 * @returns {Promise<object>} The state.
	 */
	async function enable() {
		if (state.running) return status()
		state.error = ''
		const addresses = detectLanAddresses()
		const chosen = address ?? addresses[0]
		if (chosen === undefined) {
			state.error = '没有找到局域网 IPv4 地址，请确认本机已连上局域网'
			return status()
		}
		let upstream
		try {
			const server = typeof webServer === 'function' ? webServer() : webServer
			if (server === undefined) throw new Error('当前 Host 没有 Web 服务')
			upstream = parseOrigin(server.getOrigin())
		} catch (error) {
			state.error = `读取本机 Web 服务地址失败：${error instanceof Error ? error.message : String(error)}`
			return status()
		}
		let material
		try {
			material = await ensureCertificate({ dir: join(dataDir, 'lan-access', 'tls'), address: chosen, logger })
		} catch (error) {
			state.error = error instanceof Error ? error.message : String(error)
			return status()
		}
		const listener = https.createServer({ key: material.key, cert: material.cert }, (req, res) => {
			forward(req, res, upstream)
		})
		listener.on('upgrade', (req, socket, head) => {
			forwardUpgrade(req, socket, head, upstream)
		})
		listener.on('error', (error) => {
			state.error = `监听失败：${error instanceof Error ? error.message : String(error)}`
			logger?.warn?.(`dsh-manager: ${state.error}`)
		})
		try {
			await new Promise((resolve, reject) => {
				listener.once('error', reject)
				listener.listen(state.listenPort, chosen, resolve)
			})
		} catch (error) {
			state.error = `无法在 ${chosen}:${String(state.listenPort)} 监听：${error instanceof Error ? error.message : String(error)}`
			await rm(join(dataDir, 'lan-access', 'tls'), { recursive: true, force: true }).catch(() => {})
			return status()
		}
		server = listener
		const bound = listener.address()
		if (bound !== null && typeof bound === 'object') state.listenPort = bound.port
		state.running = true
		state.address = chosen
		state.upstream = `${upstream.protocol}//${upstream.authority}`
		state.certificate = {
			fingerprint: material.fingerprint,
			validTo: material.validTo,
			reused: material.reused,
		}
		const base = `https://${chosen}:${String(state.listenPort)}/`
		state.url = connection.authenticatedUrl(base)
		const qr = encodeQr(state.url)
		state.matrix = qr.rows
		logger?.info?.(`dsh-manager: 局域网访问已开启：${state.url}`)
		return status()
	}

	/**
	 * Stop the listener.
	 *
	 * @returns {Promise<object>} The state.
	 */
	async function disable() {
		state.running = false
		state.url = ''
		state.matrix = []
		state.certificate = null
		state.error = ''
		const listener = server
		server = null
		upstreamAgent.destroy()
		upstreamTlsAgent.destroy()
		if (listener !== null) {
			await new Promise((resolve) => {
				listener.close(() => resolve())
				listener.closeAllConnections?.()
			})
		}
		return status()
	}

	/**
	 * Apply the persisted switch.
	 *
	 * @param {boolean} enabled - Whether the switch is on.
	 * @returns {Promise<object>} The state.
	 */
	async function apply(enabled) {
		state.enabled = enabled
		if (enabled) return enable()
		return disable()
	}

	return {
		status,
		summary,
		enable,
		disable,
		apply,
		dispose: async () => {
			await disable()
		},
	}
}

/**
 * A stable digest of the launch token, so the panel can show that the link
 * changed without printing the token itself.
 *
 * @param {string} url - The authenticated URL.
 * @returns {string} The digest.
 */
export function tokenDigest(url) {
	return createHash('sha256').update(url).digest('hex').slice(0, 12)
}
