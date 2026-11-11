/**
 * Hierarchical skill categories.
 *
 * DSH's filesystem provider discovers `<root>/<name>/SKILL.md` one level deep.
 * The manager adds the layer users actually keep: `<root>/<category>/<skill>/SKILL.md`.
 * It registers a provider on `ctx.skills` that lists summaries for enabled
 * categories only, so a category switch is a real load switch: disabled skills
 * never enter the catalog, and a loaded body is still read on demand.
 *
 * @module dsh-manager/skills
 */

import { watch as watchFileSystem } from 'node:fs'
import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'

import { isSkillName, parseSkillDocument } from './frontmatter.js'

/** Provider name registered on `ctx.skills`. */
export const PROVIDER_NAME = 'manager'

/**
 * Candidate rank inside the global layer.
 *
 * Higher numbers lose against lower ones, so the manager stays below the
 * filesystem provider's user roots (500): a top-level override keeps winning.
 */
export const SKILL_RANK = 550

/** How long to wait for filesystem events before invalidating the catalog. */
const WATCH_DEBOUNCE_MS = 250

/**
 * How long one scan is reused.
 *
 * The panel reads the overview after every toggle, and the registry calls
 * `list()` once per request; all of those want the same tree. A watcher event,
 * a switch, or an explicit rescan clears the cache immediately, so the TTL only
 * covers repeated reads of an unchanged tree.
 */
const SCAN_TTL_MS = 1000

/** Category names may contain letters, numbers, dots, dashes and underscores. */
const CATEGORY_NAME = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u

/**
 * Build the layered skill catalog manager.
 *
 * @param {{ctx: object, settings: object, ready: Promise<void>, logger: object, defaultRoot: string}} options - Dependencies.
 * @returns {object} The manager.
 */
export function createSkillsManager({ ctx, settings, ready, logger, defaultRoot }) {
	const watchers = new Map()
	let control
	let disposed = false
	let watchTimer
	/** Last completed scan, reused until it expires or something invalidates it. */
	let scanCache

	/**
	 * Expand `~` and keep only absolute roots.
	 *
	 * @returns {string[]} The roots to scan.
	 */
	function roots() {
		const stored = settings.get().skills.roots
		const list = stored.length > 0 ? stored : [defaultRoot]
		const seen = new Set()
		for (const entry of list) {
			const expanded = expandHome(entry)
			if (!isAbsolute(expanded)) {
				logger?.warn?.(`dsh-manager: 技能根目录必须是绝对路径，已跳过 ${entry}`)
				continue
			}
			seen.add(resolve(expanded))
		}
		return [...seen]
	}

	/**
	 * Whether a category is switched off.
	 *
	 * @param {string} category - Category directory name.
	 * @returns {boolean} True when disabled.
	 */
	function isCategoryDisabled(category) {
		return settings.get().skills.disabledCategories.includes(category)
	}

	/**
	 * Whether one skill is switched off on its own.
	 *
	 * @param {string} category - Category directory name.
	 * @param {string} name - Skill name.
	 * @returns {boolean} True when disabled.
	 */
	function isSkillDisabled(category, name) {
		return settings.get().skills.disabledSkills.includes(`${category}/${name}`)
	}

	/**
	 * Scan every root into categories of parsed skills, reusing a fresh result.
	 *
	 * @returns {Promise<object>} The scan result.
	 */
	async function scan() {
		await ready
		if (scanCache !== undefined && Date.now() - scanCache.at < SCAN_TTL_MS) return scanCache.value
		const value = await scanFresh()
		scanCache = { at: Date.now(), value }
		return value
	}

	/**
	 * Read every root from disk.
	 *
	 * @returns {Promise<object>} The scan result.
	 */
	async function scanFresh() {
		const rootReports = []
		const categories = []
		for (const root of roots()) {
			const report = { path: root, exists: false, error: '' }
			rootReports.push(report)
			try {
				const info = await stat(root)
				if (!info.isDirectory()) throw new Error('不是目录')
				report.exists = true
			} catch (error) {
				if (error?.code !== 'ENOENT') report.error = errorMessage(error)
				continue
			}
			ensureWatch(root)
			let entries
			try {
				entries = await readdir(root, { withFileTypes: true })
			} catch (error) {
				report.error = errorMessage(error)
				continue
			}
			for (const entry of entries) {
				if (entry.name.startsWith('.')) continue
				const categoryPath = join(root, entry.name)
				if ((await entryKind(categoryPath, entry)) !== 'directory') continue
				// A directory with its own SKILL.md is a top-level skill; the
				// filesystem provider already owns those.
				if (await pathExists(join(categoryPath, 'SKILL.md'))) continue
				const category = {
					name: entry.name,
					path: categoryPath,
					disabled: isCategoryDisabled(entry.name),
					skills: [],
				}
				let children
				try {
					children = await readdir(categoryPath, { withFileTypes: true })
				} catch (error) {
					category.error = errorMessage(error)
					categories.push(category)
					continue
				}
				for (const child of children) {
					if (child.name.startsWith('.')) continue
					const target = await skillTarget(join(categoryPath, child.name), child)
					if (target === undefined) continue
					category.skills.push(await readSkill({
						file: target.file,
						directory: target.directory,
						category: entry.name,
						folder: child.name,
					}))
				}
				category.skills.sort((left, right) => left.folder.localeCompare(right.folder))
				if (category.skills.length === 0 && category.error === undefined) continue
				categories.push(category)
			}
		}
		categories.sort((left, right) => left.name.localeCompare(right.name))
		const conflicts = markConflicts(categories)
		return { roots: rootReports, categories, conflicts }
	}

	/**
	 * Mark later same-name skills so only one is offered to the registry.
	 *
	 * @param {object[]} categories - Scanned categories.
	 * @returns {object[]} The conflicts.
	 */
	function markConflicts(categories) {
		const owners = new Map()
		const conflicts = []
		for (const category of categories) {
			for (const skill of category.skills) {
				if (!skill.ok) continue
				const owner = `${category.name}/${skill.folder}`
				const first = owners.get(skill.name)
				if (first === undefined) {
					owners.set(skill.name, owner)
					continue
				}
				skill.conflict = true
				skill.conflictWith = first
				const existing = conflicts.find((entry) => entry.name === skill.name)
				if (existing === undefined) {
					conflicts.push({ name: skill.name, sources: [first, owner] })
				} else {
					existing.sources.push(owner)
				}
			}
		}
		return conflicts
	}

	/**
	 * Read and parse one skill file.
	 *
	 * @param {{file: string, directory: string, category: string, folder: string}} target - The candidate.
	 * @returns {Promise<object>} A scan record.
	 */
	async function readSkill({ file, directory, category, folder }) {
		const record = { folder, category, file, path: file, directory, ok: false, error: '' }
		try {
			const [raw, real] = await Promise.all([
				readFile(file, 'utf8'),
				realpath(file).catch(() => file),
			])
			record.path = real
			record.directory = dirname(real)
			const parsed = parseSkillDocument(raw)
			if (!parsed.ok) {
				record.error = parsed.error
				return record
			}
			return {
				...record,
				ok: true,
				name: parsed.name,
				description: parsed.description,
				...(parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse }),
				invocation: parsed.invocation,
			}
		} catch (error) {
			record.error = errorMessage(error)
			return record
		}
	}

	/**
	 * List catalog summaries for the registry.
	 *
	 * @param {{cwd?: string, signal?: AbortSignal}} options - Lookup options.
	 * @returns {Promise<object[]>} One candidate per enabled skill.
	 */
	async function list(options = {}) {
		options.signal?.throwIfAborted()
		const scanned = await scan()
		const candidates = []
		for (const category of scanned.categories) {
			if (category.disabled) continue
			for (const skill of category.skills) {
				if (!skill.ok || skill.conflict === true) continue
				if (isSkillDisabled(category.name, skill.name)) continue
				options.signal?.throwIfAborted()
				candidates.push({
					name: skill.name,
					description: skill.description,
					...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
					invocation: skill.invocation,
					source: 'custom',
					provider: PROVIDER_NAME,
					rank: SKILL_RANK,
					path: skill.path,
					resourceBase: { kind: 'directory', path: skill.directory },
					locator: { file: skill.path, category: category.name, directory: skill.directory },
				})
			}
		}
		return candidates
	}

	/**
	 * Load one skill body on demand.
	 *
	 * @param {object} candidate - A candidate this provider listed.
	 * @param {{signal?: AbortSignal}} options - Lookup options.
	 * @returns {Promise<object | undefined>} The full definition.
	 */
	async function get(candidate, options = {}) {
		const locator = candidate?.locator
		if (locator === null || typeof locator !== 'object' || typeof locator.file !== 'string') return undefined
		options.signal?.throwIfAborted()
		const raw = await readFile(locator.file, 'utf8').catch(() => undefined)
		if (raw === undefined) return undefined
		options.signal?.throwIfAborted()
		const parsed = parseSkillDocument(raw)
		if (!parsed.ok) return undefined
		if (isCategoryDisabled(locator.category)) return undefined
		if (isSkillDisabled(locator.category, parsed.name)) return undefined
		return {
			name: parsed.name,
			description: parsed.description,
			...(parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse }),
			invocation: parsed.invocation,
			source: 'custom',
			provider: PROVIDER_NAME,
			path: candidate.path,
			resourceBase: { kind: 'directory', path: locator.directory },
			content: parsed.body,
		}
	}

	/**
	 * Build the registry provider.
	 *
	 * @param {{invalidate: () => void, signal: AbortSignal}} providerControl - Registry control for this registration.
	 * @returns {{name: string, list: Function, get: Function}} The provider.
	 */
	function provider(providerControl) {
		control = providerControl
		providerControl.signal.addEventListener('abort', () => {
			if (control === providerControl) control = undefined
		}, { once: true })
		return { name: PROVIDER_NAME, list, get }
	}

	/**
	 * Ask the registry to rebuild its catalog on the next lookup.
	 *
	 * @returns {void}
	 */
	function invalidate() {
		scanCache = undefined
		control?.invalidate()
	}

	/**
	 * Observe an existing root, ignoring platforms without recursive watch.
	 *
	 * @param {string} root - Root path.
	 * @returns {void}
	 */
	function ensureWatch(root) {
		if (disposed || watchers.has(root)) return
		try {
			const watcher = watchFileSystem(root, { recursive: true }, () => {
				if (disposed) return
				clearTimeout(watchTimer)
				watchTimer = setTimeout(() => invalidate(), WATCH_DEBOUNCE_MS)
				watchTimer.unref?.()
			})
			watcher.on('error', () => {
				watcher.close()
				watchers.delete(root)
			})
			// A watcher must never keep a short-lived process alive; the Host's
			// own lifetime keeps the plugin mounted.
			watcher.unref?.()
			watchers.set(root, watcher)
		} catch {
			// Recursive watching is unavailable here; the scan still refreshes on
			// the panel's explicit request.
		}
	}

	/**
	 * Drop the cached scan so the next read sees the tree as it is now.
	 *
	 * @returns {void}
	 */
	function refresh() {
		invalidate()
	}

	/**
	 * Project the scan for the panel.
	 *
	 * @returns {Promise<object>} The panel-facing snapshot.
	 */
	async function snapshot() {
		await ready
		const scanned = await scan()
		let total = 0
		let enabled = 0
		let broken = 0
		const categories = scanned.categories.map((category) => ({
			name: category.name,
			path: category.path,
			disabled: category.disabled,
			error: category.error,
			skills: category.skills.map((skill) => {
				total += 1
				if (!skill.ok) broken += 1
				const disabled = skill.ok ? isSkillDisabled(category.name, skill.name) : false
				const active = skill.ok && !skill.conflict && !category.disabled && !disabled
				if (active) enabled += 1
				return {
					folder: skill.folder,
					name: skill.ok ? skill.name : folderName(skill.folder),
					description: skill.ok ? skill.description : '',
					whenToUse: skill.ok ? skill.whenToUse : undefined,
					path: skill.path,
					ok: skill.ok,
					error: skill.error,
					invocation: skill.invocation,
					disabled,
					enabled: active,
					conflict: skill.conflict === true,
					conflictWith: skill.conflictWith,
				}
			}),
		}))
		return {
			roots: scanned.roots,
			categories,
			conflicts: scanned.conflicts,
			totals: { categories: categories.length, skills: total, enabled, broken },
			provider: PROVIDER_NAME,
			rank: SKILL_RANK,
		}
	}

	/**
	 * Enable or disable one whole category.
	 *
	 * @param {string} category - Category directory name.
	 * @param {boolean} enabled - Whether its skills should load.
	 * @returns {Promise<void>} Resolves after persisting.
	 */
	async function setCategoryEnabled(category, enabled) {
		if (typeof category !== 'string' || category === '') throw new Error('缺少分类名')
		await settings.update((draft) => {
			toggle(draft.skills.disabledCategories, category, !enabled)
			return draft
		})
		invalidate()
	}

	/**
	 * Enable or disable one skill inside its category.
	 *
	 * @param {string} category - Category directory name.
	 * @param {string} name - Skill name.
	 * @param {boolean} enabled - Whether it should load.
	 * @returns {Promise<void>} Resolves after persisting.
	 */
	async function setSkillEnabled(category, name, enabled) {
		if (typeof category !== 'string' || category === '' || typeof name !== 'string' || name === '') {
			throw new Error('缺少分类或技能名')
		}
		await settings.update((draft) => {
			toggle(draft.skills.disabledSkills, `${category}/${name}`, !enabled)
			return draft
		})
		invalidate()
	}

	/**
	 * Read one skill file for the preview.
	 *
	 * @param {{category: string, name: string}} request - Category and skill name.
	 * @returns {Promise<object>} The skill contents.
	 */
	async function read(request) {
		const snapshotValue = await snapshot()
		const category = snapshotValue.categories.find((entry) => entry.name === request?.category)
		if (category === undefined) throw new Error(`分类不存在：${request?.category ?? ''}`)
		const skill = category.skills.find((entry) => entry.name === request?.name || entry.folder === request?.name)
		if (skill === undefined) throw new Error(`技能不存在：${request?.category}/${request?.name}`)
		const raw = await readFile(skill.path, 'utf8')
		const parsed = parseSkillDocument(raw)
		if (!parsed.ok) throw new Error(parsed.error)
		return {
			name: parsed.name,
			category: category.name,
			path: skill.path,
			description: parsed.description,
			whenToUse: parsed.whenToUse,
			invocation: parsed.invocation,
			content: parsed.body,
		}
	}

	/**
	 * Create one skill directory with a frontmatter skeleton.
	 *
	 * @param {{category: string, name: string, description: string}} request - The new skill.
	 * @returns {Promise<object>} The created skill's location.
	 */
	async function create(request) {
		const category = typeof request?.category === 'string' ? request.category.trim() : ''
		const name = typeof request?.name === 'string' ? request.name.trim() : ''
		const description = typeof request?.description === 'string' ? request.description.trim() : ''
		if (!CATEGORY_NAME.test(category)) throw new Error('分类名只能包含字母、数字、点、横线和下划线')
		if (!isSkillName(name)) throw new Error('技能名必须是 kebab-case，例如 webapp-testing')
		if (description === '') throw new Error('请填写描述，它会进入 Agent 的技能目录')
		if (description.length > 2000) throw new Error('描述不要超过 2000 字')
		const root = roots()[0]
		if (root === undefined) throw new Error('没有可用的技能根目录')
		const categoryPath = join(root, category)
		const skillPath = join(categoryPath, name)
		if (!resolve(skillPath).startsWith(`${resolve(root)}${sep}`)) throw new Error('路径越界')
		const file = join(skillPath, 'SKILL.md')
		await mkdir(skillPath, { recursive: true, mode: 0o755 })
		const body = `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n\n${description}\n`
		try {
			await writeFile(file, body, { encoding: 'utf8', flag: 'wx', mode: 0o644 })
		} catch (error) {
			if (error?.code === 'EEXIST') throw new Error(`技能已存在：${category}/${name}`)
			throw error
		}
		invalidate()
		return { category, name, path: file, root }
	}

	/**
	 * Close watchers; the provider registration is disposed by the plugin effect.
	 *
	 * @returns {void}
	 */
	function dispose() {
		disposed = true
		clearTimeout(watchTimer)
		for (const watcher of watchers.values()) {
			try {
				watcher.close()
			} catch {
				// Already closed.
			}
		}
		watchers.clear()
	}

	return {
		provider,
		invalidate,
		refresh,
		snapshot,
		list,
		get,
		read,
		create,
		setCategoryEnabled,
		setSkillEnabled,
		dispose,
	}
}

/**
 * Expand a leading `~` to the home directory.
 *
 * @param {string} entry - Configured path.
 * @returns {string} The expanded path.
 */
function expandHome(entry) {
	if (entry === '~') return homedir()
	if (entry.startsWith('~/')) return join(homedir(), entry.slice(2))
	return entry
}

/**
 * Resolve one directory entry's kind, following symlinks.
 *
 * @param {string} full - Full path.
 * @param {import('node:fs').Dirent} entry - Directory entry.
 * @returns {Promise<'directory' | 'file' | 'other'>} The kind.
 */
async function entryKind(full, entry) {
	if (entry.isDirectory()) return 'directory'
	if (entry.isFile()) return 'file'
	if (!entry.isSymbolicLink()) return 'other'
	try {
		const info = await stat(full)
		if (info.isDirectory()) return 'directory'
		if (info.isFile()) return 'file'
		return 'other'
	} catch {
		return 'other'
	}
}

/**
 * Resolve the instruction file of one category child.
 *
 * @param {string} full - Child path.
 * @param {import('node:fs').Dirent} entry - Child entry.
 * @returns {Promise<{file: string, directory: string} | undefined>} The target, when it is a skill.
 */
async function skillTarget(full, entry) {
	const kind = await entryKind(full, entry)
	if (kind === 'directory') {
		const file = join(full, 'SKILL.md')
		return (await pathExists(file)) ? { file, directory: full } : undefined
	}
	if (kind === 'file' && full.endsWith('.md')) {
		return { file: full, directory: dirname(full) }
	}
	return undefined
}

/**
 * Whether a path exists.
 *
 * @param {string} path - Candidate path.
 * @returns {Promise<boolean>} True when stat succeeds.
 */
async function pathExists(path) {
	try {
		await stat(path)
		return true
	} catch {
		return false
	}
}

/**
 * Strip a flat skill's `.md` suffix for display.
 *
 * @param {string} folder - Directory entry name.
 * @returns {string} The display name.
 */
function folderName(folder) {
	return folder.endsWith('.md') ? folder.slice(0, -3) : folder
}

/**
 * Add a value to a list once, or remove every occurrence.
 *
 * @param {string[]} list - The stored list.
 * @param {string} value - The value.
 * @param {boolean} present - Whether it should be present.
 * @returns {void}
 */
function toggle(list, value, present) {
	const filtered = list.filter((entry) => entry !== value)
	if (present) filtered.push(value)
	list.splice(0, list.length, ...filtered)
}

/**
 * Read one error's message.
 *
 * @param {unknown} error - Thrown value.
 * @returns {string} The message.
 */
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error)
}
