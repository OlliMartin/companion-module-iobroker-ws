import type { ModuleInstance } from './main.js'
import { ToggleStatePicker } from './choices.js'
import { IobPushApi } from './push-events.js'

export function UpdateActions(self: ModuleInstance, iobPushApi: IobPushApi, iobObjects: ioBroker.Object[]): void {
	self.setActionDefinitions({
		toggle: {
			name: 'Toggle State',
			options: [ToggleStatePicker(iobObjects, undefined)],
			callback: async (event) => {
				void iobPushApi.toggleState(String(event.options.entity_id))
			},
		},
	})
}
