/**
 * Projection of the vendored skill kernel onto the legacy manager endpoints.
 *
 * The panel's older skill endpoints (`overview`, `skill-toggle`, `skill-read`,
 * `skill-create`) predate the kernel and speak a category-shaped snapshot. The
 * kernel speaks per-source roots with virtual categories. This module is the
 * one place that translates between the two, so the rest of the Host half never
 * has to know which shape it is holding.
 *
 * Mapping rules:
 *
 *   - a *category* in the legacy sense is a root key with skills that carry a
 *     `categoryId`; roots without categories group under their own label;
 *   - a skill's legacy `name` is the kernel's `name`, and `folder` is the last
 *     path segment, so the panel can key rows the way it always has;
 *   - `ok` is the kernel's `loadable`, and `invocation` is derived from its
 *     `effectiveModelInvocable` / `effectiveUserInvocable`;
 *   - toggling by `category` alone flips the whole root (source), which is what
 *     the legacy category switch meant.
 *
 * Nothing here writes: every mutation is delegated to the kernel, which owns
 * the state file, the trash, and the per-source policy.
 *
 * @module dsh-manager/skills-adapter
 */

import {
	createSkill,
	readManagerState,
	setCategoryEnabled,
	setSkillEnabled,
	skillDetail,
	state,
} from '../skills/core.js'

/** Legacy shape: one skill row. */
function toLegacySkill(skill, root) {
	const path = typeof skill.path === 'string' ? skill.path : ''
	// `path` points at the document (…/<name>/SKILL.md) or the flat file
	// (…/<name>.md); the folder is the enclosing directory, or the file stem.
	const segments = path.split(/[\\/]/).filter(Boolean)
	const last = segments.at(-1) ?? ''
	const folder = /^skill\.md$/i.test(last) ? segments.at(-2) ?? skill.name : last.replace(/\.md$/i, '') || skill.name
	return {
		name: skill.name,
		folder,
		description: skill.description ?? '',
		ok: skill.loadable !== false,
		enabled: skill.enabled !== false,
		disabled: skill.managerEnabled === false,
		invocation: {
			modelInvocable: skill.effectiveModelInvocable !== false,
			userInvocable: skill.effectiveUserInvocable !== false,
		},
		diagnostics: Array.isArray(skill.diagnostics) ? skill.diagnostics : [],
		note: skill.customNote ?? '',
		linked: skill.linked === true,
		source: root.key,
	}
}

/**
 * Project the kernel state into the legacy snapshot the panel already renders.
 *
 * @returns {Promise<object>} The legacy snapshot.
 */
export async function legacySnapshot() {
	const current = await state({})
	const roots = Array.isArray(current.roots) ? current.roots : []
	const categories = []
	const allSkills = []
	let enabled = 0

	for (const root of roots) {
		const skills = (Array.isArray(root.skills) ? root.skills : []).map((skill) => toLegacySkill(skill, root))
		allSkills.push(...skills)
		const usable = skills.filter((skill) => skill.ok)
		const enabledHere = usable.filter((skill) => skill.enabled).length
		enabled += enabledHere
		// `root.enabled` is the source switch (`sources[key]`). A root whose
		// every usable skill was switched off individually reads as disabled
		// too, which is what the panel's category switch is asking about.
		const allOff = usable.length > 0 && enabledHere === 0
		categories.push({
			name: root.key,
			label: root.label ?? root.key,
			disabled: root.enabled === false || allOff,
			error: root.truncated === true ? '目录较大，部分技能未列出' : undefined,
			skills,
		})
	}

	return {
		categories,
		roots: roots.map((root) => ({
			path: root.path,
			key: root.key,
			label: root.label ?? root.key,
			exists: root.exists !== false,
			error: root.truncated === true ? 'truncated' : '',
		})),
		totals: {
			categories: categories.length,
			skills: allSkills.length,
			enabled,
		},
		conflicts: [],
		warnings: Array.isArray(current.warnings) ? current.warnings : [],
	}
}

/**
 * Read one skill's document for the detail modal.
 *
 * @param {{category: string, name: string}} request - Which skill.
 * @returns {Promise<object>} The detail payload.
 */
export async function legacyRead({ category, name }) {
	const detail = await skillDetail({ root: category, name })
	if (detail && detail.ok === false) throw new Error(detail.error ?? '读取技能失败')
	return detail
}

/**
 * Flip a source, a category, or a single skill.
 *
 * The kernel's exported `setSkillEnabled` takes a *root definition*, not a root
 * key: given a bare string it re-resolves through `userRoots()`, loses the
 * `scope`/`kind` fields, and answers `error.root.readonly` for every user root.
 * Handing it the root object that `state()` already returned keeps those fields
 * and takes the normal policy path. A source-wide toggle uses the `"*"`
 * category, which is the kernel's own "every skill in this root" selector.
 *
 * @param {{category: string, name: string, enabled: boolean}} request - What to flip.
 * @returns {Promise<void>} Resolves after the kernel persisted the change.
 */
export async function legacyToggle({ category, name, enabled }) {
	if (category === '') throw new Error('缺少分类名')
	if (name === '') {
		const result = await setCategoryEnabled(category, '*', enabled)
		if (result && result.ok === false) throw new Error(result.error ?? '切换分类失败')
		return
	}
	const current = await state({})
	const root = (Array.isArray(current.roots) ? current.roots : []).find((entry) => entry.key === category)
	if (root === undefined) throw new Error(`技能来源不存在: ${category}`)
	const result = await setSkillEnabled(root, name, enabled)
	if (result && result.ok === false) throw new Error(result.error ?? '切换技能失败')
}

/**
 * Create a skill through the kernel.
 *
 * @param {{category: string, name: string, description: string}} request - The new skill.
 * @returns {Promise<object>} What was created.
 */
export async function legacyCreate({ category, name, description }) {
	const result = await createSkill({ root: category, name, description })
	if (result && result.ok === false) throw new Error(result.error ?? '创建技能失败')
	return result
}

/** The kernel's own state, for the new panel views. */
export { state as kernelState, readManagerState }
