/**
 * Deterministic query routing for the manager's `auto` search mode.
 *
 * `merge` fans out to every enabled channel and `fallback` walks the operator's
 * global order. Neither knows that a Chinese query is better served by native
 * Chinese engines or that a "latest news" query wants a news-capable index
 * first. This module supplies that missing signal without any network call:
 *
 *   1. the query language picks the language group (CJK → zh);
 *   2. the intent (code / academic / news / finance / shopping) reorders the
 *      channels that declare themselves good at it;
 *   3. a channel whose primary language matches the query floats above the
 *      neutral ones, which float above the other-language ones;
 *   4. ties keep the operator's global order.
 *
 * The result is a prefix of channels to try in order. `auto` stops at the
 * first channel that returns a usable source, so the list also acts as the
 * per-query fallback chain.
 *
 * @module dsh-manager/search-route
 */

import { SEARCH_CHANNEL_BY_ID } from './search-providers.js'

/** Language of a CJK query: Chinese, Japanese or Korean script. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/

/** Intent rules, first match wins; order is deliberate. */
const INTENT_RULES = [
	{
		domain: 'finance',
		pattern: /股票|基金|财报|利率|汇率|贷款|债券|通胀|市值|IPO|加密货币|比特币|stock|equity|fund|earnings|inflation|interest rate|forex|lpr|crypto|bitcoin|nasdaq|nyse/i,
	},
	{
		domain: 'academic',
		pattern: /论文|文献|学术|引用|期刊|会议|研究综述|arxiv|doi|citation|paper|study|pubmed|scholar|journal|conference|preprint/i,
	},
	{
		domain: 'code',
		pattern: /代码|报错|编译|函数|接口|依赖|仓库|github|gitlab|npm|pypi|python|javascript|typescript|rust|golang|java|docker|kubernetes|stack trace|exception|regex|api error/i,
	},
	{
		domain: 'news',
		pattern: /新闻|最新|今天|昨天|本周|本月|今年|发布|突发|breaking|today|latest|this week|this month|announced|launch/i,
	},
	{
		domain: 'shopping',
		pattern: /价格|购买|优惠|折扣|测评|推荐|哪款|性价比|price|buy|discount|deal|review|best|cheap/i,
	},
]

/**
 * Channel preferences per intent. Unknown ids are ignored, so the map can name
 * engines that a future build has not registered yet.
 */
export const INTENT_PREFERENCES = Object.freeze({
	finance: Object.freeze(['bing', 'minimax', 'anysearch', 'baidu-html', 'exa', 'tavily', 'so360']),
	academic: Object.freeze(['exa', 'tavily', 'parallel', 'bing', 'anysearch', 'metaso', 'google', 'baidu-html']),
	code: Object.freeze(['bing', 'exa', 'tavily', 'anysearch', 'ddg', 'searxng', 'sogou']),
	news: Object.freeze(['bing', 'minimax', 'baidu-html', 'anysearch', 'so360', 'sogou', 'exa', 'ddg']),
	shopping: Object.freeze(['bing', 'baidu-html', 'so360', 'anysearch', 'minimax', 'ddg']),
})

/**
 * Whether a query is written in a CJK script.
 *
 * @param {unknown} query - Search query.
 * @returns {boolean} Whether the query is CJK.
 */
export function isCjkQuery(query) {
	return CJK.test(String(query ?? ''))
}

/**
 * Classify a query's intent.
 *
 * @param {unknown} query - Search query.
 * @returns {{domain: string, matched: boolean}} The intent.
 */
export function classifyIntent(query) {
	const text = String(query ?? '')
	for (const rule of INTENT_RULES) {
		if (rule.pattern.test(text)) return { domain: rule.domain, matched: true }
	}
	return { domain: 'general', matched: false }
}

/**
 * Order the enabled channels for one query.
 *
 * @param {{query: unknown, enabledIds: string[], order: string[], channels?: Map<string, object>}} options - Query, enabled ids, global order and metadata.
 * @returns {{language: 'zh' | 'en', intent: string, order: string[]}} The routed order.
 */
export function routeChannelIds({ query, enabledIds, order, channels = SEARCH_CHANNEL_BY_ID }) {
	const language = isCjkQuery(query) ? 'zh' : 'en'
	const intent = classifyIntent(query).domain
	const preference = INTENT_PREFERENCES[intent] ?? []
	const enabled = new Set(Array.isArray(enabledIds) ? enabledIds : [])
	const position = new Map((Array.isArray(order) ? order : []).map((id, index) => [id, index]))
	const supports = (id) => {
		const langs = channels.get(id)?.langs
		return !Array.isArray(langs) || langs.length === 0 || langs.includes(language)
	}
	const primaryRank = (id) => {
		const primary = channels.get(id)?.primary
		if (typeof primary !== 'string' || primary === '') return 1
		return primary === language ? 0 : 2
	}
	const intentRank = (id) => {
		const index = preference.indexOf(id)
		return index === -1 ? preference.length : index
	}
	const compare = (a, b) => intentRank(a) - intentRank(b)
		|| primaryRank(a) - primaryRank(b)
		|| (position.get(a) ?? Number.MAX_SAFE_INTEGER) - (position.get(b) ?? Number.MAX_SAFE_INTEGER)
	const candidates = [...position.keys()].filter((id) => enabled.has(id))
	// Per-search billed model engines are never auto-routed: enabling one must
	// not turn every automatic query into a billable call. They stay in the
	// explicit `merge` / `fallback` paths. If they are the only enabled
	// channels, the route falls back to them instead of returning nothing.
	const routable = candidates.filter((id) => channels.get(id)?.autoExcluded !== true)
	const pool = routable.length > 0 ? routable : candidates
	const head = pool.filter(supports).sort(compare)
	const tail = pool.filter((id) => !supports(id)).sort(compare)
	return { language, intent, order: [...head, ...tail] }
}
