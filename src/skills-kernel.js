/**
 * The vendored skill kernel, mounted as one part of this plugin.
 *
 * `skills/` holds a self-contained copy of the skill-management engine derived
 * from `@michengai/dsh-skills-manager` (Apache-2.0, see `skills/NOTICE`). It is
 * ordinary source of this project: nothing here imports that plugin, and the
 * plugin does not need to be installed for this module to work.
 *
 * What this file does:
 *
 *   1. hands the kernel a narrow, explicitly-built context rather than the
 *      plugin's own `ctx`, so the kernel only ever registers the two things it
 *      is responsible for (its skill provider and its `create_skill` tool) and
 *      cannot reach the manager's other services;
 *   2. calls the kernel's `apply` directly and forwards its effects, so the
 *      routes, provider, and tool it registers join this plugin's lifecycle.
 *      Wrapping `apply` in another `ctx.effect` would move those registrations
 *      into a second generation and the Host would never see them;
 *   3. degrades instead of throwing: a kernel that fails to activate logs one
 *      warning and leaves the rest of the panel working.
 *
 * The kernel's route paths do not collide with this plugin's own endpoints, so
 * both tables share the `/api/manager` prefix unchanged.
 *
 * @module dsh-manager/skills-kernel
 */

import * as kernel from '../skills/index.js'

/** The prefix the kernel's routes are registered under. */
const KERNEL_PREFIX = '/api/manager'

/**
 * Make the tool registry tolerant of a duplicate registration.
 *
 * The kernel registers a `create_skill` tool. If that name is already taken,
 * the Host throws, and because the kernel's `apply` is synchronous that throw
 * aborts the rest of the mount — including every route. Here a refused tool is
 * logged and dropped instead, so the routes and the skill provider still land.
 *
 * @param {object|undefined} tools - The Host tools service.
 * @param {object} [logger] - Where to report a dropped tool.
 * @returns {object|undefined} A registry that never rejects a registration.
 */
function wrapOptionalTools(tools, logger) {
	if (tools === undefined || tools === null || typeof tools.register !== 'function') return tools
	return {
		...tools,
		register: (definition) => {
			try {
				return tools.register(definition)
			} catch (caught) {
				const reason = caught instanceof Error ? caught.message : String(caught)
				logger?.warn?.(`dsh-manager: create_skill 工具注册被拒绝（技能目录与面板仍可用）：${reason}`)
				return () => {}
			}
		},
	}
}

/**
 * Build the context the kernel is allowed to see.
 *
 * The kernel reads a handful of Host services and registers a skill provider
 * and one tool. Everything it touches is forwarded explicitly; anything else
 * is undefined, which is the kernel's own signal that the optional capability
 * is absent.
 *
 * @param {object} ctx - This plugin's Host context.
 * @returns {object} The narrowed context handed to the kernel.
 */
function kernelContext(ctx, logger) {
	const connection = ctx.get('connection')
	if (connection === undefined || connection === null) {
		throw new Error('dsh-manager: the Host connection service is not available for the skill kernel')
	}
	return {
		/** Route registration, the only thing the kernel needs `connection` for. */
		connection: {
			fetch: {
				register: (route) => {
					// The kernel already carries this plugin's prefix and client
					// marker (see skills/NOTICE), so its routes register as-is.
					if (!String(route.path ?? '').startsWith(`${KERNEL_PREFIX}/`)) {
						throw new Error(`dsh-manager: kernel route escaped ${KERNEL_PREFIX}: ${route.path}`)
					}
					// `ConnectionFetchRoute.requestBody` is required by the Host,
					// but the vendored kernel omits it and leans on its own default
					// of "buffered". A route without it is rejected, which surfaces
					// as a plain 404 for every kernel endpoint.
					return connection.fetch.register({
						path: route.path,
						methods: route.methods,
						requestBody: route.requestBody ?? 'buffered',
						fetch: route.fetch,
					})
				},
			},
		},
		skills: ctx.get('skills'),
		// The kernel's `create_skill` tool is optional: the same tool name can
		// already be taken (another skill plugin, or a re-activation that has not
		// finished unwinding). Losing that one tool must not abort the mount,
		// because the kernel registers its routes in the same synchronous pass.
		tools: wrapOptionalTools(ctx.get('tools'), logger),
		sessions: ctx.get('sessions'),
		agents: ctx.get('agents'),
		logger: ctx.logger,
		/** Effect registration, so the kernel's own disposers join this plugin's. */
		effect: (fn, label) => ctx.effect(fn, label),
		on: (event, listener) => ctx.on(event, listener),
		emit: (...args) => ctx.emit(...args),
		get: (name) => {
			// Only the services the kernel actually asks for are forwarded.
			const allowed = new Set(['agents', 'sandboxPolicy', 'sessionProjections', 'sessions', 'workspaceRegistry', 'skills', 'tools'])
			return allowed.has(name) ? ctx.get(name) : undefined
		},
	}
}

/**
 * Mount the vendored kernel.
 *
 * @param {object} ctx - This plugin's Host context.
 * @param {object} options - Mount options.
 * @param {object} options.logger - Where to report the outcome.
 * @returns {{mounted: boolean, error: string}} The outcome, never a throw.
 */
export function createSkillsKernel(ctx, { logger } = {}) {
	let mounted = false
	let error = ''
	/** Routes the kernel handed over successfully; reported for diagnostics. */
	let registered = 0

	// Build the narrowed context before calling into the kernel: inside a Host
	// effect callback the services are not resolvable, so reading `connection`
	// there yields undefined and the kernel would silently skip its whole route
	// table.
	const narrowed = kernelContext(ctx, logger)
	const registerRoute = narrowed.connection.fetch.register
	narrowed.connection.fetch.register = (route) => {
		try {
			const dispose = registerRoute(route)
			registered += 1
			return dispose
		} catch (caught) {
			// Surface why a route was refused: a silent rejection here is exactly
			// what makes every kernel endpoint answer 404 with no other symptom.
			const reason = caught instanceof Error ? caught.message : String(caught)
			logger?.warn?.(`dsh-manager: 内核路由注册被拒绝 ${route.path}：${reason}`)
			return () => {}
		}
	}

	try {
		// Call `apply` directly rather than wrapping it in `ctx.effect`. The
		// kernel already owns its lifecycle: it registers its provider, its
		// `create_skill` tool and every route inside its own `ctx.effect`
		// callbacks, which this plugin's context forwards. Nesting another effect
		// around it would move those registrations into a second generation and
		// the Host would never see the routes.
		const running = kernel.apply(narrowed, {})
		void Promise.resolve(running).catch((caught) => {
			logger?.warn?.(`dsh-manager: 技能内核运行出错：${caught instanceof Error ? caught.message : String(caught)}`)
		})
		mounted = true
	} catch (caught) {
		error = caught instanceof Error ? caught.message : String(caught)
		logger?.warn?.(`dsh-manager: 技能内核挂载失败，面板其余功能不受影响：${error}`)
	}

	return { mounted, error, routes: registered }
}

/** The provider name the kernel registers under, for catalog attribution. */
export const KERNEL_EXTERNAL_PROVIDER = 'manager-external'
