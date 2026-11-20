#!/usr/bin/env node
/**
 * Print the contract of a DSH browser slot.
 *
 * The client module runner ships a catalogue of every slot the browser side
 * offers: its kind, its scope, the options a registration must carry, who
 * declares it, who occupies it and a ready-to-copy example. That catalogue is
 * the answer to "how do I put something into that slot" — guessing from the
 * rendered DOM is how registrations end up silently wrong.
 *
 * Usage:
 *   node harness/tool/slot-contract.mjs conversation.chat.user.before
 *   node harness/tool/slot-contract.mjs --list chat
 *
 * The catalogue lives in the installed app (`app.asar`), so the script reads it
 * through the running Electron runtime, the same way the panel preview reads
 * the theme.
 */

import { execFileSync } from 'node:child_process'

const RUNTIME = process.env.DSH_NODE_EXECUTABLE ?? '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness'
const CATALOG = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-cordis-client-runner/lib/client.js'

/**
 * Read the catalogue text out of the installed app.
 *
 * @returns {string} The runner bundle.
 */
function readCatalog() {
	const script = `const fs=require('node:fs');process.stdout.write(fs.readFileSync(${JSON.stringify(CATALOG)},'utf8'));`
	return execFileSync(RUNTIME, ['-e', script], {
		env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
		maxBuffer: 64 * 1024 * 1024,
		stdio: ['ignore', 'pipe', 'ignore'],
	}).toString('utf8')
}

/**
 * The catalogue entries, in the order they appear in the bundle.
 *
 * @param {string} text - The catalogue text.
 * @returns {object[]} The entries: name, kind, scope and the raw body.
 */
function entries(text) {
	const found = []
	const pattern = /key:`([^`]+)`,kind:`([^`]*)`,scope:`([^`]*)`/g
	let match = pattern.exec(text)
	while (match !== null) {
		const start = match.index
		const next = text.indexOf('source:`', start)
		found.push({
			name: match[1],
			kind: match[2],
			scope: match[3],
			body: text.slice(start, next < 0 ? start + 2000 : next),
		})
		match = pattern.exec(text)
	}
	return found
}

/**
 * Pull one field out of an entry body.
 *
 * @param {string} body - The entry body.
 * @param {string} field - The field name.
 * @returns {string} The field text, empty when it is absent.
 */
function field(body, field) {
	const at = body.indexOf(field + ':`')
	if (at < 0) return ''
	const from = at + field.length + 2
	const end = body.indexOf('`', from)
	return body.slice(from, end < 0 ? from : end)
}

/**
 * Print the entries whose name matches a needle.
 *
 * @param {object[]} list - The catalogue entries.
 * @param {string} needle - The substring to look for.
 * @returns {void}
 */
function show(list, needle) {
	const hits = list.filter((entry) => entry.name.includes(needle))
	if (hits.length === 0) {
		console.log(`没有匹配「${needle}」的插槽。`)
		return
	}
	for (const entry of hits) {
		console.log(`\n=== ${entry.name}  [${entry.kind} / scope: ${entry.scope}]`)
		const summary = field(entry.body, 'summary')
		if (summary !== '') console.log(summary.replace(/\\n/g, '\n'))
		const options = entry.body.slice(entry.body.indexOf('registerOptions:['))
		if (options !== '' && options !== 'registerOptions:[]') {
			const end = options.indexOf('],ownerProps')
			console.log('\n注册选项：' + options.slice(0, end < 0 ? 400 : end).replace(/\},\{/g, '}\n  {'))
		}
		const declared = field(entry.body, 'declaredBy')
		if (declared !== '') console.log('\n声明者：' + declared)
		const example = field(entry.body, 'example')
		if (example !== '') console.log('\n官方示例：\n' + example.replace(/\\n/g, '\n').replace(/\\`/g, '`'))
	}
}

const args = process.argv.slice(2)
const list = entries(readCatalog())
if (args.length === 0 || args[0] === '--list') {
	const needle = args[1] ?? ''
	const names = list.filter((entry) => entry.name.includes(needle)).map((entry) => `${entry.name}  [${entry.kind}]`)
	console.log(names.length === 0 ? '没有匹配的插槽。' : names.join('\n'))
} else {
	show(list, args[0])
}
