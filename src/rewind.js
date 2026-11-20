/**
 * The conversation-rewind feature, vendored into the manager.
 *
 * The behaviour comes from `dsh-rewind-plugin` (MIT, see `rewind/NOTICE`),
 * whose host half lives in `rewind/index.js`. This module owns *when* it runs:
 *
 *   - the switch lives in the manager's own settings (`ui.features.rewind`);
 *   - the host half is mounted once, and reads the switch live, so flipping it
 *     takes effect at once — the commands answer "off" and no checkpoint is
 *     recorded while it is off;
 *   - the client half is mounted by `client.js` under the same switch.
 *
 * The feature therefore *is* the plugin's behaviour, byte for byte; the
 * manager only decides whether it is on.
 *
 * @module dsh-manager/rewind
 */

import { join } from 'node:path'

import { apply as applyRewindHost } from '../rewind/index.js'

/** The feature id used in the settings and in the panel. */
export const REWIND_FEATURE_ID = 'rewind'

/** What the panel shows for the feature. */
export const REWIND_TITLE = '对话回退'

/** One line about what the feature does. */
export const REWIND_DESCRIPTION = '把对话回退到更早的消息，可选一并还原工作区文件。'

/** The message the commands answer with while the feature is off. */
const DISABLED_MESSAGE = '对话回退已关闭，可以在管理器的「UI 增强」页打开。'

/**
 * Build the rewind feature.
 *
 * @param {{ctx: object, settings: object, dataDir: string, logger?: object}} options - Host context, settings and the manager's data folder.
 * @returns {{status: () => object, setEnabled: (enabled: boolean) => Promise<object>, mount: () => void}} The feature.
 */
export function createRewindFeature({ ctx, settings, dataDir, logger }) {
	let mounted = false

	/**
	 * Whether the operator wants the feature on.
	 *
	 * @returns {boolean} The switch.
	 */
	function isEnabled() {
		const features = settings.get().ui?.features ?? {};
		return features[REWIND_FEATURE_ID] !== false;
	}

	/**
	 * Mount the vendored host half, once.
	 *
	 * @returns {void}
	 */
	function mount() {
		if (mounted) return;
		mounted = true;
		try {
			applyRewindHost(ctx, {
				// The checkpoints live with the manager's own data, so removing
				// the plugin does not lose them.
				snapshotDir: join(dataDir, 'rewind-snapshots'),
				// The live switch: the vendored code asks before it acts.
				featureEnabled: isEnabled,
				disabledMessage: DISABLED_MESSAGE,
				fileCheckpointingEnabled: true,
				autoCleanupEnabled: true,
				autoCleanupMaxAgeDays: 7,
			});
			logger?.info?.('dsh-manager: 对话回退已挂载。');
		} catch (error) {
			mounted = false;
			logger?.warn?.(`dsh-manager: 对话回退挂载失败：${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * The panel-facing state.
	 *
	 * @returns {object} The feature view.
	 */
	function status() {
		return {
			id: REWIND_FEATURE_ID,
			title: REWIND_TITLE,
			description: REWIND_DESCRIPTION,
			enabled: isEnabled(),
			defaultEnabled: true,
			mounted,
			version: '0.22.2',
		};
	}

	/**
	 * Switch the feature on or off.
	 *
	 * @param {boolean} enabled - Wanted state.
	 * @returns {Promise<object>} The fresh state.
	 */
	async function setEnabled(enabled) {
		await settings.update((draft) => {
			draft.ui = { ...(draft.ui ?? {}), features: { ...(draft.ui?.features ?? {}), [REWIND_FEATURE_ID]: enabled } };
		});
		if (enabled) mount();
		return status();
	}

	return { id: REWIND_FEATURE_ID, status, setEnabled, mount };
}
