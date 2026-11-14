/**
 * Integrity check for the vendored skill kernel.
 *
 * `skills/` holds a copy of `@michengai/dsh-skills-manager`'s Node half with a
 * handful of documented rebranding edits (see `skills/NOTICE`). Those edits are
 * the *only* differences that should ever exist. This script pins the current
 * SHA-256 of every vendored file so that:
 *
 *   - a hand-edit in `skills/` fails the check instead of silently drifting;
 *   - a future upstream bump can be diffed against exactly what ships today.
 *
 * Usage:
 *   node scripts/check-vendored.mjs           # verify
 *   node scripts/check-vendored.mjs --update  # re-pin after an intentional change
 *
 * Exit code is 1 on any mismatch.
 */

import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const vendoredDirectory = resolve(here, '..', 'skills')
const manifestPath = join(vendoredDirectory, '.vendored.json')

/** Files in `skills/` that are project-owned, not vendored from upstream. */
const PROJECT_OWNED = new Set(['NOTICE', '.vendored.json', 'zip.js'])

async function hashFile(path) {
	const contents = await readFile(path)
	return createHash('sha256').update(contents).digest('hex')
}

async function vendoredFiles() {
	const entries = await readdir(vendoredDirectory, { withFileTypes: true })
	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.filter((name) => !PROJECT_OWNED.has(name))
		.sort()
}

async function currentManifest() {
	const manifest = {}
	for (const name of await vendoredFiles()) manifest[name] = await hashFile(join(vendoredDirectory, name))
	return manifest
}

const update = process.argv.includes('--update')
const actual = await currentManifest()

if (update) {
	await writeFile(manifestPath, `${JSON.stringify(actual, null, 2)}\n`)
	console.log(`[check-vendored] pinned ${Object.keys(actual).length} files in skills/.vendored.json`)
	process.exit(0)
}

let expected
try {
	expected = JSON.parse(await readFile(manifestPath, 'utf8'))
} catch {
	console.error('[check-vendored] skills/.vendored.json is missing; run with --update to create it')
	process.exit(1)
}

const problems = []
for (const [name, hash] of Object.entries(expected)) {
	if (!(name in actual)) {
		problems.push(`missing: ${name}`)
		continue
	}
	if (actual[name] !== hash) problems.push(`changed: ${name}`)
}
for (const name of Object.keys(actual)) {
	if (!(name in expected)) problems.push(`unexpected: ${name}`)
}

if (problems.length > 0) {
	console.error('[check-vendored] the vendored kernel drifted from its pinned hashes:')
	for (const problem of problems) console.error(`  ${problem}`)
	console.error('\nAn intentional change belongs in skills/NOTICE as well; then re-run with --update.')
	process.exit(1)
}

console.log(`[check-vendored] ${Object.keys(actual).length} vendored files match their pinned hashes`)
