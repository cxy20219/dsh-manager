/**
 * The skill surface after the vendored kernel took over.
 *
 * The old `src/skills.js` scanner is retired, so these tests assert the two
 * things that now matter: the kernel is vendored and self-contained, and the
 * adapter that projects it onto the panel's legacy snapshot keeps its contract.
 *
 * The kernel owns its own state directory (`<DSH_HOME>/manager/skills`), so
 * every test points `DSH_HOME` at a throwaway directory first.
 */

import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'dsh-manager-kernel-'))
process.env.DSH_HOME = home
process.env.DSH_AGENTS_HOME = join(home, '.agents')

const kernel = await import('../skills/index.js')
const kernelCore = await import('../skills/core.js')
const adapter = await import('../src/skills-adapter.js')
const bridge = await import('../src/skills-kernel.js')
const repositoryGit = await import('../skills/repository-git.js')

const skillDoc = (name, description = `${name} description`) => `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nBody for ${name}.\n`

async function fixture() {
	const root = await mkdtemp(join(home, 'skills-'))
	await mkdir(join(root, 'one'), { recursive: true })
	await writeFile(join(root, 'one', 'SKILL.md'), skillDoc('one'))
	await mkdir(join(root, 'two'), { recursive: true })
	await writeFile(join(root, 'two', 'SKILL.md'), skillDoc('two', 'Second skill'))
	await mkdir(join(root, 'broken'), { recursive: true })
	await writeFile(join(root, 'broken', 'SKILL.md'), 'no frontmatter here')
	return root
}

test('the vendored kernel is a self-contained plugin module', () => {
	// It must load on its own: nothing from the skills-manager plugin, and no
	// import of that plugin's package or client.
	assert.equal(typeof kernel.apply, 'function')
	assert.deepEqual([...kernel.inject].sort(), ['connection', 'sessions', 'skills', 'tools'])
	assert.equal(typeof kernelCore.state, 'function')
	assert.ok(Object.keys(kernelCore).length > 40)
})

test('the kernel keeps its state inside this plugin data directory', () => {
	// Rebranded from upstream: <DSH_HOME>/skills-manager -> <DSH_HOME>/manager/skills
	assert.equal(kernelCore.logPath(), join(home, 'manager', 'skills', 'skills.log'))
	assert.equal(kernelCore.trashRootPath(), join(home, 'manager', 'skills', 'trash'))
})

test('the kernel carries this plugin API prefix and client header', async () => {
	const index = await readFile(new URL('../skills/index.js', import.meta.url), 'utf8')
	assert.match(index, /const API_PREFIX = "\/api\/manager"/)
	assert.match(index, /const CLIENT_MARKER_HEADER = "x-dsh-manager-client"/)
	assert.equal(bridge.KERNEL_EXTERNAL_PROVIDER, 'manager-external')
})

test('only the DSH and shared agent roots are enabled by default', async () => {
	// A fresh state must not expose the other agents' skill directories to this
	// agent; they are opt-in from the panel.
	const snapshot = await kernelCore.state({})
	const byKey = new Map(snapshot.roots.map((root) => [root.key, root]))
	assert.equal(byKey.get('dsh').enabled, true)
	assert.equal(byKey.get('agents').enabled, true)
	assert.equal(byKey.get('claude').enabled, false)
	assert.equal(byKey.get('codex').enabled, false)
})

test('the kernel has no runtime npm dependency', async () => {
	// `dsh plugin add` links the checkout with pnpm, which never installs the
	// linked package's dependencies. A bare import here would make the whole
	// plugin fail to load on a clean machine (this is why the ZIP reader is
	// project-owned instead of `fflate`).
	const directory = new URL('../skills/', import.meta.url)
	for (const name of (await readdir(directory)).filter((entry) => entry.endsWith('.js'))) {
		const source = await readFile(new URL(name, directory), 'utf8')
		for (const match of source.matchAll(/\bfrom\s+"([^"]+)"/g)) {
			const specifier = match[1]
			if (specifier.startsWith('node:') || specifier.startsWith('.')) continue
			assert.fail(`skills/${name} imports the runtime package "${specifier}"`)
		}
	}
})

test('projects kernel roots onto the legacy snapshot shape', async () => {
	const root = await fixture()
	try {
		await kernelCore.addCustomSources([{ path: root, label: 'Fixture' }])
		const snapshot = await adapter.legacySnapshot()
		assert.ok(Array.isArray(snapshot.categories))
		assert.ok(snapshot.categories.length > 0)
		assert.equal(typeof snapshot.totals.skills, 'number')
		const fixtureRoot = snapshot.categories.find((category) => category.skills.some((entry) => entry.name === 'one'))
		assert.ok(fixtureRoot, 'the custom source appears in the snapshot')
		const one = fixtureRoot.skills.find((entry) => entry.name === 'one')
		assert.equal(one.ok, true)
		assert.equal(one.folder, 'one')
		assert.equal(one.description, 'one description')
		assert.equal(one.invocation.modelInvocable, true)
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test('a skill without frontmatter is projected as not ok', async () => {
	const root = await fixture()
	try {
		await kernelCore.addCustomSources([{ path: root, label: 'Broken fixture' }])
		const snapshot = await adapter.legacySnapshot()
		const broken = snapshot.categories
			.flatMap((category) => category.skills)
			.find((entry) => entry.folder === 'broken')
		assert.ok(broken, 'the broken skill is still listed')
		assert.equal(broken.ok, false)
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test('toggling a skill through the adapter persists in the kernel state', async () => {
	// Toggling is only allowed on a root the kernel marks `toggleable`. Custom
	// sources (from addCustomSources) are deliberately read-only, so this uses
	// the plugin's own DSH skills root, pointed at a fixture through DSH_HOME.
	// The kernel's `dsh` root is `<DSH_HOME>/skills` (DSH_HOME already points at
	// the `.dsh` directory itself), and it is the one writable+toggleable root.
	const dshRoot = join(home, 'skills')
	await mkdir(join(dshRoot, 'toggler'), { recursive: true })
	await writeFile(join(dshRoot, 'toggler', 'SKILL.md'), skillDoc('toggler'))
	try {
		const before = await adapter.legacySnapshot()
		const owner = before.categories.find((category) => category.skills.some((entry) => entry.name === 'toggler'))
		assert.ok(owner, 'the fixture skill is discovered under the dsh root')
		assert.equal(owner.skills.find((entry) => entry.name === 'toggler').enabled, true)

		await adapter.legacyToggle({ category: owner.name, name: 'toggler', enabled: false })
		const after = await adapter.legacySnapshot()
		const toggled = after.categories
			.flatMap((category) => category.skills)
			.find((entry) => entry.name === 'toggler')
		assert.equal(toggled.enabled, false)
	} finally {
		await rm(dshRoot, { recursive: true, force: true })
	}
})

test('the bridge normalises every kernel route for the Host', () => {
	// `ConnectionFetchRoute.requestBody` is required by the Host and the
	// vendored kernel omits it, so a route passed through unchanged is rejected
	// and every kernel endpoint answers 404. The bridge has to fill it in.
	const registered = []
	const ctx = {
		logger: { warn() {}, info() {} },
		effect: (fn) => fn(),
		on: () => () => {},
		emit: () => {},
		get: (name) => {
			if (name === 'connection') return { fetch: { register: (route) => { registered.push(route); return () => {} } } }
			if (name === 'skills') return { registerProvider: () => () => {} }
			if (name === 'tools') return { register: () => () => {} }
			return undefined
		},
	}
	const result = bridge.createSkillsKernel(ctx, { logger: ctx.logger })
	assert.equal(result.mounted, true)
	assert.ok(registered.length > 0, 'the kernel registered its routes')
	assert.equal(result.routes, registered.length)
	assert.ok(
		registered.every((route) => route.path.startsWith('/api/manager/')),
		`every kernel route stays under /api/manager: ${registered.map((route) => route.path).join(', ')}`,
	)
	assert.ok(
		registered.every((route) => !route.path.includes('michengai')),
		'the upstream prefix is gone',
	)
	assert.ok(
		registered.every((route) => route.requestBody === 'buffered' || route.requestBody === 'streaming'),
		'every route declares the requestBody the Host requires',
	)
	assert.ok(
		registered.every((route) => Array.isArray(route.methods) && typeof route.fetch === 'function'),
		'every route carries methods and a fetch handler',
	)
})

test('a taken create_skill tool does not abort the mount', () => {
	// Real failure seen on a machine that also ran another skill plugin: the
	// Host throws on the duplicate tool name, and because the kernel's `apply`
	// is synchronous that throw aborted every route registration too. The
	// bridge has to swallow that one collision.
	const routes = []
	const warnings = []
	const ctx = {
		logger: { warn: (message) => warnings.push(message), info() {} },
		effect: (fn) => fn() ?? (() => {}),
		on: () => () => {},
		emit: () => {},
		get: (name) => {
			if (name === 'connection') return { fetch: { register: (route) => { routes.push(route); return () => {} } } }
			if (name === 'skills') return { registerProvider: () => () => {} }
			if (name === 'tools') {
				return {
					register: (definition) => {
						throw new Error(`tool "${definition.name}" is already registered`)
					},
				}
			}
			return undefined
		},
	}
	const result = bridge.createSkillsKernel(ctx, { logger: ctx.logger })
	assert.equal(result.mounted, true, 'the kernel still mounts')
	assert.ok(result.routes > 0, 'the routes are still registered')
	assert.equal(routes.length, result.routes)
	assert.ok(
		warnings.some((message) => message.includes('create_skill')),
		'the dropped tool is reported',
	)
	assert.ok(routes.every((route) => route.path.startsWith('/api/manager/')), 'routes keep the plugin prefix')
})

test.after(async () => {
	await rm(home, { recursive: true, force: true })
})

test('repository URLs cannot point at loopback or private networks', () => {
	// git would fetch these, which makes "add repository" a blind SSRF probe.
	for (const url of [
		'http://127.0.0.1/x.git',
		'http://10.0.0.5/x.git',
		'http://172.16.0.1/x.git',
		'http://192.168.1.2/x.git',
		'http://169.254.169.254/latest/meta-data',
		'http://localhost:8080/x.git',
		'http://[::1]/x.git',
	]) {
		assert.throws(() => repositoryGit.parseGitUrl({ url }), /内网|本机|不安全/, url)
	}
	assert.doesNotThrow(() => repositoryGit.parseGitUrl({ url: 'https://github.com/owner/repo' }))
	assert.doesNotThrow(() => repositoryGit.parseGitUrl({ url: 'https://example.com/owner/repo.git' }))
})

test('upload paths reject segments Windows would normalise', () => {
	// ".. " (dot-dot-space) is not "..", but Win32 trims the trailing space and
	// then resolves it as a traversal. Rejecting it keeps both platforms equal.
	assert.throws(() => kernelCore.normalizeUploadPath('.. /escape.md'), /路径非法/)
	assert.throws(() => kernelCore.normalizeUploadPath('dir./escape.md'), /路径非法/)
	assert.throws(() => kernelCore.normalizeUploadPath('name:stream/x.md'), /路径非法/)
	assert.equal(kernelCore.normalizeUploadPath('ok/skill.md').path, 'ok/skill.md')
	assert.equal(kernelCore.normalizeUploadPath('目录/skill.md').path, '目录/skill.md')
})
