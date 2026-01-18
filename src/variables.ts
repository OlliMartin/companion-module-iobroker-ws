import type { ModuleInstance } from './main.js'

/**
 * Populates the module's variable definitions.
 * @param self - A reference to the module instance
 */
export function UpdateVariableDefinitions(self: ModuleInstance): void {
	// TODO: Populate variable value.
	self.setVariableDefinitions([
		{ variableId: 'connected', name: 'Indicates if a connection to ioBroker could be established' },
	])
}
