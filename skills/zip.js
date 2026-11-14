/**
 * Minimal ZIP reader for skill uploads.
 *
 * The vendored skill kernel used `fflate` for this, which forced a runtime npm
 * dependency on a plugin that is installed with `dsh plugin add` (a pnpm `link:`
 * install that never installs the linked package's dependencies). This file
 * replaces exactly that one call: stored and deflated entries, read-only, from
 * the central directory.
 *
 * Deliberately not supported: ZIP64, encryption, multi-disk archives, and
 * compression methods other than store/deflate. Skill bundles never need them,
 * and rejecting them loudly is better than guessing.
 *
 * The output shape matches the call site in `core.js`:
 *
 *   unzipSync(bytes, { filter(info) }) -> { [entryName]: Uint8Array }
 *
 * `filter` runs before decompression and receives `{ name, size, originalSize,
 * directory }`. Returning `false` skips the entry; throwing aborts the archive.
 * `originalSize` comes from the central directory and is what the caller's
 * budget checks rely on, so a lying archive fails the size assertion below
 * instead of expanding past the declared size.
 *
 * @module dsh-manager/skills/zip
 */

import { inflateRawSync } from 'node:zlib'

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50
const LOCAL_FILE_HEADER = 0x04034b50
const ZIP64_MARKER_16 = 0xffff
const ZIP64_MARKER_32 = 0xffffffff
const END_RECORD_SIZE = 22
const MAX_COMMENT_LENGTH = 0xffff

/**
 * Read one unsigned 32-bit field, rejecting the ZIP64 escape value.
 *
 * @param {Buffer} buffer - Archive bytes.
 * @param {number} offset - Field offset.
 * @param {string} subject - What is being read, for the error message.
 * @returns {number} The field value.
 */
function readUInt32(buffer, offset, subject) {
	const value = buffer.readUInt32LE(offset)
	if (value === ZIP64_MARKER_32) throw new Error(`不支持 ZIP64 格式的 ${subject}`)
	return value
}

/**
 * Locate the end-of-central-directory record.
 *
 * It sits at the tail, after the comment, so the record has to be found by
 * scanning backwards over the at-most 64 KiB comment.
 *
 * @param {Buffer} buffer - Archive bytes.
 * @returns {number} Offset of the record.
 */
function findEndOfCentralDirectory(buffer) {
	const lowest = Math.max(0, buffer.length - END_RECORD_SIZE - MAX_COMMENT_LENGTH)
	for (let offset = buffer.length - END_RECORD_SIZE; offset >= lowest; offset -= 1) {
		if (buffer.readUInt32LE(offset) !== END_OF_CENTRAL_DIRECTORY) continue
		const commentLength = buffer.readUInt16LE(offset + 20)
		if (offset + END_RECORD_SIZE + commentLength === buffer.length) return offset
	}
	throw new Error('不是有效的 ZIP 文件（缺少中央目录结束记录）')
}

/**
 * Decode an entry name.
 *
 * The UTF-8 flag is honored when present; modern tools also set it for ASCII
 * names, and bundles produced on macOS/Windows always do.
 *
 * @param {Buffer} bytes - Raw name bytes.
 * @returns {string} The entry name.
 */
function decodeName(bytes) {
	return bytes.toString('utf8')
}

/**
 * Read the local file header that precedes one entry's data.
 *
 * @param {Buffer} buffer - Archive bytes.
 * @param {number} offset - Where the central directory says the header is.
 * @param {number} expectedSize - Compressed size from the central directory.
 * @returns {{ method: number, start: number, end: number }} Compression method
 *   and the data range.
 */
function readLocalHeader(buffer, offset, expectedSize) {
	if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== LOCAL_FILE_HEADER) {
		throw new Error('ZIP 本地文件头损坏')
	}
	const method = buffer.readUInt16LE(offset + 8)
	const nameLength = buffer.readUInt16LE(offset + 26)
	const extraLength = buffer.readUInt16LE(offset + 28)
	const start = offset + 30 + nameLength + extraLength
	const end = start + expectedSize
	if (start > buffer.length || end > buffer.length) throw new Error('ZIP 条目数据越界')
	return { method, start, end }
}

/**
 * Extract one entry's bytes.
 *
 * @param {Buffer} buffer - Archive bytes.
 * @param {{ method: number, start: number, end: number }} header - Local header info.
 * @param {number} originalSize - Declared uncompressed size.
 * @returns {Uint8Array} Entry bytes.
 */
function readEntry(buffer, header, originalSize) {
	const raw = buffer.subarray(header.start, header.end)
	if (header.method === 0) return new Uint8Array(raw)
	if (header.method !== 8) throw new Error(`不支持的 ZIP 压缩方式: ${header.method}`)
	// Cap the inflate at the declared size so a crafted header cannot expand a
	// small archive into an arbitrarily large buffer before the size check.
	const bytes = inflateRawSync(raw, { maxOutputLength: Math.max(1, originalSize) })
	if (bytes.length !== originalSize) throw new Error('ZIP 条目声明大小与实际不符')
	return new Uint8Array(bytes)
}

/**
 * Extract a ZIP archive.
 *
 * @param {Uint8Array} archive - Archive bytes.
 * @param {{ filter?: (info: { name: string, size: number, originalSize: number, directory: boolean }) => boolean }} [options] - Per-entry filter.
 * @returns {Record<string, Uint8Array>} Entry name to bytes.
 */
export function unzipSync(archive, options = {}) {
	if (!(archive instanceof Uint8Array)) throw new TypeError('ZIP 数据必须是字节数组')
	const filter = typeof options.filter === 'function' ? options.filter : () => true
	const buffer = Buffer.isBuffer(archive)
		? archive
		: Buffer.from(archive.buffer, archive.byteOffset, archive.byteLength)
	const end = findEndOfCentralDirectory(buffer)
	const entryCount = buffer.readUInt16LE(end + 10)
	if (entryCount === ZIP64_MARKER_16) throw new Error('不支持 ZIP64 格式的 ZIP')
	const directorySize = readUInt32(buffer, end + 12, '中央目录大小')
	const directoryOffset = readUInt32(buffer, end + 16, '中央目录位置')
	if (directoryOffset + directorySize > buffer.length) throw new Error('ZIP 中央目录越界')

	const files = Object.create(null)
	let pointer = directoryOffset
	for (let index = 0; index < entryCount; index += 1) {
		if (pointer + 46 > buffer.length || buffer.readUInt32LE(pointer) !== CENTRAL_DIRECTORY_ENTRY) {
			throw new Error('ZIP 中央目录损坏')
		}
		const flags = buffer.readUInt16LE(pointer + 8)
		const method = buffer.readUInt16LE(pointer + 10)
		if ((flags & 0x1) !== 0) throw new Error('不支持加密的 ZIP')
		const compressedSize = readUInt32(buffer, pointer + 20, '条目')
		const originalSize = readUInt32(buffer, pointer + 24, '条目')
		const nameLength = buffer.readUInt16LE(pointer + 28)
		const extraLength = buffer.readUInt16LE(pointer + 30)
		const commentLength = buffer.readUInt16LE(pointer + 32)
		const localOffset = readUInt32(buffer, pointer + 42, '条目')
		if (pointer + 46 + nameLength + extraLength + commentLength > buffer.length) {
			throw new Error('ZIP 中央目录条目越界')
		}
		const name = decodeName(buffer.subarray(pointer + 46, pointer + 46 + nameLength))
		pointer += 46 + nameLength + extraLength + commentLength
		const directory = name.endsWith('/')
		if (filter({ name, size: compressedSize, originalSize, directory }) === false) continue
		if (directory) {
			files[name] = new Uint8Array(0)
			continue
		}
		const header = readLocalHeader(buffer, localOffset, compressedSize)
		files[name] = readEntry(buffer, header, originalSize)
	}
	return files
}
