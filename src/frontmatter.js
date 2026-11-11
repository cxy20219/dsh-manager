/**
 * Small YAML-frontmatter reader for `SKILL.md` files.
 *
 * The manager scans skill categories on its own, so it cannot borrow the
 * filesystem provider's parser. Only the frontmatter keys a catalog entry
 * needs are read (`name`, `description`, `whenToUse` and the two invocation
 * switches); nested `metadata` blocks are skipped. Block scalars (`|`, `>`),
 * quoted scalars and plain scalars are supported because both forms appear in
 * real skill files.
 *
 * @module dsh-manager/frontmatter
 */

/** Kebab-case skill name accepted by the skill registry. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Frontmatter keys the registry rejects in their legacy spelling. */
const LEGACY_KEYS = [
	['disableModelInvocation', 'disable-model-invocation'],
	['modelInvocable', 'disable-model-invocation'],
	['userInvocable', 'user-invocable'],
]

/**
 * Validate one skill name.
 *
 * @param {unknown} value - Candidate name.
 * @returns {boolean} Whether the name is kebab-case.
 */
export function isSkillName(value) {
	return typeof value === 'string' && SKILL_NAME.test(value)
}

/**
 * Split a `SKILL.md` into parsed frontmatter and body.
 *
 * @param {string} raw - File contents.
 * @returns {{data: Record<string, unknown>, body: string} | undefined} The split document.
 */
export function splitDocument(raw) {
	const text = String(raw ?? '')
	const firstLineEnd = text.indexOf('\n')
	if (firstLineEnd < 0) return undefined
	if (text.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') return undefined
	const start = firstLineEnd + 1
	const closing = findClosing(text, start)
	if (closing === undefined) return undefined
	return {
		data: parseMapping(text.slice(start, closing.start)),
		body: text.slice(closing.bodyStart),
	}
}

/**
 * Find the closing `---` line of a frontmatter block.
 *
 * @param {string} text - Whole file.
 * @param {number} start - Offset after the opening line.
 * @returns {{start: number, bodyStart: number} | undefined} The closing line bounds.
 */
function findClosing(text, start) {
	let lineStart = start
	while (lineStart <= text.length) {
		const nextNewline = text.indexOf('\n', lineStart)
		const lineEnd = nextNewline < 0 ? text.length : nextNewline
		if (text.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
			return { start: lineStart, bodyStart: nextNewline < 0 ? text.length : nextNewline + 1 }
		}
		if (nextNewline < 0) return undefined
		lineStart = nextNewline + 1
	}
	return undefined
}

/**
 * Parse the top-level scalar keys of a YAML mapping.
 *
 * Indented lines belong to the preceding key: they feed a block scalar or are
 * skipped when they describe a nested value this module does not read.
 *
 * @param {string} text - The frontmatter text.
 * @returns {Record<string, unknown>} The collected keys.
 */
function parseMapping(text) {
	const lines = text.split(/\r?\n/)
	const data = {}
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index]
		if (line.trim() === '' || /^\s*#/.test(line) || /^\s/.test(line)) continue
		const match = /^([A-Za-z0-9_.-]+)[ \t]*:(?:[ \t]+|$)/.exec(line)
		if (match === null) continue
		const key = match[1]
		const rest = line.slice(match[0].length)
		const block = []
		let cursor = index + 1
		while (cursor < lines.length) {
			const next = lines[cursor]
			if (next.trim() !== '' && !/^\s/.test(next)) break
			block.push(next)
			cursor += 1
		}
		index = cursor - 1
		data[key] = parseValue(rest.trim(), block)
	}
	return data
}

/**
 * Parse one scalar or block value.
 *
 * @param {string} rest - Text after the key's colon.
 * @param {string[]} block - Following indented lines.
 * @returns {unknown} The parsed value.
 */
function parseValue(rest, block) {
	const indicator = /^([|>])([+-]?)([1-9]?)$/.exec(rest)
	if (indicator !== null) return parseBlock(block, indicator[1])
	if (rest.startsWith('"')) return parseDoubleQuoted(rest, block)
	if (rest.startsWith("'")) return parseSingleQuoted(rest, block)
	if (rest === '') return undefined
	return plainScalar(rest)
}

/**
 * Read a `|` or `>` block scalar.
 *
 * @param {string[]} block - Indented lines.
 * @param {'|' | '>'} style - Literal or folded.
 * @returns {string} The scalar's text.
 */
function parseBlock(block, style) {
	const lines = [...block]
	while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
	let indent = Number.POSITIVE_INFINITY
	for (const line of lines) {
		if (line.trim() === '') continue
		const width = /^\s*/.exec(line)[0].replace(/\t/g, '  ').length
		if (width < indent) indent = width
	}
	const stripped = lines.map((line) => (line.trim() === '' ? '' : line.replace(/\t/g, '  ').slice(indent)))
	if (style === '|') return stripped.join('\n').replace(/\n+$/, '')
	const paragraphs = []
	let current = []
	for (const line of stripped) {
		if (line === '') {
			if (current.length > 0) {
				paragraphs.push(current.join(' '))
				current = []
			}
			paragraphs.push('')
			continue
		}
		current.push(line)
	}
	if (current.length > 0) paragraphs.push(current.join(' '))
	return paragraphs.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Read a double-quoted scalar, including a value wrapped onto later lines.
 *
 * @param {string} rest - The opening text.
 * @param {string[]} block - Following indented lines.
 * @returns {string} The unescaped value.
 */
function parseDoubleQuoted(rest, block) {
	let text = rest
	let cursor = 0
	while (!closesQuote(text, '"') && cursor < block.length) {
		text += ' ' + block[cursor].trim()
		cursor += 1
	}
	const end = text.lastIndexOf('"')
	const inner = end > 0 ? text.slice(1, end) : text.slice(1)
	return unescapeDouble(inner)
}

/**
 * Read a single-quoted scalar.
 *
 * @param {string} rest - The opening text.
 * @param {string[]} block - Following indented lines.
 * @returns {string} The unescaped value.
 */
function parseSingleQuoted(rest, block) {
	let text = rest
	let cursor = 0
	while (!closesQuote(text, "'") && cursor < block.length) {
		text += ' ' + block[cursor].trim()
		cursor += 1
	}
	const end = text.lastIndexOf("'")
	const inner = end > 0 ? text.slice(1, end) : text.slice(1)
	return inner.replace(/''/g, "'")
}

/**
 * Whether a quoted scalar closes on this line.
 *
 * @param {string} text - Scalar text starting at the opening quote.
 * @param {'"' | "'"} quote - Opening quote.
 * @returns {boolean} Whether a closing quote exists.
 */
function closesQuote(text, quote) {
	if (quote === "'") {
		for (let index = 1; index < text.length; index += 1) {
			if (text[index] !== "'") continue
			if (text[index + 1] === "'") {
				index += 1
				continue
			}
			return true
		}
		return false
	}
	for (let index = 1; index < text.length; index += 1) {
		if (text[index] === '\\') {
			index += 1
			continue
		}
		if (text[index] === '"') return true
	}
	return false
}

/**
 * Decode YAML double-quoted escapes the frontmatter actually uses.
 *
 * @param {string} inner - Text between the quotes.
 * @returns {string} The decoded text.
 */
function unescapeDouble(inner) {
	return inner.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (whole, escaped) => {
		switch (escaped[0]) {
			case 'u':
			case 'x': return String.fromCodePoint(Number.parseInt(escaped.slice(1), 16))
			case 'n': return '\n'
			case 't': return '\t'
			case 'r': return '\r'
			case '0': return '\0'
			case '"': return '"'
			case '\\': return '\\'
			case '/': return '/'
			case ' ': return ' '
			default: return whole
		}
	})
}

/**
 * Parse a plain scalar, dropping a trailing comment.
 *
 * @param {string} raw - Scalar text.
 * @returns {unknown} The parsed value.
 */
function plainScalar(raw) {
	const text = raw.replace(/\s+#.*$/, '').trim()
	if (text === '' || text === 'null' || text === 'Null' || text === '~') return null
	if (text === 'true' || text === 'True' || text === 'TRUE') return true
	if (text === 'false' || text === 'False' || text === 'FALSE') return false
	if (/^-?\d+$/.test(text)) return Number(text)
	return text
}

/**
 * Read one frontmatter boolean through the registry's accepted spellings.
 *
 * @param {Record<string, unknown>} data - Parsed frontmatter.
 * @param {string} key - Field name.
 * @returns {boolean | undefined} The value, or undefined when absent.
 * @throws {Error} When the value is not an accepted boolean.
 */
function frontmatterBoolean(data, key) {
	if (!Object.hasOwn(data, key)) return undefined
	const value = data[key]
	if (typeof value === 'boolean') return value
	if (value === 1 || value === '1') return true
	if (value === 0 || value === '0') return false
	if (typeof value === 'string') {
		switch (value.toLowerCase()) {
			case 'true':
			case 'yes':
			case 'on': return true
			case 'false':
			case 'no':
			case 'off': return false
		}
	}
	throw new Error(`frontmatter 字段 "${key}" 必须是布尔值`)
}

/**
 * Read one skill's catalog-facing data from `SKILL.md` contents.
 *
 * @param {string} raw - File contents.
 * @returns {{ok: true, name: string, description: string, whenToUse?: string, invocation: {modelInvocable: boolean, userInvocable: boolean}, body: string} | {ok: false, error: string}} The result.
 */
export function parseSkillDocument(raw) {
	const split = splitDocument(raw)
	if (split === undefined) return { ok: false, error: '缺少 frontmatter（文件必须以 --- 开头并有闭合的 --- 行）' }
	const data = split.data
	for (const [legacy, canonical] of LEGACY_KEYS) {
		if (Object.hasOwn(data, legacy)) {
			return { ok: false, error: `frontmatter 字段 "${legacy}" 已废弃，请改用 "${canonical}"` }
		}
	}
	const name = data.name
	if (!isSkillName(name)) return { ok: false, error: `name 必须是 kebab-case，当前为 ${JSON.stringify(name ?? null)}` }
	const description = typeof data.description === 'string' ? data.description.trim() : ''
	if (description === '') return { ok: false, error: 'description 不能为空' }
	let invocation
	try {
		invocation = {
			modelInvocable: frontmatterBoolean(data, 'disable-model-invocation') !== true,
			userInvocable: frontmatterBoolean(data, 'user-invocable') !== false,
		}
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) }
	}
	const whenToUse = typeof data.whenToUse === 'string' && data.whenToUse.trim() !== '' ? data.whenToUse.trim() : undefined
	return {
		ok: true,
		name,
		description,
		...(whenToUse === undefined ? {} : { whenToUse }),
		invocation,
		body: split.body.trim(),
	}
}
