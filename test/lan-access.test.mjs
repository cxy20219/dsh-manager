import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { X509Certificate } from 'node:crypto'

import { createLanAccess, detectLanAddresses, ensureCertificate, rewriteRequestHeaders } from '../src/lan-access.js'

const interfaces = {
	lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
	en0: [{ address: '192.168.31.40', family: 'IPv4', internal: false }],
	en1: [{ address: '10.0.0.7', family: 'IPv4', internal: false }],
	utun0: [{ address: '169.254.10.1', family: 'IPv4', internal: false }],
	lo1: [{ address: '172.30.213.104', family: 'IPv4', internal: true }],
}

test('offers only the routable LAN addresses, home networks first', () => {
	assert.deepEqual(detectLanAddresses(interfaces), ['192.168.31.40', '10.0.0.7'])
})

test('rewrites the browser headers to the upstream authority', () => {
	const upstream = { protocol: 'http:', hostname: '127.0.0.1', port: 50326, authority: '127.0.0.1:50326' }
	const headers = rewriteRequestHeaders({
		host: '192.168.31.40:8443',
		origin: 'https://192.168.31.40:8443',
		referer: 'https://192.168.31.40:8443/chat',
		'x-forwarded-host': 'evil.example',
		cookie: 'dsh-auth-abc=1',
	}, upstream)
	assert.equal(headers.host, '127.0.0.1:50326')
	assert.equal(headers.origin, 'http://127.0.0.1:50326')
	assert.equal(headers.referer, 'http://127.0.0.1:50326/chat')
	assert.equal(headers.cookie, 'dsh-auth-abc=1')
	assert.equal(headers['x-forwarded-host'], undefined)
})

test('forwards requests and upgrades to the upstream over TLS', async (t) => {
	const received = []
	const upstream = http.createServer((req, res) => {
		received.push({ url: req.url, headers: req.headers })
		res.writeHead(200, { 'content-type': 'text/plain', 'set-cookie': 'dsh-auth-x=1; Path=/' })
		res.end('upstream body')
	})
	upstream.on('upgrade', (req, socket) => {
		received.push({ url: req.url, headers: req.headers })
		socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
		// A separate record: bytes that arrive in the same record as the
		// handshake are consumed by the client parser and never re-emitted.
		setTimeout(() => {
			socket.write('upgrade payload')
			socket.end()
		}, 30)
	})
	await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
	const upstreamPort = upstream.address().port
	t.after(() => new Promise((resolve) => {
		upstream.closeAllConnections()
		upstream.close(resolve)
	}))

	const dataDir = await mkdtemp(join(tmpdir(), 'dsh-lan-test-'))
	t.after(() => rm(dataDir, { recursive: true, force: true }))

	const manager = createLanAccess({
		connection: { authenticatedUrl: (url) => `${url}?token=launch-token` },
		webServer: { getOrigin: () => `http://127.0.0.1:${String(upstreamPort)}` },
		dataDir,
		address: '127.0.0.1',
		port: 0,
	})
	t.after(() => manager.dispose())

	const state = await manager.enable()
	assert.equal(state.running, true, state.error)
	assert.equal(state.url, `https://127.0.0.1:${String(state.port)}/?token=launch-token`)
	assert.ok(state.matrix.length > 0)
	assert.equal(state.matrix.length, state.matrix[0].length)
	assert.match(state.matrix[0], /^[01]+$/)
	assert.ok(state.certificate.fingerprint.length > 32)

	const body = await new Promise((resolve, reject) => {
		const request = https.request({
			host: '127.0.0.1',
			port: state.port,
			path: '/?token=launch-token',
			headers: { origin: `https://127.0.0.1:${String(state.port)}`, 'sec-fetch-site': 'same-origin' },
			rejectUnauthorized: false,
		}, (response) => {
			let text = ''
			response.setEncoding('utf8')
			response.on('data', (chunk) => { text += chunk })
			response.on('end', () => resolve({ text, headers: response.headers }))
		})
		request.on('error', reject)
		request.end()
	})
	assert.equal(body.text, 'upstream body')
	assert.equal(received[0].headers.host, `127.0.0.1:${String(upstreamPort)}`)
	assert.equal(received[0].headers.origin, `http://127.0.0.1:${String(upstreamPort)}`)
	assert.match(String(body.headers['set-cookie']), /; Secure/)

	const upgraded = await new Promise((resolve, reject) => {
		const request = https.request({
			host: '127.0.0.1',
			port: state.port,
			path: '/api/remote.mux',
			headers: { connection: 'Upgrade', upgrade: 'websocket' },
			rejectUnauthorized: false,
		})
		request.on('upgrade', (response, socket) => {
			socket.setEncoding('utf8')
			socket.once('data', (chunk) => {
				resolve(String(chunk))
				socket.destroy()
			})
		})
		request.on('error', reject)
		request.end()
	})
	assert.equal(upgraded, 'upgrade payload')
	assert.equal(received[1].headers.host, `127.0.0.1:${String(upstreamPort)}`)
})

test('issues a server certificate that the local authority signs', async (t) => {
	const dataDir = await mkdtemp(join(tmpdir(), 'dsh-lan-test-'))
	t.after(() => rm(dataDir, { recursive: true, force: true }))
	const material = await ensureCertificate({ dir: join(dataDir, 'tls'), address: '192.168.31.40', names: ['host.local'] })
	const leaf = new X509Certificate(material.cert)
	const authority = new X509Certificate(material.ca)
	assert.equal(leaf.verify(authority.publicKey), true, 'the leaf is signed by the local authority')
	assert.equal(authority.ca, true, 'the authority is a certificate authority')
	assert.equal(authority.subject, 'CN=dsh-manager local CA')
	assert.match(leaf.subjectAltName ?? '', /IP Address:192\.168\.31\.40/)
	assert.match(leaf.subjectAltName ?? '', /DNS:host\.local/)
	const again = await ensureCertificate({ dir: join(dataDir, 'tls'), address: '192.168.31.40', names: ['host.local'] })
	assert.equal(again.reused, true, 'the material is reused while the address does not change')
})

test('reports the state after the listener stops', async (t) => {
	const upstream = http.createServer((req, res) => res.end('ok'))
	await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
	const upstreamPort = upstream.address().port
	t.after(() => new Promise((resolve) => {
		upstream.closeAllConnections()
		upstream.close(resolve)
	}))
	const dataDir = await mkdtemp(join(tmpdir(), 'dsh-lan-test-'))
	t.after(() => rm(dataDir, { recursive: true, force: true }))
	const manager = createLanAccess({
		connection: { authenticatedUrl: (url) => url },
		webServer: { getOrigin: () => `http://127.0.0.1:${String(upstreamPort)}` },
		dataDir,
		address: '127.0.0.1',
		port: 0,
	})
	t.after(() => manager.dispose())
	await manager.enable()
	const stopped = await manager.disable()
	assert.equal(stopped.running, false)
	assert.equal(stopped.url, '')
	assert.deepEqual(stopped.matrix, [])
})
