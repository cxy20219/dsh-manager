/**
 * ZIP reader tests.
 *
 * The reader replaced the `fflate` runtime dependency, so it has to cover the
 * shapes a skill bundle actually uses (stored and deflated files, directory
 * entries) and reject the shapes the upload path relies on it to reject
 * (bad sizes, truncated archives, encrypted/unsupported methods).
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { deflateRawSync } from 'node:zlib'

import { unzipSync } from '../skills/zip.js'

/**
 * Build a minimal ZIP archive.
 *
 * Deliberately writes zero CRC and timestamps: the reader does not verify CRC,
 * and a hand-built archive keeps the tests independent of any zip tool.
 *
 * @param {Array<{ name: string, data?: string, method?: number, originalSize?: number }>} entries - Entries to encode.
 * @returns {Buffer} The archive.
 */
function makeZip(entries) {
	const chunks = []
	const central = []
	let offset = 0
	for (const entry of entries) {
		const raw = Buffer.from(entry.data ?? '', 'utf8')
		const method = entry.method ?? 0
		const body = method === 8 ? deflateRawSync(raw) : raw
		const name = Buffer.from(entry.name, 'utf8')
		const local = Buffer.alloc(30)
		local.writeUInt32LE(0x04034b50, 0)
		local.writeUInt16LE(20, 4)
		local.writeUInt16LE(0x800, 6) // UTF-8 name
		local.writeUInt16LE(method, 8)
		local.writeUInt32LE(0, 10) // mod time + date
		local.writeUInt32LE(0, 14) // CRC (not verified by the reader)
		local.writeUInt32LE(body.length, 18)
		local.writeUInt32LE(entry.originalSize ?? raw.length, 22)
		local.writeUInt16LE(name.length, 26)
		local.writeUInt16LE(0, 28)
		const record = Buffer.concat([local, name, body])
		const header = Buffer.alloc(46)
		header.writeUInt32LE(0x02014b50, 0)
		header.writeUInt16LE(20, 4)
		header.writeUInt16LE(20, 6)
		header.writeUInt16LE(0x800, 8)
		header.writeUInt16LE(method, 10)
		header.writeUInt32LE(0, 12) // mod time + date
		header.writeUInt32LE(0, 16) // CRC
		header.writeUInt32LE(body.length, 20)
		header.writeUInt32LE(entry.originalSize ?? raw.length, 24)
		header.writeUInt16LE(name.length, 28)
		header.writeUInt32LE(0, 30) // extra + comment lengths
		header.writeUInt32LE(0, 34) // disk + internal attributes
		header.writeUInt32LE(0, 38) // external attributes
		header.writeUInt32LE(offset, 42)
		chunks.push(record)
		central.push(Buffer.concat([header, name]))
		offset += record.length
	}
	const directory = Buffer.concat(central)
	const end = Buffer.alloc(22)
	end.writeUInt32LE(0x06054b50, 0)
	end.writeUInt16LE(central.length, 8)
	end.writeUInt16LE(central.length, 10)
	end.writeUInt32LE(directory.length, 12)
	end.writeUInt32LE(offset, 16)
	return Buffer.concat([...chunks, directory, end])
}

test('stored and deflated entries are extracted', () => {
	const archive = makeZip([
		{ name: 'alpha/SKILL.md', data: '# Alpha\n', method: 0 },
		{ name: 'beta/SKILL.md', data: '---\nname: beta\n---\nbody\n', method: 8 },
	])
	const files = unzipSync(archive)
	assert.deepEqual(Object.keys(files).sort(), ['alpha/SKILL.md', 'beta/SKILL.md'])
	assert.equal(Buffer.from(files['alpha/SKILL.md']).toString('utf8'), '# Alpha\n')
	assert.equal(Buffer.from(files['beta/SKILL.md']).toString('utf8'), '---\nname: beta\n---\nbody\n')
})

test('directory entries are reported to the filter and can be skipped', () => {
	const seen = []
	const archive = makeZip([
		{ name: 'alpha/', data: '' },
		{ name: 'alpha/SKILL.md', data: '# Alpha\n' },
	])
	const files = unzipSync(archive, {
		filter(info) {
			seen.push(info)
			return info.directory === false
		},
	})
	assert.deepEqual(seen.map((info) => [info.name, info.directory]), [['alpha/', true], ['alpha/SKILL.md', false]])
	assert.deepEqual(Object.keys(files), ['alpha/SKILL.md'])
})

test('a throwing filter aborts the whole archive', () => {
	const archive = makeZip([{ name: '../escape.md', data: 'x' }])
	assert.throws(
		() => unzipSync(archive, {
			filter() {
				throw new Error('路径非法')
			},
		}),
		/路径非法/,
	)
})

test('a declared size smaller than the payload fails instead of expanding', () => {
	const archive = makeZip([{ name: 'big.md', data: 'x'.repeat(4096), method: 8, originalSize: 8 }])
	// The inflate is capped at the declared size, so zlib refuses to grow the
	// buffer past it. Either error is a rejection; the point is that no 4 KiB
	// entry is produced from an 8-byte claim.
	assert.throws(() => unzipSync(archive), /ERR_BUFFER_TOO_LARGE|声明大小/)
})

test('truncated archives are rejected', () => {
	const archive = makeZip([{ name: 'a.md', data: 'x' }])
	assert.throws(() => unzipSync(archive.subarray(0, archive.length - 8)), /ZIP/)
})

test('non-archive bytes are rejected', () => {
	assert.throws(() => unzipSync(Buffer.from('not a zip file')), /ZIP/)
	assert.throws(() => unzipSync('not bytes'), TypeError)
})

test('an empty archive yields no entries', () => {
	assert.deepEqual(Object.keys(unzipSync(makeZip([]))), [])
})
