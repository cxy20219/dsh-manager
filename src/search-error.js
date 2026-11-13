/**
 * A classified search-channel failure.
 *
 * Own module so the HTML SERP family can throw the same errors without
 * importing the channel registry (which imports the SERP registry).
 *
 * @module dsh-manager/search-error
 */

/** A classified channel failure. */
export class SearchChannelError extends Error {
	/**
	 * @param {string} code - `auth`, `quota`, `rate-limit`, `bot-wall`, `timeout`, `server`, `bad-request`, `network`, `config`, or `invalid-response`.
	 * @param {string} message - Operator-facing message; never contains an API key.
	 * @param {number} [status] - HTTP status when one applied.
	 */
	constructor(code, message, status) {
		super(message)
		this.name = 'SearchChannelError'
		this.code = code
		if (typeof status === 'number') this.status = status
	}
}
