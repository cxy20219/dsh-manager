import assert from 'node:assert/strict'
import test from 'node:test'

import { isSkillName, parseSkillDocument } from '../src/frontmatter.js'

const doc = (frontmatter, body = '\n# Heading\n\nBody text.\n') => `---\n${frontmatter}\n---${body}`

test('reads a quoted description and keeps the body without frontmatter', () => {
	const result = parseSkillDocument(doc('name: webapp-testing\ndescription: "Toolkit for local web apps."\nwhenToUse: Use it when testing.'))
	assert.equal(result.ok, true)
	assert.equal(result.name, 'webapp-testing')
	assert.equal(result.description, 'Toolkit for local web apps.')
	assert.equal(result.whenToUse, 'Use it when testing.')
	assert.equal(result.invocation.modelInvocable, true)
	assert.equal(result.invocation.userInvocable, true)
	assert.equal(result.body, '# Heading\n\nBody text.')
})

test('reads a literal block description', () => {
	const raw = doc('name: block-skill\ndescription: |\n  第一行\n  第二行\nmetadata:\n  owner: someone')
	const result = parseSkillDocument(raw)
	assert.equal(result.ok, true)
	assert.equal(result.description, '第一行\n第二行')
})

test('reads a folded block description', () => {
	const raw = doc('name: folded-skill\ndescription: >-\n  one line\n  continues here\n\n  new paragraph')
	const result = parseSkillDocument(raw)
	assert.equal(result.ok, true)
	assert.equal(result.description, 'one line continues here\n\nnew paragraph')
})

test('decodes escaped quotes and unicode', () => {
	const raw = doc('name: quoted\ndescription: "He said \\"hi\\" \\u4f60\\u597d"')
	const result = parseSkillDocument(raw)
	assert.equal(result.ok, true)
	assert.equal(result.description, 'He said "hi" 你好')
})

test('reads single-quoted values with doubled quotes', () => {
	const raw = doc("name: single\ndescription: 'It''s fine'")
	const result = parseSkillDocument(raw)
	assert.equal(result.ok, true)
	assert.equal(result.description, "It's fine")
})

test('strips a trailing comment from a plain scalar', () => {
	const result = parseSkillDocument(doc('name: plain\ndescription: Plain text # not part of it'))
	assert.equal(result.ok, true)
	assert.equal(result.description, 'Plain text')
})

test('accepts the boolean spellings the registry accepts', () => {
	const raw = doc([
		'name: gated',
		'description: gated skill',
		'disable-model-invocation: yes',
		'user-invocable: off',
	].join('\n'))
	const result = parseSkillDocument(raw)
	assert.equal(result.ok, true)
	assert.deepEqual(result.invocation, { modelInvocable: false, userInvocable: false })
})

test('rejects legacy invocation keys', () => {
	const result = parseSkillDocument(doc('name: legacy\ndescription: x\ndisableModelInvocation: true'))
	assert.equal(result.ok, false)
	assert.match(result.error, /disable-model-invocation/)
})

test('rejects a non-boolean invocation value', () => {
	const result = parseSkillDocument(doc('name: bad\nif: x\ndescription: x\nuser-invocable: sometimes'))
	assert.equal(result.ok, false)
	assert.match(result.error, /布尔值/)
})

test('rejects a missing or malformed frontmatter block', () => {
	assert.equal(parseSkillDocument('# No frontmatter\n').ok, false)
	assert.equal(parseSkillDocument('---\nname: x\n').ok, false)
	assert.equal(parseSkillDocument('---\nname: x\ndescription: y\n---\nbody').ok, true)
})

test('rejects invalid names and empty descriptions', () => {
	assert.equal(parseSkillDocument(doc('name: Not_Kebab\ndescription: x')).ok, false)
	assert.equal(parseSkillDocument(doc('name: valid\ndescription: ""')).ok, false)
})

test('validates kebab-case names', () => {
	assert.equal(isSkillName('office'), true)
	assert.equal(isSkillName('office-docx'), true)
	assert.equal(isSkillName('office_docx'), false)
	assert.equal(isSkillName('Office'), false)
})
