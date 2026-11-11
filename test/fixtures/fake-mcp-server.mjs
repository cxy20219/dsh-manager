/**
 * A minimal MCP stdio server used by the client tests.
 *
 * It speaks newline-delimited JSON-RPC, serves two tools and exits when its
 * stdin closes so a failed test cannot leave the process behind.
 */

process.stdin.setEncoding('utf8')
let buffer = ''

process.stdin.on('data', (chunk) => {
	buffer += chunk
	for (;;) {
		const newline = buffer.indexOf('\n')
		if (newline < 0) break
		const line = buffer.slice(0, newline).trim()
		buffer = buffer.slice(newline + 1)
		if (line !== '') handle(JSON.parse(line))
	}
})

process.stdin.on('end', () => {
	process.exit(0)
})

function send(message) {
	process.stdout.write(`${JSON.stringify(message)}\n`)
}

function handle(message) {
	if (message.method === 'initialize') {
		send({
			jsonrpc: '2.0',
			id: message.id,
			result: {
				protocolVersion: '2025-06-18',
				capabilities: { tools: {} },
				serverInfo: { name: 'fake', version: '1.0.0' },
			},
		})
		return
	}
	if (message.method === 'notifications/initialized') return
	if (message.method === 'tools/list') {
		send({
			jsonrpc: '2.0',
			id: message.id,
			result: {
				tools: [
					{
						name: 'echo',
						description: 'Echo the given text',
						inputSchema: {
							type: 'object',
							properties: { text: { type: 'string' } },
							required: ['text'],
						},
					},
					{
						name: 'weird.name',
						description: 'A name outside the function-name contract',
						inputSchema: { type: 'object', properties: {} },
					},
					{
						name: 'read_env',
						description: 'Reads one configured environment value',
						inputSchema: { type: 'object', properties: {} },
					},
				],
			},
		})
		return
	}
	if (message.method === 'tools/call') {
		if (message.params?.name === 'echo') {
			send({
				jsonrpc: '2.0',
				id: message.id,
				result: { content: [{ type: 'text', text: String(message.params?.arguments?.text ?? '') }] },
			})
			return
		}
		if (message.params?.name === 'read_env') {
			send({
				jsonrpc: '2.0',
				id: message.id,
				result: { content: [{ type: 'text', text: String(process.env.MCP_TEST_TOKEN ?? '') }] },
			})
			return
		}
		send({
			jsonrpc: '2.0',
			id: message.id,
			result: { isError: true, content: [{ type: 'text', text: `unknown tool ${message.params?.name}` }] },
		})
		return
	}
	if (message.id !== undefined) {
		send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `unknown method ${message.method}` } })
	}
}
