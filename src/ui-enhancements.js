/**
 * The UI enhancements the manager owns.
 *
 * Every feature here is implemented **inside this plugin** — the manager
 * decides whether it is on, and the behaviour is the code that ships with the
 * manager. Nothing here reads or writes another plugin's state, and no feature
 * depends on a package being installed separately.
 *
 * The switch lives in the manager's own settings (`ui.features.<id>`), so the
 * state has exactly one home: the file the manager already owns.
 *
 * @module dsh-manager/ui-enhancements
 */

/**
 * Build the UI-enhancement service.
 *
 * @param {{features: object[], logger?: object}} options - The features this manager offers and a logger.
 * @returns {{status: () => Promise<object>, setEnabled: (id: string, enabled: boolean) => Promise<object>}} The service.
 */
export function createUiEnhancements({ features, logger }) {
	/** What the browser half last reported, per part of the feature. */
	let clientReport = {
		mount: { mounted: false, reason: 'not-reported', at: 0 },
		row: { mounted: false, reason: 'not-reported', at: 0 },
		/** Per-feature records: a feature that has no Host half reports here. */
		features: {},
	};

	/**
	 * The live state of every feature.
	 *
	 * @returns {Promise<object>} The panel-facing view.
	 */
	async function status() {
		const rows = [];
		for (const feature of features) {
			rows.push(await feature.status());
		}
		return { available: true, features: rows, client: clientReport };
	}

	/**
	 * Record what the browser half managed to do.
	 *
	 * The rewind surface lives in the conversation UI, not in this panel, so the
	 * panel cannot see whether it mounted; the browser tells it instead.
	 *
	 * @param {object} report - The browser's report.
	 * @returns {object} The stored report.
	 */
	function reportClient(report) {
		const scope = report?.scope === 'row' ? 'row' : 'mount';
		const record = {
			mounted: report?.mounted === true,
			reason: typeof report?.reason === 'string' ? report.reason.slice(0, 200) : 'unknown',
			at: Date.now(),
		};
		const feature = typeof report?.feature === 'string' ? report.feature : '';
		clientReport = {
			...clientReport,
			[scope]: record,
			features: feature === ''
				? clientReport.features
				: { ...clientReport.features, [feature]: record },
		};
		return clientReport;
	}

	/**
	 * Switch one feature on or off.
	 *
	 * @param {string} id - Feature id.
	 * @param {boolean} enabled - Wanted state.
	 * @returns {Promise<object>} The fresh view.
	 */
	async function setEnabled(id, enabled) {
		const feature = features.find((entry) => entry.id === id);
		if (feature === undefined) throw new Error(`未知的 UI 增强功能：${id}`);
		try {
			await feature.setEnabled(enabled);
		} catch (error) {
			logger?.warn?.(`dsh-manager: 切换 UI 增强 ${id} 失败：${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
		return status();
	}

	return { status, setEnabled, reportClient };
}
