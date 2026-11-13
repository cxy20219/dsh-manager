/**
 * Optional model reranker for the research pipeline.
 *
 * The research tool always has a cheap lexical ranking. When a SiliconFlow key
 * is available it asks `BAAI/bge-reranker-v2-m3` for a query–document score
 * and uses that order instead. No key, a network failure or a malformed
 * response all degrade to the lexical order; the research run never fails
 * because the reranker did.
 *
 * The key is resolved like the search channels: a manager-owned credential
 * record first, then the Host credential center under `SILICONFLOW_API_KEY`,
 * then the environment. There is no panel field yet; setting the Host
 * credential or the environment variable turns the tier on.
 *
 * @module dsh-manager/rerank
 */

/** SiliconFlow rerank endpoint. */
export const RERANK_ENDPOINT = 'https://api.siliconflow.cn/v1/rerank'

/** The rerank model free-search used. */
export const RERANK_MODEL = 'BAAI/bge-reranker-v2-m3'

/** How long the rerank call may take. */
const RERANK_TIMEOUT_MS = 15_000

/** Manager-owned credential record for the reranker. */
const RECORD_KEY = 'dsh-manager/rerank'

/**
 * Read a non-empty string from a credential record or resolution result.
 *
 * @param {unknown} value - Record or resolved value.
 * @returns {string} The key, or an empty string.
 */
function keyOf(value) {
	if (typeof value === 'string') return value.trim()
	if (value !== null && typeof value === 'object' && typeof value.value === 'string') return value.value.trim()
	return ''
}

/**
 * Resolve the reranker key without throwing.
 *
 * @param {object} [credentials] - Host credential service.
 * @returns {Promise<string>} The key, or an empty string.
 */
export async function resolveRerankKey(credentials) {
	if (credentials !== undefined && credentials !== null) {
		if (typeof credentials.readRecord === 'function') {
			try {
				const record = await credentials.readRecord(RECORD_KEY)
				if (record?.kind === 'api-key') {
					const key = keyOf(record.key)
					if (key !== '') return key
				}
			} catch {
				// Fall through to the next source.
			}
		}
		if (typeof credentials.resolve === 'function') {
			try {
				const key = keyOf(await credentials.resolve('SILICONFLOW_API_KEY'))
				if (key !== '') return key
			} catch {
				// Fall through to the environment.
			}
		}
	}
	return keyOf(process.env.SILICONFLOW_API_KEY)
}

/**
 * Build the rerank function the research service accepts.
 *
 * @param {{credentials?: object, fetchImpl?: Function}} [options] - Wiring.
 * @returns {(query: string, documents: string[]) => Promise<number[] | null>} Rerank.
 */
export function createModelRerank({ credentials, fetchImpl } = {}) {
	return async function rerank(query, documents) {
		if (!Array.isArray(documents) || documents.length === 0) return null
		const key = await resolveRerankKey(credentials)
		if (key === '') return null
		const doFetch = typeof fetchImpl === 'function' ? fetchImpl : globalThis.fetch
		if (typeof doFetch !== 'function') return null
		const response = await doFetch(RERANK_ENDPOINT, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${key}`,
				'content-type': 'application/json',
				accept: 'application/json',
			},
			body: JSON.stringify({
				model: RERANK_MODEL,
				query,
				documents: documents.map(String),
				return_documents: false,
			}),
			redirect: 'error',
			signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
		})
		if (!response.ok) throw new Error(`rerank HTTP ${response.status}`)
		const data = await response.json()
		const scores = new Array(documents.length).fill(0)
		for (const item of Array.isArray(data?.results) ? data.results : []) {
			const index = Number(item?.index)
			const score = Number(item?.relevance_score)
			if (Number.isInteger(index) && index >= 0 && index < scores.length && Number.isFinite(score)) scores[index] = score
		}
		return scores
	}
}
