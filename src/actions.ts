import type { ModuleInstance } from './main.js'
import { ToggleStatePicker } from './choices.js'
import { IobPushApi } from './push-events.js'
import type { CompanionActionInfo } from '@companion-module/base'

export function UpdateActions(self: ModuleInstance, iobPushApi: IobPushApi, iobObjects: ioBroker.Object[]): void {
	const subscribeEntityPicker = (action: CompanionActionInfo): void => {
		const entityId = String(action.options.entity_id)
		console.log(`Changed action: ${action.actionId} -> ${entityId}`)
	}

	self.setActionDefinitions({
		toggle: {
			name: 'Toggle State',
			options: [ToggleStatePicker(iobObjects, undefined)],
			subscribe: subscribeEntityPicker,
			callback: async (event) => {
				void iobPushApi.toggleState(String(event.options.entity_id))
			},
		},
	})
}
