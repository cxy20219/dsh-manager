/**
 * A dependency-free QR encoder.
 *
 * The panel has to draw a QR code for the LAN access URL, and the client
 * bundle is a single script that may not pull npm packages into the page.
 * This encoder therefore stays in the plugin: byte mode, error correction
 * level M, versions 1 to 10, which covers every URL the panel prints.
 *
 * The encoder follows ISO/IEC 18004: data is padded, split into blocks,
 * protected with Reed-Solomon codewords, interleaved, written into the
 * module matrix along the zigzag path, and finally masked. The mask is chosen
 * by the four penalty rules, and the format information carries the error
 * correction level and the mask index.
 *
 * @module dsh-manager/qr
 */

/** Error correction level M: 15% of the codewords are recoverable. */
const ECC_M = 0

/** The format-information bits of error correction level M. */
const ECC_FORMAT_BITS = 0b00

/**
 * Per-version geometry for error correction level M.
 *
 * Each row is `[totalCodewords, ecCodewordsPerBlock, group1Blocks,
 * group1DataCodewords, group2Blocks, group2DataCodewords]`.
 */
const VERSIONS = [
	[26, 10, 1, 16, 0, 0],
	[44, 16, 1, 28, 0, 0],
	[70, 26, 1, 44, 0, 0],
	[100, 18, 2, 32, 0, 0],
	[134, 24, 2, 43, 0, 0],
	[172, 16, 4, 27, 0, 0],
	[196, 18, 4, 31, 0, 0],
	[242, 22, 2, 38, 2, 39],
	[292, 22, 3, 36, 2, 37],
	[346, 26, 4, 43, 1, 44],
]

/** The alignment-pattern coordinates of each version. */
const ALIGNMENT_POSITIONS = [
	[],
	[6, 18],
	[6, 22],
	[6, 26],
	[6, 30],
	[6, 34],
	[6, 22, 38],
	[6, 24, 42],
	[6, 26, 46],
	[6, 28, 50],
]

/** The remainder bits the symbol carries after the codewords, per version. */
const REMAINDER_BITS = [0, 7, 7, 7, 7, 7, 0, 0, 0, 0]

/** The exponent table of GF(2^8) with the QR primitive polynomial. */
const EXP = new Uint8Array(512)

/** The logarithm table of GF(2^8). */
const LOG = new Uint8Array(256)

;(function buildTables() {
	let value = 1
	for (let index = 0; index < 255; index += 1) {
		EXP[index] = value
		LOG[value] = index
		value <<= 1
		if ((value & 0x100) !== 0) value ^= 0x11d
	}
	for (let index = 255; index < 512; index += 1) EXP[index] = EXP[index - 255]
})()

/**
 * Multiply two field elements.
 *
 * @param {number} a - First element.
 * @param {number} b - Second element.
 * @returns {number} The product.
 */
function multiply(a, b) {
	if (a === 0 || b === 0) return 0
	return EXP[LOG[a] + LOG[b]]
}

/**
 * Build the Reed-Solomon generator polynomial of one degree.
 *
 * @param {number} degree - Number of error correction codewords.
 * @returns {number[]} The generator, highest coefficient first.
 */
function generatorPolynomial(degree) {
	let poly = [1]
	for (let index = 0; index < degree; index += 1) {
		const next = new Array(poly.length + 1).fill(0)
		for (let position = 0; position < poly.length; position += 1) {
			next[position] ^= poly[position]
			next[position + 1] ^= multiply(poly[position], EXP[index])
		}
		poly = next
	}
	return poly
}

/**
 * Compute the error correction codewords of one block.
 *
 * @param {number[]} data - The block's data codewords.
 * @param {number} count - Number of error correction codewords.
 * @returns {number[]} The error correction codewords.
 */
function errorCorrection(data, count) {
	const generator = generatorPolynomial(count)
	const buffer = [...data, ...new Array(count).fill(0)]
	for (let index = 0; index < data.length; index += 1) {
		const factor = buffer[index]
		if (factor === 0) continue
		for (let position = 0; position < generator.length; position += 1) {
			buffer[index + position] ^= multiply(generator[position], factor)
		}
	}
	return buffer.slice(data.length)
}

/**
 * Read one bit of an integer, least significant bit first.
 *
 * The format and version information are written starting from their lowest
 * bit, which is what every decoder expects at those positions.
 *
 * @param {number} value - The integer.
 * @param {number} index - Bit index, 0 being the least significant one.
 * @returns {boolean} The bit.
 */
function bitOf(value, index) {
	return ((value >>> index) & 1) !== 0
}

/**
 * Compute the 15-bit format information of one mask.
 *
 * @param {number} mask - The mask index, 0 to 7.
 * @returns {number} The format information.
 */
function formatInformation(mask) {
	const data = (ECC_FORMAT_BITS << 3) | mask
	let remainder = data
	for (let index = 0; index < 10; index += 1) {
		remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537)
	}
	return ((data << 10) | remainder) ^ 0x5412
}

/**
 * Compute the 18-bit version information of one version.
 *
 * @param {number} version - The version, 7 or above.
 * @returns {number} The version information.
 */
function versionInformation(version) {
	let remainder = version
	for (let index = 0; index < 12; index += 1) {
		remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25)
	}
	return (version << 12) | remainder
}

/**
 * The number of data codewords of one version.
 *
 * @param {number} version - The version, 1 to 10.
 * @returns {number} The data codeword count.
 */
function dataCodewordCount(version) {
	const [, , group1Blocks, group1Data, group2Blocks, group2Data] = VERSIONS[version - 1]
	return group1Blocks * group1Data + group2Blocks * group2Data
}

/**
 * Choose the smallest version that carries the payload.
 *
 * @param {number} length - Payload length in bytes.
 * @returns {number} The version.
 */
function chooseVersion(length) {
	for (let version = 1; version <= VERSIONS.length; version += 1) {
		const countBits = version <= 9 ? 8 : 16
		const capacity = dataCodewordCount(version)
		const needed = Math.ceil((4 + countBits + length * 8) / 8)
		if (needed <= capacity) return version
	}
	throw new Error(`二维码内容过长（${length} 字节），超出支持范围`)
}

/**
 * Build the interleaved codeword sequence of one version.
 *
 * @param {number[]} data - The data codewords.
 * @param {number} version - The version.
 * @returns {number[]} The final codeword sequence.
 */
function interleave(data, version) {
	const [total, ecPerBlock, group1Blocks, group1Data, group2Blocks, group2Data] = VERSIONS[version - 1]
	const blocks = []
	let offset = 0
	for (let index = 0; index < group1Blocks; index += 1) {
		blocks.push(data.slice(offset, offset + group1Data))
		offset += group1Data
	}
	for (let index = 0; index < group2Blocks; index += 1) {
		blocks.push(data.slice(offset, offset + group2Data))
		offset += group2Data
	}
	const eccBlocks = blocks.map((block) => errorCorrection(block, ecPerBlock))
	const result = []
	const longest = Math.max(...blocks.map((block) => block.length))
	for (let index = 0; index < longest; index += 1) {
		for (const block of blocks) {
			if (index < block.length) result.push(block[index])
		}
	}
	for (let index = 0; index < ecPerBlock; index += 1) {
		for (const block of eccBlocks) result.push(block[index])
	}
	if (result.length !== total) throw new Error('二维码分块结果与版本表不一致')
	return result
}

/**
 * Whether one module is inverted by one mask.
 *
 * @param {number} mask - The mask index.
 * @param {number} x - Column.
 * @param {number} y - Row.
 * @returns {boolean} Whether the module is inverted.
 */
function maskInverts(mask, x, y) {
	switch (mask) {
		case 0: return (x + y) % 2 === 0
		case 1: return y % 2 === 0
		case 2: return x % 3 === 0
		case 3: return (x + y) % 3 === 0
		case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
		case 5: return ((x * y) % 2) + ((x * y) % 3) === 0
		case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
		default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
	}
}

/**
 * The penalty score of one masked symbol.
 *
 * @param {boolean[][]} modules - The module matrix.
 * @returns {number} The score.
 */
function penalty(modules) {
	const size = modules.length
	let score = 0
	// Rule 1: runs of five or more modules of the same colour.
	for (const line of [...modules, ...modules[0].map((_, index) => modules.map((row) => row[index]))]) {
		let run = 1
		for (let index = 1; index < size; index += 1) {
			if (line[index] === line[index - 1]) {
				run += 1
			} else {
				if (run >= 5) score += 3 + (run - 5)
				run = 1
			}
		}
		if (run >= 5) score += 3 + (run - 5)
	}
	// Rule 2: two-by-two blocks of the same colour.
	for (let y = 0; y < size - 1; y += 1) {
		for (let x = 0; x < size - 1; x += 1) {
			const value = modules[y][x]
			if (value === modules[y][x + 1] && value === modules[y + 1][x] && value === modules[y + 1][x + 1]) {
				score += 3
			}
		}
	}
	// Rule 3: the 1:1:3:1:1 finder-like pattern with four light modules on one side.
	const pattern = [true, false, true, true, true, false, true]
	for (const line of [...modules, ...modules[0].map((_, index) => modules.map((row) => row[index]))]) {
		for (let index = 0; index + 7 <= size; index += 1) {
			if (!matchesPattern(line, index, pattern)) continue
			const lightBefore = index >= 4 && line.slice(index - 4, index).every((value) => !value)
			const lightAfter = index + 11 <= size && line.slice(index + 7, index + 11).every((value) => !value)
			if (lightBefore || lightAfter) score += 40
		}
	}
	// Rule 4: the balance of dark and light modules.
	let dark = 0
	for (const row of modules) for (const value of row) if (value) dark += 1
	const percent = (dark * 100) / (size * size)
	score += Math.abs(Math.ceil(percent / 5) - 10) * 10
	return score
}

/**
 * Whether one line carries a finder-like pattern at one offset.
 *
 * @param {boolean[]} line - The line.
 * @param {number} offset - The start offset.
 * @param {boolean[]} pattern - The pattern.
 * @returns {boolean} Whether the pattern is present.
 */
function matchesPattern(line, offset, pattern) {
	for (let index = 0; index < pattern.length; index += 1) {
		if (line[offset + index] !== pattern[index]) return false
	}
	return true
}

/**
 * Encode one text as a QR symbol.
 *
 * @param {string} text - The text to encode.
 * @param {{mask?: number}} [options] - `mask` pins one mask index instead of choosing by penalty.
 * @returns {{version: number, size: number, modules: boolean[][], rows: string[]}} The symbol.
 */
export function encodeQr(text, options = {}) {
	const bytes = [...Buffer.from(String(text), 'utf8')]
	const version = chooseVersion(bytes.length)
	const size = 17 + 4 * version
	const countBits = version <= 9 ? 8 : 16

	// Data codewords: mode, character count, payload, terminator and padding.
	const bits = []
	const pushBits = (value, length) => {
		for (let index = length - 1; index >= 0; index -= 1) bits.push((value >>> index) & 1)
	}
	pushBits(0b0100, 4)
	pushBits(bytes.length, countBits)
	for (const byte of bytes) pushBits(byte, 8)
	const capacityBits = dataCodewordCount(version) * 8
	pushBits(0, Math.min(4, capacityBits - bits.length))
	while (bits.length % 8 !== 0) bits.push(0)
	const codewords = []
	for (let index = 0; index < bits.length; index += 8) {
		let byte = 0
		for (let offset = 0; offset < 8; offset += 1) byte = (byte << 1) | bits[index + offset]
		codewords.push(byte)
	}
	const padding = [0xec, 0x11]
	for (let index = 0; codewords.length < dataCodewordCount(version); index += 1) {
		codewords.push(padding[index % 2])
	}

	const sequence = interleave(codewords, version)

	// Function patterns and the reserved module map.
	const modules = Array.from({ length: size }, () => new Array(size).fill(false))
	const reserved = Array.from({ length: size }, () => new Array(size).fill(false))
	const setFunction = (x, y, dark) => {
		if (x < 0 || y < 0 || x >= size || y >= size) return
		modules[y][x] = dark
		reserved[y][x] = true
	}
	for (let index = 0; index < size; index += 1) {
		setFunction(6, index, index % 2 === 0)
		setFunction(index, 6, index % 2 === 0)
	}
	for (const [x, y] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
		for (let dy = -4; dy <= 4; dy += 1) {
			for (let dx = -4; dx <= 4; dx += 1) {
				const distance = Math.max(Math.abs(dx), Math.abs(dy))
				setFunction(x + dx, y + dy, distance !== 2 && distance !== 4)
			}
		}
	}
	const alignment = ALIGNMENT_POSITIONS[version - 1]
	for (const y of alignment) {
		for (const x of alignment) {
			const isFinderCorner = (x === 6 && y === 6)
				|| (x === 6 && y === alignment[alignment.length - 1])
				|| (x === alignment[alignment.length - 1] && y === 6)
			if (isFinderCorner) continue
			for (let dy = -2; dy <= 2; dy += 1) {
				for (let dx = -2; dx <= 2; dx += 1) {
					setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
				}
			}
		}
	}
	if (version >= 7) {
		const bits18 = versionInformation(version)
		for (let index = 0; index < 18; index += 1) {
			const dark = bitOf(bits18, index)
			const a = size - 11 + (index % 3)
			const b = Math.floor(index / 3)
			setFunction(a, b, dark)
			setFunction(b, a, dark)
		}
	}

	// The format information area is a function area: reserve it before the
	// data walk so no payload module lands on it.
	drawFormat(modules, reserved, size, 0)

	// Data placement along the zigzag path. The vertical timing column is
	// skipped by moving the pair boundary left, so the pair after it starts
	// one column further left than the plain step would suggest.
	let bitIndex = 0
	for (let right = size - 1; right >= 1; right -= 2) {
		if (right === 6) right = 5
		for (let vertical = 0; vertical < size; vertical += 1) {
			for (let offset = 0; offset < 2; offset += 1) {
				const x = right - offset
				const upward = ((right + 1) & 2) === 0
				const y = upward ? size - 1 - vertical : vertical
				if (reserved[y][x] || bitIndex >= sequence.length * 8) continue
				modules[y][x] = ((sequence[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0
				bitIndex += 1
			}
		}
	}

	// Mask selection: the lowest penalty wins, the lowest mask index breaks ties.
	let best = null
	const masks = typeof options.mask === 'number' ? [options.mask] : [0, 1, 2, 3, 4, 5, 6, 7]
	for (const mask of masks) {
		const candidate = modules.map((row) => [...row])
		for (let y = 0; y < size; y += 1) {
			for (let x = 0; x < size; x += 1) {
				if (!reserved[y][x] && maskInverts(mask, x, y)) candidate[y][x] = !candidate[y][x]
			}
		}
		drawFormat(candidate, reserved, size, mask)
		const score = penalty(candidate)
		if (best === null || score < best.score) best = { score, mask, modules: candidate }
	}

	return {
		version,
		size,
		modules: best.modules,
		rows: best.modules.map((row) => row.map((value) => (value ? '1' : '0')).join('')),
	}
}

/**
 * Draw the format information of one mask into a candidate matrix.
 *
 * @param {boolean[][]} modules - The candidate matrix.
 * @param {boolean[][]} reserved - The reserved module map.
 * @param {number} size - The matrix size.
 * @param {number} mask - The mask index.
 * @returns {void}
 */
function drawFormat(modules, reserved, size, mask) {
	const bits = formatInformation(mask)
	const set = (x, y, dark) => {
		modules[y][x] = dark
		reserved[y][x] = true
	}
	for (let index = 0; index <= 5; index += 1) set(8, index, bitOf(bits, index))
	set(8, 7, bitOf(bits, 6))
	set(8, 8, bitOf(bits, 7))
	set(7, 8, bitOf(bits, 8))
	for (let index = 9; index < 15; index += 1) set(14 - index, 8, bitOf(bits, index))
	for (let index = 0; index < 8; index += 1) set(size - 1 - index, 8, bitOf(bits, index))
	for (let index = 8; index < 15; index += 1) set(8, size - 15 + index, bitOf(bits, index))
	set(8, size - 8, true)
}

/** The error correction level this encoder implements. */
export const ERROR_CORRECTION_LEVEL = ECC_M

/** The largest payload this encoder accepts, in bytes. */
export const MAX_PAYLOAD_BYTES = dataCodewordCount(VERSIONS.length) - 3
