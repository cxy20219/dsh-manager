/**
 * The input-box history enhancement.
 *
 * The behaviour lives in the browser half (`client.js`): on ArrowUp/ArrowDown
 * the composer walks back through the messages this session already sent, and
 * one of them can be edited and sent again. There is nothing for the Host to
 * run, so this module owns only the switch — which is still the manager's own
 * settings file, the same home every other enhancement uses.
 *
 * @module dsh-manager/composer-history
 */

/** The feature id used in the settings and in the panel. */
export const HISTORY_FEATURE_ID = 'composer-history'

/** What the panel shows for the feature. */
export const HISTORY_TITLE = '输入框历史'

/** One line about what the feature does. */
export const HISTORY_DESCRIPTION = '在输入框按 ↑/↓ 翻出最近发送的消息，可以改完再发。'

/**
 * Build the input-history feature.
 *
 * @param {{settings: object}} options - The manager's settings store.
 * @returns {{id: string, clientOnly: boolean, status: () => object, setEnabled: (enabled: boolean) => Promise<object>}} The feature.
 */
export function createHistoryFeature({ settings }) {
	/**
	 * Whether the operator wants the feature on.
	 *
	 * @returns {boolean} The switch.
	 */
	function isEnabled() {
		const features = settings.get().ui?.features ?? {}
		return features[HISTORY_FEATURE_ID] !== false
	}

	/**
	 * The panel-facing state.
	 *
	 * @returns {object} The feature view.
	 */
	function status() {
		return {
			id: HISTORY_FEATURE_ID,
			title: HISTORY_TITLE,
			description: HISTORY_DESCRIPTION,
			enabled: isEnabled(),
			defaultEnabled: true,
			// Nothing is mounted on the Host: the switch alone is the feature.
			mounted: true,
			clientOnly: true,
			version: '',
		}
	}

	/**
	 * Switch the feature on or off.
	 *
	 * The browser half re-reads `ui-status` when the panel reports a change, so
	 * this only has to persist the decision.
	 *
	 * @param {boolean} enabled - Wanted state.
	 * @returns {Promise<object>} The fresh state.
	 */
	async function setEnabled(enabled) {
		await settings.update((draft) => {
			draft.ui = { ...(draft.ui ?? {}), features: { ...(draft.ui?.features ?? {}), [HISTORY_FEATURE_ID]: enabled } }
		})
		return status()
	}

	return { id: HISTORY_FEATURE_ID, clientOnly: true, status, setEnabled }
}
