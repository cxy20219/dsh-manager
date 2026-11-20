/**
 * Integrity check for the vendored code.
 *
 * `skills/` holds a copy of `@michengai/dsh-skills-manager`'s Node half with a
 * handful of documented rebranding edits (see `skills/NOTICE`). `rewind/`
 * holds the conversation-rewind feature of `dsh-rewind-plugin`; its client
 * half is a browser bundle and therefore lives inline in `client.js`, between
 * the `rewind-client:start` and `rewind-client:end` markers. Those edits are
 * the *only* differences that should ever exist. This script pins the current
 * SHA-256 of every vendored file and of that inline region so that:
 *
 *   - a hand-edit in `skills/`, `rewind/` or `client.js` fails the check
 *     instead of silently drifting;
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
const root = resolve(here, '..')

/** The vendored directories, each with its own manifest. */
const VENDORED = [
	{ directory: join(root, 'skills'), manifest: '.vendored.json', projectOwned: new Set(['NOTICE', '.vendored.json', 'zip.js']) },
	{ directory: join(root, 'rewind'), manifest: '.vendored.json', projectOwned: new Set(['NOTICE', '.vendored.json', 'LICENSE']) },
]

/** The vendored browser bundle that lives inline in `client.js`. */
const CLIENT_REGION = { file: join(root, 'client.js'), start: '/* rewind-client:start', end: '/* rewind-client:end */' }

async function hashFile(path) {
	const contents = await readFile(path)
	return createHash('sha256').update(contents).digest('hex')
}

async function hashRegion() {
	const source = await readFile(CLIENT_REGION.file, 'utf8')
	const start = source.indexOf(CLIENT_REGION.start)
	const end = source.indexOf(CLIENT_REGION.end)
	if (start < 0 || end < 0) throw new Error('client.js has no vendored rewind region')
	const region = source.slice(start, end + CLIENT_REGION.end.length)
	// The vendored bundle is upstream's factory body. Its last line — the one
	// that hands the exports back — is easy to lose when the body is cut out,
	// and the failure is silent: the factory then returns undefined.
	if (!region.includes('return module.exports;')) {
		throw new Error('client.js: the vendored rewind factory does not return its exports')
	}
	return createHash('sha256').update(region).digest('hex')
}

async function vendoredFiles(entry) {
	const items = await readdir(entry.directory, { withFileTypes: true })
	return items
		.filter((item) => item.isFile())
		.map((item) => item.name)
		.filter((name) => !entry.projectOwned.has(name))
		.sort()
}

async function currentManifest(entry) {
	const manifest = {}
	for (const name of await vendoredFiles(entry)) manifest[name] = await hashFile(join(entry.directory, name))
	return manifest
}

const update = process.argv.includes('--update')
const problems = []
let pinned = 0

for (const entry of VENDORED) {
	const manifestPath = join(entry.directory, entry.manifest)
	const actual = await currentManifest(entry)
	if (update) {
		await writeFile(manifestPath, `${JSON.stringify(actual, null, 2)}\n`)
		console.log(`[check-vendored] pinned ${Object.keys(actual).length} files in ${entry.directory}/`)
		pinned += Object.keys(actual).length
		continue
	}
	let expected
	try {
		expected = JSON.parse(await readFile(manifestPath, 'utf8'))
	} catch {
		console.error(`[check-vendored] ${manifestPath} is missing; run with --update to create it`)
		process.exit(1)
	}
	for (const [name, hash] of Object.entries(expected)) {
		if (name.startsWith('#')) continue;
		if (!(name in actual)) {
			problems.push(`missing: ${entry.directory}/${name}`)
			continue
		}
		if (actual[name] !== hash) problems.push(`changed: ${entry.directory}/${name}`)
	}
	for (const name of Object.keys(actual)) {
		if (name.startsWith('#')) continue;
		if (!(name in expected)) problems.push(`unexpected: ${entry.directory}/${name}`)
	}
	pinned += Object.keys(actual).length
}

// The inline region is pinned next to the rewind manifest, so the browser
// bundle in `client.js` cannot drift away from `rewind/`.
const regionPath = join(root, 'rewind', '.vendored.json')
if (update) {
	const manifest = JSON.parse(await readFile(regionPath, 'utf8'))
	manifest['#client.js#region'] = await hashRegion()
	await writeFile(regionPath, `${JSON.stringify(manifest, null, 2)}\n`)
	console.log('[check-vendored] pinned the vendored client region in client.js')
	process.exit(0)
}

{
	const manifest = JSON.parse(await readFile(regionPath, 'utf8'))
	try {
		const actual = await hashRegion()
		if (manifest['#client.js#region'] !== actual) problems.push('changed: client.js (the vendored rewind region)')
	} catch (error) {
		problems.push(`broken: client.js (${error instanceof Error ? error.message : String(error)})`)
	}
}

if (update) process.exit(0)

if (problems.length > 0) {
	console.error('[check-vendored] the vendored code drifted from its pinned hashes:')
	for (const problem of problems) console.error(`  ${problem}`)
	console.error('\nAn intentional change belongs in the matching NOTICE as well; then re-run with --update.')
	process.exit(1)
}

console.log(`[check-vendored] ${pinned} vendored files match their pinned hashes`)
