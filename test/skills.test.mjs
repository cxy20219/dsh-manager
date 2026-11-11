import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createSkillsManager } from '../src/skills.js'

const skill = (name, description = `${name} description`) => `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nBody for ${name}.\n`

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'dsh-manager-skills-'))
	await mkdir(join(root, 'dev', 'webapp-testing'), { recursive: true })
	await writeFile(join(root, 'dev', 'webapp-testing', 'SKILL.md'), skill('webapp-testing'))
	await mkdir(join(root, 'dev', 'flat-skill'), { recursive: true })
	await writeFile(join(root, 'dev', 'flat.md'), skill('flat-skill'))
	await mkdir(join(root, 'office', 'docx'), { recursive: true })
	await writeFile(join(root, 'office', 'docx', 'SKILL.md'), skill('docx', 'Word 文档'))
	await mkdir(join(root, 'office', 'broken'), { recursive: true })
	await writeFile(join(root, 'office', 'broken', 'SKILL.md'), 'no frontmatter here')
	await mkdir(join(root, 'top-level', 'own'), { recursive: true })
	await writeFile(join(root, 'top-level', 'SKILL.md'), skill('top-level'))
	await mkdir(join(root, '.hidden'), { recursive: true })
	return root
}

function manager(root) {
	const state = {
		skills: { roots: [root], disabledCategories: [], disabledSkills: [] },
		mcp: { servers: [] },
	}
	const settings = {
		get: () => state,
		update: async (mutate) => {
			const draft = structuredClone(state)
			mutate(draft)
			state.skills = draft.skills
			state.mcp = draft.mcp
			return state
		},
	}
	const skills = createSkillsManager({
		ctx: {},
		settings,
		ready: Promise.resolve(),
		logger: { warn() {} },
		defaultRoot: root,
	})
	return { skills, state }
}

test('scans category skills, flat skills, and errors; skips top-level skills and dot dirs', async () => {
	const root = await fixture()
	const { skills } = manager(root)
	try {
		const snapshot = await skills.snapshot()
		assert.deepEqual(snapshot.categories.map((category) => category.name), ['dev', 'office'])
		const dev = snapshot.categories[0]
		assert.deepEqual(dev.skills.map((entry) => entry.name).sort(), ['flat-skill', 'webapp-testing'])
		const office = snapshot.categories[1]
		assert.equal(office.skills.find((entry) => entry.folder === 'broken').ok, false)
		assert.equal(snapshot.totals.skills, 4)
		assert.equal(snapshot.totals.enabled, 3)
	} finally {
		skills.dispose()
		await rm(root, { recursive: true, force: true })
	}
})

test('lists only enabled candidates and loads a body on demand', async () => {
	const root = await fixture()
	const { skills } = manager(root)
	try {
		const candidates = await skills.list()
		assert.deepEqual(candidates.map((entry) => entry.name).sort(), ['docx', 'flat-skill', 'webapp-testing'])
		assert.ok(candidates.every((entry) => entry.source === 'custom' && entry.provider === 'manager'))
		const docx = candidates.find((entry) => entry.name === 'docx')
		const definition = await skills.get(docx, {})
		assert.equal(definition.description, 'Word 文档')
		assert.equal(definition.content, '# docx\n\nBody for docx.')
		assert.equal(definition.resourceBase.kind, 'directory')
	} finally {
		skills.dispose()
		await rm(root, { recursive: true, force: true })
	}
})

test('a disabled category or skill disappears from the catalog', async () => {
	const root = await fixture()
	const { skills } = manager(root)
	try {
		await skills.setCategoryEnabled('office', false)
		assert.deepEqual((await skills.list()).map((entry) => entry.name).sort(), ['flat-skill', 'webapp-testing'])
		await skills.setSkillEnabled('dev', 'flat-skill', false)
		assert.deepEqual((await skills.list()).map((entry) => entry.name), ['webapp-testing'])
		await skills.setCategoryEnabled('office', true)
		assert.deepEqual((await skills.list()).map((entry) => entry.name).sort(), ['docx', 'webapp-testing'])
	} finally {
		skills.dispose()
		await rm(root, { recursive: true, force: true })
	}
})

test('marks later same-name skills as conflicts and registers only the first', async () => {
	const root = await fixture()
	await mkdir(join(root, 'zzz', 'duplicate'), { recursive: true })
	await writeFile(join(root, 'zzz', 'duplicate', 'SKILL.md'), skill('webapp-testing'))
	const { skills } = manager(root)
	try {
		const snapshot = await skills.snapshot()
		const fromZzz = snapshot.categories.find((category) => category.name === 'zzz')
		assert.equal(fromZzz.skills[0].conflict, true)
		assert.equal(snapshot.conflicts.length, 1)
		assert.equal((await skills.list()).filter((entry) => entry.name === 'webapp-testing').length, 1)
	} finally {
		skills.dispose()
		await rm(root, { recursive: true, force: true })
	}
})

test('refresh drops the cached scan so an outside change is visible', async () => {
	const root = await fixture()
	const { skills } = manager(root)
	try {
		const before = await skills.snapshot()
		assert.equal(before.totals.skills, 4)
		await mkdir(join(root, 'paper', 'arxiv-reader'), { recursive: true })
		await writeFile(join(root, 'paper', 'arxiv-reader', 'SKILL.md'), skill('arxiv-reader'))
		skills.refresh()
		const after = await skills.snapshot()
		assert.equal(after.totals.skills, 5)
		const paper = after.categories.find((category) => category.name === 'paper')
		assert.deepEqual(paper.skills.map((entry) => entry.name), ['arxiv-reader'])
	} finally {
		skills.dispose()
		await rm(root, { recursive: true, force: true })
	}
})

test('creates a skill skeleton and reads it back', async () => {
	const root = await fixture()
	const { skills } = manager(root)
	try {
		const created = await skills.create({ category: 'dev', name: 'new-skill', description: '测试 "引号" 与描述' })
		assert.match(created.path, /dev\/new-skill\/SKILL\.md$/)
		const preview = await skills.read({ category: 'dev', name: 'new-skill' })
		assert.equal(preview.description, '测试 "引号" 与描述')
		await assert.rejects(skills.create({ category: 'dev', name: 'new-skill', description: 'again' }), /已存在/)
		await assert.rejects(skills.create({ category: '../escape', name: 'x', description: 'x' }), /分类名/)
		await assert.rejects(skills.create({ category: 'dev', name: 'Bad Name', description: 'x' }), /kebab-case/)
	} finally {
		skills.dispose()
		await rm(root, { recursive: true, force: true })
	}
})
