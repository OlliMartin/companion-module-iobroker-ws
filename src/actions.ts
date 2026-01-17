import type { ModuleInstance } from './main.js'
import { ToggleStatePicker } from './choices.js'
import { IobPushApi } from './push-events.js'
import { CompanionActionDefinitions, DropdownChoice } from '@companion-module/base'
import { LightTypes } from './utils.js'
import ChannelDetector from '@iobroker/type-detector'
import { DeviceClassifier } from './device-classifier.js'
import { IActionConfiguration } from './types.js'
import { injectable } from 'tsyringe'
import { DiTokens } from './dependency-injection/tokens.js'

@injectable({ token: DiTokens.ActionConfiguration })
export class ActionConfiguration implements IActionConfiguration {
	updateActions(cb: (actions: CompanionActionDefinitions) => void): void {
		cb({})
	}
}

export function UpdateActions(
	self: ModuleInstance,
	iobPushApi: IobPushApi,
	iobObjects: ioBroker.Object[],
	deviceClassifier: DeviceClassifier,
): void {
	const typeByChannel = deviceClassifier.getTypesByChannel()

	const lightIds = Object.entries(typeByChannel).filter(([_, t]) => LightTypes.has(t))
	const lightOptions: DropdownChoice[] = lightIds.map(([id, _]) => ({ id: id, label: id }))

	const actions: CompanionActionDefinitions = {
		toggle: {
			name: 'Toggle State',
			options: [ToggleStatePicker(iobObjects, undefined)],
			callback: async (event) => {
				void iobPushApi.toggleState(String(event.options.entity_id))
			},
		},
		lightColor: {
			name: 'Set Light Color',
			options: [
				{
					type: 'dropdown',
					id: 'channel_id',
					label: 'Channel',
					default: lightOptions[0].id ?? '',
					choices: lightOptions,
				},
				{
					type: 'colorpicker',
					id: 'color',
					label: 'Color',
					default: 'FFFFFF',
				},
			],
			callback: (event) => {
				if (!event.options.color || typeof event.options.color !== 'number') {
					return
				}

				const deviceId = String(event.options.channel_id)
				void iobPushApi.setColor(deviceId, event.options.color)
			},
		},
	}

	if (self.config.developmentMode) {
		// This action targets an instance of ioBroker.test-devices, which was build to enable testing
		// for this companion module, see: https://github.com/OlliMartin/ioBroker.test-devices
		// You need to have an instance of it running for the messages to be processed.
		const stateChangeDeviceChoices: DropdownChoice[] = Object.keys(ChannelDetector.Types).map((t) => ({
			id: t,
			label: t,
		}))

		actions['sendStateChange'] = {
			name: 'Simulate IoBroker State Change',
			options: [
				{
					type: 'dropdown',
					id: 'generationType',
					label: 'Generation Type',
					default: 'all',
					choices: [
						{ id: 'all', label: 'All' },
						{ id: 'required', label: 'required' },
					],
				},
				{
					type: 'dropdown',
					id: 'device',
					label: 'Target Device',
					default: stateChangeDeviceChoices[0].id ?? '',
					choices: stateChangeDeviceChoices,
				},
			],
			callback: async (event) => {
				const { device, generationType } = event.options

				if (!device || !generationType) {
					return
				}

				await iobPushApi.sendMessage('test-devices.0', 'SIMULATE_SINGLE_DEVICE_CHANGE', {
					generationType,
					device,
				})
			},
		}
	}

	self.setActionDefinitions(actions)
}
