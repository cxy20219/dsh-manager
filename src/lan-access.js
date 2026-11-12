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
import { appendFile, chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { hostname, networkInterfaces } from 'node:os'
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

/** The local certificate authority lifetime in days. */
const CA_DAYS = 3650

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
 * Whether a cookie needs the `Secure` attribute.
 *
 * Only a TLS listener may mark a cookie secure: a browser drops a secure
 * cookie that arrives over plain HTTP.
 *
 * @param {boolean} secure - Whether the listener speaks TLS.
 * @returns {(cookie: string) => string} The cookie writer.
 */
function cookieWriter(secure) {
	return secure ? withSecureCookie : (cookie) => cookie
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
 * The openssl configuration of the local certificate authority.
 *
 * @returns {string} The configuration file content.
 */
function caConfiguration() {
	return [
		'[req]',
		'distinguished_name = dn',
		'x509_extensions = ext',
		'prompt = no',
		'[dn]',
		'CN = dsh-manager local CA',
		'[ext]',
		'basicConstraints = critical,CA:TRUE,pathlen:0',
		'keyUsage = critical,keyCertSign,cRLSign',
		'subjectKeyIdentifier = hash',
		'',
	].join('\n')
}

/**
 * The openssl configuration of the server certificate.
 *
 * @param {string} address - The IP address the certificate is issued for.
 * @param {string[]} names - The host names the certificate also covers.
 * @returns {string} The configuration file content.
 */
function leafConfiguration(address, names) {
	const subjectAltName = [`IP:${address}`, ...names.map((name) => `DNS:${name}`)].join(',')
	return [
		'[req]',
		'distinguished_name = dn',
		'prompt = no',
		'[dn]',
		`CN = ${address}`,
		'[v3]',
		`subjectAltName = ${subjectAltName}`,
		'basicConstraints = critical,CA:FALSE',
		'keyUsage = critical,digitalSignature,keyEncipherment',
		'extendedKeyUsage = serverAuth',
		'subjectKeyIdentifier = hash',
		'authorityKeyIdentifier = keyid,issuer',
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
 * The server certificate is signed by a local certificate authority instead
 * of being self-signed: a phone refuses a WebSocket to a certificate it does
 * not trust, even after the reader let the page through a warning, so the
 * user has to be able to install one root certificate on the device.
 *
 * @param {{dir: string, address: string, names?: string[], logger?: object}} options - The options.
 * @returns {Promise<{key: string, cert: string, ca: string, fingerprint: string, validTo: string, reused: boolean}>} The material.
 */
export async function ensureCertificate({ dir, address, names = [], logger }) {
	await mkdir(dir, { recursive: true, mode: 0o700 })
	const caKeyPath = join(dir, 'ca-key.pem')
	const caCertPath = join(dir, 'ca-cert.pem')
	const keyPath = join(dir, 'key.pem')
	const certPath = join(dir, 'cert.pem')
	const openssl = await findOpenssl()
	if (openssl === undefined) throw new Error('找不到 openssl，无法生成证书')

	let caCert = ''
	try {
		caCert = await readFile(caCertPath, 'utf8')
		const ca = new X509Certificate(caCert)
		if (Date.parse(ca.validTo) <= Date.now()) throw new Error('expired')
	} catch {
		const caConfigPath = join(dir, 'ca.cnf')
		await writeFile(caConfigPath, caConfiguration(), { encoding: 'utf8', mode: 0o600 })
		try {
			await execFileAsync(openssl, [
				'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes',
				'-days', String(CA_DAYS),
				'-keyout', caKeyPath, '-out', caCertPath,
				'-config', caConfigPath,
			])
		} catch (error) {
			throw new Error(`openssl 生成根证书失败：${error instanceof Error ? error.message : String(error)}`)
		}
		await chmod(caKeyPath, 0o600).catch(() => {})
		await chmod(caCertPath, 0o644).catch(() => {})
		caCert = await readFile(caCertPath, 'utf8')
		logger?.info?.('dsh-manager: 已生成局域网根证书，手机信任它之后即可使用加密访问')
	}

	try {
		const [key, cert] = await Promise.all([readFile(keyPath, 'utf8'), readFile(certPath, 'utf8')])
		const certificate = new X509Certificate(cert)
		const expired = Date.parse(certificate.validTo) <= Date.now()
		const signedByAuthority = certificate.verify(new X509Certificate(caCert).publicKey)
		if (!expired && signedByAuthority && certificateAddresses(cert).includes(address)) {
			return {
				key,
				cert,
				ca: caCert,
				fingerprint: certificateFingerprint(cert),
				validTo: certificate.validTo,
				reused: true,
			}
		}
	} catch {
		// No usable material on disk: issue a new one.
	}

	const configPath = join(dir, 'openssl.cnf')
	await writeFile(configPath, leafConfiguration(address, names), { encoding: 'utf8', mode: 0o600 })
	const requestPath = join(dir, 'server.csr')
	try {
		await execFileAsync(openssl, [
			'req', '-new', '-newkey', 'rsa:2048', '-nodes',
			'-keyout', keyPath, '-out', requestPath,
			'-config', configPath,
		])
		await execFileAsync(openssl, [
			'x509', '-req', '-in', requestPath,
			'-CA', caCertPath, '-CAkey', caKeyPath, '-CAcreateserial',
			'-out', certPath, '-days', String(CERTIFICATE_DAYS),
			'-sha256', '-extfile', configPath, '-extensions', 'v3',
		])
	} catch (error) {
		throw new Error(`openssl 生成服务器证书失败：${error instanceof Error ? error.message : String(error)}`)
	}
	await rm(requestPath, { force: true }).catch(() => {})
	// openssl writes the key with the ambient umask; the private key stays
	// owner-only.
	await chmod(keyPath, 0o600).catch(() => {})
	await chmod(certPath, 0o644).catch(() => {})
	const [key, cert] = await Promise.all([readFile(keyPath, 'utf8'), readFile(certPath, 'utf8')])
	const certificate = new X509Certificate(cert)
	logger?.info?.(`dsh-manager: 已为 ${address} 签发服务器证书，${certificate.validTo} 到期`)
	return {
		key,
		cert,
		ca: caCert,
		fingerprint: certificateFingerprint(cert),
		validTo: certificate.validTo,
		reused: false,
	}
}

/**
 * The host names the server certificate also covers.
 *
 * The mDNS name of the machine is handy on a phone: it survives a change of
 * the DHCP address, as long as the device resolves it.
 *
 * @returns {string[]} The host names.
 */
function hostNames() {
	const name = hostname()
	if (name === '') return []
	return name.endsWith('.local') ? [name] : [name, `${name}.local`]
}

/**
 * Build the LAN access manager.
 *
 * @param {{connection: object, webServer: object | (() => object | undefined), dataDir: string, logger?: object, port?: number, address?: string, secure?: boolean}} options - The options.
 * @returns {object} The manager.
 */
export function createLanAccess({ connection, webServer, dataDir, logger, port, address, secure = false }) {
	const state = {
		enabled: false,
		running: false,
		secure,
		address: '',
		listenPort: port ?? DEFAULT_PORT,
		url: '',
		matrix: [],
		certificate: null,
		ca: '',
		upstream: '',
		error: '',
	}
	let server = null
	// The upstream keeps its connections alive; the manager owns them so a
	// stopped listener leaves no socket behind.
	const upstreamAgent = new http.Agent({ keepAlive: true })
	const upstreamTlsAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: false })

	/**
	 * Append one line to the access log.
	 *
	 * The log is the only way to see what a phone actually sent: the browser
	 * refuses a WebSocket to an untrusted certificate without leaving a trace
	 * in the page.
	 *
	 * @param {string} message - The line.
	 * @returns {void}
	 */
	function access(message) {
		const line = `${new Date().toISOString()} ${message}\n`
		void appendFile(join(dataDir, 'lan-access', 'access.log'), line).catch(() => {})
	}

	/**
	 * The current state of the listener.
	 *
	 * @returns {object} The state.
	 */
	function status() {
		return {
			enabled: state.enabled,
			running: state.running,
			secure: state.secure,
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
	 * The root certificate a phone has to trust.
	 *
	 * @returns {object} The certificate in PEM and base64 DER form.
	 */
	function ca() {
		if (state.ca === '') return { pem: '', der: '', name: 'dsh-manager-ca.cer' }
		const der = Buffer.from(state.ca.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, ''), 'base64')
		return { pem: state.ca, der: der.toString('base64'), name: 'dsh-manager-ca.cer' }
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
			secure: state.secure,
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
		const writeCookie = cookieWriter(state.secure)
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
			access(`${req.method} ${req.url} -> ${String(upstreamRes.statusCode ?? 0)}`)
			const responseHeaders = { ...upstreamRes.headers }
			if (Array.isArray(responseHeaders['set-cookie'])) {
				responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map(writeCookie)
			}
			res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders)
			upstreamRes.pipe(res)
		})
		proxied.on('error', (error) => {
			access(`ERROR ${req.method} ${req.url} ${error instanceof Error ? error.message : String(error)}`)
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
			connect.once('data', (chunk) => {
				const status = chunk.toString('latin1').split('\r\n', 1)[0]
				access(`UPGRADE ${req.url} -> ${status}`)
			})
			socket.pipe(connect)
			connect.pipe(socket)
		})
		connect.on('error', (error) => {
			access(`UPGRADE ${req.url} ERROR ${error instanceof Error ? error.message : String(error)}`)
			socket.destroy()
		})
		socket.on('error', () => connect.destroy())
		socket.on('close', () => {
			access(`CLOSE ${req.url}`)
			connect.destroy()
		})
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
		let material = null
		if (state.secure) {
			try {
				material = await ensureCertificate({ dir: join(dataDir, 'lan-access', 'tls'), address: chosen, names: hostNames(), logger })
			} catch (error) {
				state.error = error instanceof Error ? error.message : String(error)
				return status()
			}
		}
		const listener = material === null
			? http.createServer((req, res) => { forward(req, res, upstream) })
			: https.createServer({ key: material.key, cert: material.cert }, (req, res) => { forward(req, res, upstream) })
		listener.on('upgrade', (req, socket, head) => {
			forwardUpgrade(req, socket, head, upstream)
		})
		listener.on('error', (error) => {
			state.error = `监听失败：${error instanceof Error ? error.message : String(error)}`
			logger?.warn?.(`dsh-manager: ${state.error}`)
		})
		// A phone that does not trust the certificate fails here, before any
		// request reaches the panel; the reason is worth keeping.
		listener.on('tlsClientError', (error) => {
			access(`TLS ${error instanceof Error ? error.message : String(error)}`)
			logger?.warn?.(`dsh-manager: 局域网 TLS 握手失败：${error instanceof Error ? error.message : String(error)}`)
		})
		listener.on('clientError', (error) => {
			access(`CLIENT ${error instanceof Error ? error.message : String(error)}`)
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
		state.certificate = material === null ? null : {
			fingerprint: material.fingerprint,
			validTo: material.validTo,
			reused: material.reused,
		}
		state.ca = material === null ? '' : material.ca
		const base = `${state.secure ? 'https' : 'http'}://${chosen}:${String(state.listenPort)}/`
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
	async function apply(enabled, secure) {
		state.enabled = enabled
		const changed = typeof secure === 'boolean' && secure !== state.secure
		if (typeof secure === 'boolean') state.secure = secure
		if (!enabled) return disable()
		// The transport changes with the flag, so the listener has to restart.
		if (changed && state.running) await disable()
		return enable()
	}

	return {
		status,
		summary,
		ca,
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
