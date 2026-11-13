import assert from 'node:assert/strict'
import test from 'node:test'

import { sanitizeValue, stripLoneSurrogates, truncateText } from '../src/safe-text.js'

test('truncateText counts code points and never splits a pair', () => {
	assert.equal(truncateText('a😀b', 2), 'a😀')
	assert.equal(truncateText('a😀b', 3), 'a😀b')
	assert.equal(truncateText('a😀b', 0), '')
	assert.equal(truncateText('plain', 10), 'plain')
})

test('lone surrogates are replaced instead of serialized', () => {
	assert.equal(stripLoneSurrogates('ok \ud83d'), 'ok \uFFFD')
	assert.equal(stripLoneSurrogates('a \udc00 b'), 'a \uFFFD b')
	// A complete pair is untouched.
	assert.equal(stripLoneSurrogates('😀'), '😀')
})

test('sanitizeValue walks arrays and plain objects and leaves other values alone', () => {
	const input = {
		title: 'bad \ud83d',
		list: ['ok', 'x \udc00'],
		count: 2,
		flag: false,
		missing: null,
	}
	assert.deepEqual(sanitizeValue(input), {
		title: 'bad \uFFFD',
		list: ['ok', 'x \uFFFD'],
		count: 2,
		flag: false,
		missing: null,
	})
})
