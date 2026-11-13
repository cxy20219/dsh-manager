import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyIntent, INTENT_PREFERENCES, isCjkQuery, routeChannelIds } from '../src/search-route.js'

/** Metadata stand-in for the routing tests. */
const CHANNELS = new Map([
	['minimax', { id: 'minimax', langs: ['zh', 'en'], primary: 'zh' }],
	['bing', { id: 'bing', langs: ['zh', 'en'], primary: '' }],
	['exa', { id: 'exa', langs: ['en'], primary: 'en' }],
	['tavily', { id: 'tavily', langs: ['en'], primary: 'en' }],
	['baidu-html', { id: 'baidu-html', langs: ['zh'], primary: 'zh' }],
])

test('CJK queries are detected', () => {
	assert.equal(isCjkQuery('深度学习'), true)
	assert.equal(isCjkQuery('カメラ 比較'), true)
	assert.equal(isCjkQuery('deep learning'), false)
	assert.equal(isCjkQuery(''), false)
})

test('intent classification covers the five domains', () => {
	assert.equal(classifyIntent('帮我查一下股票财报').domain, 'finance')
	assert.equal(classifyIntent('arxiv paper on diffusion').domain, 'academic')
	assert.equal(classifyIntent('typescript 编译报错').domain, 'code')
	assert.equal(classifyIntent('latest news today').domain, 'news')
	assert.equal(classifyIntent('哪款耳机性价比高').domain, 'shopping')
	assert.deepEqual(classifyIntent('hello'), { domain: 'general', matched: false })
})

test('a Chinese query puts Chinese-primary channels ahead', () => {
	const routed = routeChannelIds({
		query: '深度学习 教程',
		enabledIds: ['minimax', 'bing', 'exa'],
		order: ['exa', 'minimax', 'bing'],
		channels: CHANNELS,
	})
	assert.equal(routed.language, 'zh')
	assert.deepEqual(routed.order, ['minimax', 'bing', 'exa'])
})

test('an English query puts English-primary channels ahead and keeps the tail', () => {
	const routed = routeChannelIds({
		query: 'deep learning tutorial',
		enabledIds: ['minimax', 'bing', 'exa', 'tavily'],
		order: ['minimax', 'bing', 'tavily', 'exa'],
		channels: CHANNELS,
	})
	assert.equal(routed.language, 'en')
	// Intent is general, so primary language decides before the global order.
	assert.deepEqual(routed.order, ['tavily', 'exa', 'bing', 'minimax'])
})

test('intent preference reorders within the language group', () => {
	const routed = routeChannelIds({
		query: 'typescript compile error',
		enabledIds: ['bing', 'exa', 'minimax'],
		order: ['exa', 'minimax', 'bing'],
		channels: CHANNELS,
	})
	assert.equal(routed.intent, 'code')
	// bing is first in the code preference list, ahead of the en-primary exa.
	assert.deepEqual(routed.order.slice(0, 2), ['bing', 'exa'])
	assert.deepEqual(INTENT_PREFERENCES.code.slice(0, 2), ['bing', 'exa'])
})

test('disabled and unknown channels never appear in the route', () => {
	const routed = routeChannelIds({
		query: 'hello',
		enabledIds: ['exa'],
		order: ['exa', 'bing', 'missing'],
		channels: CHANNELS,
	})
	assert.deepEqual(routed.order, ['exa'])
})
