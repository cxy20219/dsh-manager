import assert from 'node:assert/strict'
import test from 'node:test'

import { createModelRerank, resolveRerankKey, RERANK_MODEL } from '../src/rerank.js'

/** Credentials stub that answers through `resolve`. */
function credentialsWith(value) {
	return {
		async readRecord(key) {
			return key === 'dsh-manager/rerank' ? { kind: 'api-key', key: 'record-key' } : undefined
		},
		async resolve(ref) {
			return ref === 'SILICONFLOW_API_KEY' ? value : undefined
		},
	}
}

test('the reranker sends the documents and maps the returned scores', async () => {
	const calls = []
	const rerank = createModelRerank({
		credentials: credentialsWith('host-key'),
		fetchImpl: async (url, init) => {
			calls.push({ url, init })
			return new Response(JSON.stringify({
				results: [{ index: 1, relevance_score: 0.9 }, { index: 0, relevance_score: 0.2 }],
			}), { status: 200 })
		},
	})
	const scores = await rerank('hello', ['one', 'two'])
	assert.deepEqual(scores, [0.2, 0.9])
	assert.equal(calls.length, 1)
	assert.match(calls[0].init.headers.authorization, /record-key/)
	const body = JSON.parse(calls[0].init.body)
	assert.equal(body.model, RERANK_MODEL)
	assert.equal(body.query, 'hello')
	assert.deepEqual(body.documents, ['one', 'two'])
})

test('the host credential wins over the environment and the record wins over both', async () => {
	const saved = process.env.SILICONFLOW_API_KEY
	process.env.SILICONFLOW_API_KEY = 'env-key'
	try {
		assert.equal(await resolveRerankKey(credentialsWith('host-key')), 'record-key')
		const hostOnly = {
			async readRecord() {
				return undefined
			},
			async resolve() {
				return 'host-key'
			},
		}
		assert.equal(await resolveRerankKey(hostOnly), 'host-key')
		assert.equal(await resolveRerankKey(undefined), 'env-key')
	} finally {
		if (saved === undefined) delete process.env.SILICONFLOW_API_KEY
		else process.env.SILICONFLOW_API_KEY = saved
	}
})

test('a missing key returns null without any request', async () => {
	const saved = process.env.SILICONFLOW_API_KEY
	delete process.env.SILICONFLOW_API_KEY
	try {
		let called = false
		const rerank = createModelRerank({
			credentials: { async readRecord() {}, async resolve() {} },
			fetchImpl: async () => {
				called = true
				return new Response('{}')
			},
		})
		assert.equal(await rerank('q', ['a']), null)
		assert.equal(called, false)
	} finally {
		if (saved === undefined) delete process.env.SILICONFLOW_API_KEY
		else process.env.SILICONFLOW_API_KEY = saved
	}
})
