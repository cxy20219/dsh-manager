/**
 * The agent presets this manager owns.
 *
 * A DSH mode is an agent preset: one list of plugin rows that decides the
 * tools and prompt sections a new session runs with. The manager registers a
 * mode through the Host's `agentPresets` service and keeps the disposer, so
 * the panel's switch is a registration, not a profile edit: no patch file is
 * rewritten and no restart is needed. Sessions that already started keep the
 * composition they were created with; only new sessions see the change.
 *
 * @module dsh-manager/modes
 */

/** How long the post-mount diagnostic may take before the panel gives up on it. */
export const DIAGNOSE_TIMEOUT_MS = 5000

/** What the panel says when the Host has no `agentPresets` service. */
export const UNAVAILABLE = '当前 Host 没有模式服务（agentPresets）'

/**
 * Plan-mode guidance for the simple mode.
 *
 * Shorter than the text the standard preset carries: same contract (explore
 * before designing, never mutate, submit through `exit_plan_mode` as the last
 * call), minus the commentary about cache stability and tool catalogs.
 */
const PLAN_SECTION = [
	'You are in plan mode. Stay here until the user approves through exit_plan_mode or switches the session mode; agreeing in conversation approves nothing.',
	'Explore before designing: use non-mutating reads, searches, static analysis and checks. Do not edit files, change configuration, commit, or carry out the plan.',
	'Ask only what inspection cannot answer and the user alone owns.',
	'Make the plan decision-complete: goal and success criteria; changes grouped by subsystem; API, schema and data-flow changes; edge cases and failure modes; tests, acceptance criteria and assumptions. Concise enough to review, detailed enough to implement without new design decisions.',
	'When ready, call exit_plan_mode with the plan markdown starting with a # title, as the only tool call in that response. If review rejects it, fold the feedback in and present again. If the review channel is unavailable, stay in plan mode and ask the user to switch modes by hand.',
].join('\n\n')

/**
 * The modes this plugin ships.
 *
 * The simple mode is the standard preset with three capability groups left
 * out — scheduled tasks, the workflow orchestrator and the plugin-manager
 * tool — and its own shorter plan-mode guidance. Everything else is copied
 * from the standard composition so the two differ only where intended.
 *
 * @param {string} [platform] - Platform to pick the shell rows for.
 * @returns {object[]} Mode definitions, safe to register as-is.
 */
export function builtInModes(platform = process.platform) {
	const windows = platform === 'win32'
	return [
		{
			id: 'simple',
			name: '简单',
			description: '标准模式的精简版：读写代码、跑命令、查网页、记待办、长目标与子 agent 都在；去掉定时任务、工作流与插件管理。',
			order: 5,
			removed: ['tool-schedule', 'workflow-ptc', 'tool-workflow', 'tool-plugin-manager'],
			plugins: [
				{
					id: 'persona',
					name: '@deepseek-ai/dsh-persona',
					config: { prefix: 'You are a coding agent powered by the {{model}} model.' },
				},
				{
					id: 'agent-instructions',
					name: '@deepseek-ai/dsh-agent-instructions',
					config: { maxBytes: 65536 },
				},
				{ id: 'time-context', name: '@deepseek-ai/dsh-time-context' },
				{ id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', disabled: windows },
				{ id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh', disabled: !windows },
				{
					id: 'tool-fs',
					name: '@deepseek-ai/dsh-tool-fs',
					config: { applyPatch: false },
				},
				{
					id: 'tool-fs-search',
					name: '@deepseek-ai/dsh-tool-fs-search',
					config: { sampleOverCapGlobResults: false },
				},
				{ id: 'tool-jobs', name: '@deepseek-ai/dsh-tool-jobs' },
				{ id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
				{ id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
				{ id: 'command-goal', name: '@deepseek-ai/dsh-command-goal' },
				{ id: 'tool-goal', name: '@deepseek-ai/dsh-tool-goal' },
				{
					id: 'planning',
					name: 'cordis:group',
					group: true,
					isolate: { planMode: true },
					config: [
						{ id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode', config: { section: PLAN_SECTION } },
					],
				},
				{
					id: 'compaction',
					name: 'cordis:group',
					group: true,
					isolate: { compaction: true, toolResultPruner: true },
					config: [
						{ id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
						{ id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
						{
							id: 'tool-result-pruner',
							name: '@deepseek-ai/dsh-compaction-tool-result-pruner',
							config: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 },
						},
					],
				},
				{
					id: 'delegation',
					name: 'cordis:group',
					group: true,
					config: [
						{ id: 'tool-subagent-control', name: '@deepseek-ai/dsh-tool-subagent-control' },
						{
							id: 'tool-subagent',
							name: '@deepseek-ai/dsh-tool-subagent',
							config: { provider: 'spawn', toolName: 'subagent', modelSelection: true, modelDiscovery: true },
						},
						{
							id: 'tool-subagent-fork',
							name: '@deepseek-ai/dsh-tool-subagent',
							config: { provider: 'fork', toolName: 'subagent_fork' },
						},
					],
				},
				{ id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user' },
				{
					id: 'tool-todo',
					name: '@deepseek-ai/dsh-tool-todo',
					config: { allowParallelInProgress: true },
				},
				{
					id: 'tool-web',
					name: '@deepseek-ai/dsh-tool-web',
					config: { fetch: true, searchTimeoutMs: 60000 },
				},
				{ id: 'present', name: '@deepseek-ai/dsh-tool-present' },
			],
		},
	]
}

/**
 * Own the registration state of the modes this plugin ships.
 *
 * Turning a mode on registers it with the Host registry; turning it off calls
 * the disposer the registry returned. Both the switch (what the user asked
 * for) and the registration (what actually happened) are reported, so a mode
 * that fails to mount is a visible error rather than a silent absence.
 *
 * @param {{getAgentPresets: () => object | undefined, settings: object, logger?: object, modes?: object[]}} options - Wiring.
 * @returns {object} The mode manager.
 */
export function createModes({ getAgentPresets, settings, logger, modes = builtInModes() }) {
	const entries = new Map()
	for (const mode of modes) {
		entries.set(mode.id, { registered: false, pending: false, error: '', unregister: undefined })
	}
	/** Serializes register/unregister so two fast clicks cannot interleave. */
	let chain = Promise.resolve()

	/**
	 * The Host registry, when this composition has one.
	 *
	 * @returns {object | undefined} The `agentPresets` service.
	 */
	function host() {
		const service = getAgentPresets()
		return service !== undefined && service !== null && typeof service.register === 'function' ? service : undefined
	}

	/**
	 * Whether the user asked for a mode on.
	 *
	 * @param {string} id - Mode id.
	 * @returns {boolean} The stored intent.
	 */
	function isEnabled(id) {
		const enabled = settings.get().modes?.enabled
		return enabled !== undefined && enabled[id] === true
	}

	/**
	 * The projection of one row for the panel's composition view.
	 *
	 * @param {object} row - One plugin row.
	 * @returns {object} Id, plugin name, and nested row ids.
	 */
	function describeRow(row) {
		return {
			id: typeof row.id === 'string' ? row.id : '',
			plugin: typeof row.name === 'string' ? row.name : '',
			children: Array.isArray(row.config)
				? row.config.map((child) => (typeof child.id === 'string' ? child.id : child.name))
				: [],
		}
	}

	/**
	 * Read the registry's activation diagnostic for one mode.
	 *
	 * A preset whose rows fail to mount still registers: the registry keeps the
	 * broken definition and reports it here instead of throwing. The read can
	 * wait on the Host Loader, so it is bounded and its absence is not an error.
	 *
	 * @param {object} service - The `agentPresets` service.
	 * @param {string} id - Mode id.
	 * @returns {Promise<string>} The diagnostic, or an empty string.
	 */
	async function diagnose(service, id) {
		if (typeof service.list !== 'function') return ''
		let timer
		try {
			const rows = await Promise.race([
				service.list(),
				new Promise((resolve) => {
					timer = setTimeout(() => resolve(undefined), DIAGNOSE_TIMEOUT_MS)
				}),
			])
			const row = Array.isArray(rows) ? rows.find((item) => item?.id === id) : undefined
			return typeof row?.broken === 'string' ? row.broken : ''
		} catch {
			return ''
		} finally {
			clearTimeout(timer)
		}
	}

	/**
	 * Register one mode with the Host.
	 *
	 * @param {object} mode - Mode definition.
	 * @returns {Promise<void>} Resolves after the attempt, successful or not.
	 */
	async function mount(mode) {
		const entry = entries.get(mode.id)
		entry.pending = true
		entry.error = ''
		entry.registered = false
		const service = host()
		if (service === undefined) {
			entry.pending = false
			entry.error = UNAVAILABLE
			return
		}
		try {
			entry.unregister = await service.register({
				id: mode.id,
				name: mode.name,
				description: mode.description,
				order: mode.order,
				plugins: structuredClone(mode.plugins),
			})
			entry.registered = true
			const broken = await diagnose(service, mode.id)
			if (broken !== '') entry.error = broken
		} catch (error) {
			entry.unregister = undefined
			entry.error = error instanceof Error ? error.message : String(error)
			logger?.warn?.(`dsh-manager: 模式 ${mode.id} 没能挂载：${entry.error}`)
		} finally {
			entry.pending = false
		}
	}

	/**
	 * Drop one mode from the Host registry, if it is there.
	 *
	 * @param {object} mode - Mode definition.
	 * @returns {Promise<void>} Resolves after disposal.
	 */
	async function unmount(mode) {
		const entry = entries.get(mode.id)
		const dispose = entry.unregister
		entry.unregister = undefined
		entry.registered = false
		entry.error = ''
		if (dispose === undefined) return
		try {
			await dispose()
		} catch (error) {
			entry.error = error instanceof Error ? error.message : String(error)
		}
	}

	/**
	 * The panel's view of every mode this plugin ships.
	 *
	 * @returns {{available: boolean, modes: object[]}} The status.
	 */
	function status() {
		return {
			available: host() !== undefined,
			modes: modes.map((mode) => {
				const entry = entries.get(mode.id)
				return {
					id: mode.id,
					name: typeof mode.name === 'string' ? mode.name : mode.id,
					description: typeof mode.description === 'string' ? mode.description : '',
					order: mode.order,
					enabled: isEnabled(mode.id),
					registered: entry.registered,
					pending: entry.pending,
					error: entry.error,
					plugins: mode.plugins.map(describeRow),
					removed: Array.isArray(mode.removed) ? [...mode.removed] : [],
				}
			}),
		}
	}

	/**
	 * Register every mode the settings left on.
	 *
	 * The registry is a sibling row, so it can reach its service state just
	 * after this plugin's own activation. A short breath keeps that boot race
	 * from turning into "no mode service" on every start.
	 *
	 * @returns {Promise<void>} Resolves when the initial pass is done.
	 */
	async function start() {
		for (const mode of modes) {
			if (!isEnabled(mode.id)) continue
			for (let attempt = 0; attempt < 3 && host() === undefined; attempt += 1) {
				await new Promise((resolve) => setTimeout(resolve, 100))
			}
			await mount(mode)
		}
	}

	/**
	 * Apply one switch and persist the intent.
	 *
	 * @param {string} id - Mode id.
	 * @param {boolean} enabled - Whether the mode should be on.
	 * @returns {Promise<object>} The new status.
	 */
	function setEnabled(id, enabled) {
		const run = chain.then(async () => {
			const mode = modes.find((item) => item.id === id)
			if (mode === undefined) throw new Error(`未知模式：${id}`)
			if (enabled) await mount(mode)
			else await unmount(mode)
			await settings.update((draft) => {
				const stored = draft.modes ?? {}
				draft.modes = { ...stored, enabled: { ...(stored.enabled ?? {}), [id]: enabled } }
				return draft
			})
			return status()
		})
		chain = run.catch(() => {})
		return run
	}

	/**
	 * Unregister everything. Leaves the persisted intent untouched.
	 *
	 * @returns {Promise<void>} Resolves after disposal.
	 */
	async function dispose() {
		await chain.catch(() => {})
		for (const mode of modes) await unmount(mode)
	}

	return { start, status, setEnabled, dispose }
}
