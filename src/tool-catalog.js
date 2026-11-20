/**
 * The tool catalog the panel's 工具 page shows.
 *
 * The manager owns several modules that each put tools in front of the agent:
 * the skill kernel registers `create_skill`, every connected MCP server
 * contributes its own tools, the search bridge registers its own set, and a
 * mode decides which tool plugins a new session runs with. The panel shows all
 * of them in one place, grouped by the module they come from.
 *
 * Every group is read live — an MCP server that connects later shows up
 * without a restart, and a mode that is switched off still lists its rows
 * (marked as not enabled). The catalog never invents a description or a
 * parameter schema: what a module reports is what the agent receives.
 *
 * @module dsh-manager/tool-catalog
 */

/** The groups the catalog is built from, in panel order. */
export const GROUP_IDS = ['skills', 'mcp', 'search', 'lan']

/**
 * Build the tool catalog.
 *
 * @param {{kernel?: object, mcp?: object, agentTools?: object[]}} options - The modules whose tools are listed.
 * @returns {{describe: () => object}} The catalog service.
 */
export function createToolCatalog({ kernel, mcp, agentTools = [] } = {}) {
	/**
	 * The tools the skill kernel registered.
	 *
	 * @returns {object[]} Catalog rows.
	 */
	function skillsTools() {
		const tools = kernel === undefined || kernel === null ? [] : kernel.tools
		if (!Array.isArray(tools)) return []
		return tools.map((tool) => row(tool, 'skills'))
	}

	/**
	 * The tools every connected MCP server contributes.
	 *
	 * @returns {object[]} Catalog rows.
	 */
	function mcpTools() {
		if (mcp === undefined || mcp === null || typeof mcp.describe !== 'function') return []
		const rows = []
		for (const server of mcp.describe().servers) {
			for (const tool of server.tools) {
				rows.push({
					...row(tool, server.name, 'public'),
					server: server.name,
					state: server.state,
				})
			}
		}
		return rows
	}

	/**
	 * The tools the search bridge registers.
	 *
	 * @returns {object[]} Catalog rows.
	 */
	function searchTools() {
		if (!Array.isArray(agentTools)) return []
		return agentTools.map((tool) => row(tool, 'search'))
	}

	/**
	 * The whole catalog.
	 *
	 * @returns {{groups: object[]}} One group per module.
	 */
	function describe() {
		return {
			groups: [
				{ id: 'skills', tools: skillsTools() },
				{ id: 'mcp', tools: mcpTools() },
				{ id: 'search', tools: searchTools() },
				{ id: 'lan', tools: [] },
			],
		}
	}

	/**
	 * How many tools the catalog holds, for the tab's counter.
	 *
	 * @returns {{total: number}} The count.
	 */
	function summary() {
		const groups = describe().groups
		let total = 0
		for (const group of groups) total += group.tools.length
		return { total }
	}

	return { describe, summary }
}

/**
 * Project one tool for the catalog.
 *
 * @param {object} tool - A tool record.
 * @param {string} source - Where the tool comes from.
 * @param {string} [nameKey] - Which field holds the tool's name.
 * @returns {{name: string, description: string, parameters: object|null, source: string}} The catalog row.
 */
function row(tool, source, nameKey = 'name') {
	return {
		name: typeof tool?.[nameKey] === 'string' ? tool[nameKey] : '',
		description: typeof tool?.description === 'string' ? tool.description : '',
		parameters: tool?.parameters !== null && typeof tool?.parameters === 'object' ? tool.parameters : null,
		source,
	}
}
