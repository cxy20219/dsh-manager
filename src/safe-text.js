/**
 * UTF-16 safety for text that leaves the plugin.
 *
 * `String.prototype.slice` cuts on code units. A cut inside a surrogate pair
 * leaves a lone surrogate, which is valid JavaScript but not valid Unicode:
 * serialized as an unpaired `\ud83d` it makes the Messages endpoint reject the
 * whole request, and because the poisoned text is stored in the session
 * history every later turn fails too. Two defences keep that impossible:
 *
 *   - every cut of external text goes through {@link truncateText}, which
 *     counts code points and strips stray surrogates first;
 *   - every tool result passes through {@link sanitizeValue} before it is
 *     rendered and serialized.
 *
 * @module dsh-manager/safe-text
 */

/** A high surrogate without its low half, or the reverse. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/** Depth cap for {@link sanitizeValue}; tool values are shallow by design. */
const MAX_SANITIZE_DEPTH = 8

/**
 * Replace lone surrogates with U+FFFD.
 *
 * @param {string} value - Text.
 * @returns {string} Text that survives serialization.
 */
export function stripLoneSurrogates(value) {
	if (typeof value !== 'string' || value.length === 0) return value
	return value.replace(LONE_SURROGATE, '\uFFFD')
}

/**
 * Cut text by code point so a surrogate pair is never split.
 *
 * @param {string} value - Text.
 * @param {number} max - Maximum code points.
 * @returns {string} The safe prefix.
 */
export function truncateText(value, max) {
	const text = stripLoneSurrogates(typeof value === 'string' ? value : String(value ?? ''))
	const limit = Math.floor(Number(max))
	if (!Number.isFinite(limit) || limit < 0) return text
	const chars = Array.from(text)
	if (chars.length <= limit) return text
	return chars.slice(0, limit).join('')
}

/**
 * Strip lone surrogates from every string in a tool value.
 *
 * Arrays and plain objects are copied; other values are returned as-is.
 *
 * @param {unknown} value - Tool value.
 * @param {number} [depth] - Current recursion depth.
 * @returns {unknown} The sanitized value.
 */
export function sanitizeValue(value, depth = 0) {
	if (typeof value === 'string') return stripLoneSurrogates(value)
	if (value === null || typeof value !== 'object' || depth >= MAX_SANITIZE_DEPTH) return value
	if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1))
	const output = {}
	for (const [key, item] of Object.entries(value)) output[key] = sanitizeValue(item, depth + 1)
	return output
}
