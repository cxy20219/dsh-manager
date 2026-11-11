import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { encodeQr, ERROR_CORRECTION_LEVEL, MAX_PAYLOAD_BYTES } from '../src/qr.js'

const golden = JSON.parse(readFileSync(new URL('./fixtures/qr-golden.json', import.meta.url), 'utf8'))

test('reproduces the reference symbols byte for byte', () => {
	for (const sample of golden) {
		const result = encodeQr(sample.text)
		assert.equal(result.version, sample.version, `version of ${sample.text.slice(0, 24)}`)
		assert.equal(result.size, sample.size)
		assert.deepEqual(result.rows, sample.rows)
	}
})

test('places the finder patterns and the dark module', () => {
	const result = encodeQr('HELLO')
	const size = result.size
	const dark = (x, y) => result.modules[y][x] === true
	assert.equal(dark(0, 0), true)
	assert.equal(dark(1, 1), false)
	assert.equal(dark(2, 2), true)
	assert.equal(dark(size - 1, size - 1), true)
	assert.equal(dark(size - 8, size - 8), true, 'the dark module sits above the bottom-left format copy')
	assert.equal(dark(6, 8), true, 'the timing pattern alternates')
	assert.equal(dark(8, 6), true)
})

test('chooses the smallest version that carries the payload', () => {
	assert.equal(encodeQr('a').version, 1)
	assert.equal(encodeQr('a'.repeat(14)).version, 1)
	assert.equal(encodeQr('a'.repeat(15)).version, 2)
	assert.equal(encodeQr('a'.repeat(120)).version, 7)
})

test('refuses a payload beyond the supported versions', () => {
	assert.equal(MAX_PAYLOAD_BYTES, 213)
	assert.throws(() => encodeQr('a'.repeat(MAX_PAYLOAD_BYTES + 1)), /二维码内容过长/)
})

test('encodes with error correction level M', () => {
	assert.equal(ERROR_CORRECTION_LEVEL, 0)
})
