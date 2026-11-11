import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
	McpStdioClient,
	MAX_PUBLIC_NAME_LENGTH,
	buildChildEnv,
	isServerName,
	publicToolName,
} from '../src/mcp-client.js'

const server = fileURLToPath(new URL('./fixtures/fake-mcp-server.mjs', import.meta.url))

test('completes the handshake, lists tools, and calls one', async () => {
	const client = new McpStdioClient({ command: process.execPath, args: [server], logger: { warn() {} } })
	try {
		const negotiated = await client.connect()
		assert.equal(negotiated.serverInfo.name, 'fake')
		assert.equal(negotiated.protocolVersion, '2025-06-18')
		const tools = await client.listTools()
		assert.deepEqual(tools.map((tool) => tool.name), ['echo', 'weird.name', 'read_env'])
		const result = await client.callTool('echo', { text: '你好' })
		assert.equal(result.content[0].text, '你好')
		const failure = await client.callTool('missing', {})
		assert.equal(failure.isError, true)
	} finally {
		await client.close()
	}
})

test('reports a spawn failure instead of hanging', async () => {
	const client = new McpStdioClient({ command: '/nonexistent/dsh-manager-test-binary', args: [] })
	await assert.rejects(client.connect(), /ENOENT|MCP 连接已关闭|MCP 进程已退出/)
	await client.close()
})

test('derives stable public names inside the function-name contract', () => {
	assert.equal(publicToolName('fs', 'read_file'), 'mcp__fs__read_file')
	const hashed = publicToolName('fs', 'read.file')
	assert.match(hashed, /^mcp__fs__read_file_[0-9a-f]{12}$/)
	assert.equal(hashed, publicToolName('fs', 'read.file'))
	const long = publicToolName('server', 'x'.repeat(120))
	assert.equal(long.length, MAX_PUBLIC_NAME_LENGTH)
	assert.match(long, /_[0-9a-f]{12}$/)
})

test('validates server names', () => {
	assert.equal(isServerName('github'), true)
	assert.equal(isServerName('my-server_1'), true)
	assert.equal(isServerName('has space'), false)
	assert.equal(isServerName('x'.repeat(33)), false)
	assert.equal(isServerName(''), false)
})

test('scrubs credential-shaped names from the child environment', () => {
	const saved = {
		FAKE_MCP_API_KEY: process.env.FAKE_MCP_API_KEY,
		FAKE_MCP_PLAIN: process.env.FAKE_MCP_PLAIN,
		DSH_PROFILE: process.env.DSH_PROFILE,
	}
	process.env.FAKE_MCP_API_KEY = 'secret'
	process.env.FAKE_MCP_PLAIN = 'plain'
	try {
		const env = buildChildEnv({ NEEDED: 'yes', EMPTY: '' })
		assert.equal(env.FAKE_MCP_API_KEY, undefined)
		assert.equal(env.FAKE_MCP_PLAIN, 'plain')
		assert.equal(env.NEEDED, 'yes')
		assert.equal(env.EMPTY, undefined)
	} finally {
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	}
})
