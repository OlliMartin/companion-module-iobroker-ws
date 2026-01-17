import {
	combineRgb,
	CompanionFeedbackBooleanEvent,
	CompanionFeedbackDefinitions,
	CompanionFeedbackValueEvent,
	DropdownChoice,
	JsonValue,
} from '@companion-module/base'
import type { ModuleInstance } from './main.js'

import { FeedbackId } from './feedback.js'
import { EntitySubscriptions } from './state.js'
import { EntityPicker } from './choices.js'
import { LightTypes } from './utils.js'
import { DeviceClassifier } from './device-classifier.js'
import { getColorDeviceAgnostic } from './type-handlers/color-handler.js'
import { IFeedbackConfiguration, StateInfo } from './types.js'
import { injectable } from 'tsyringe'
import { DiTokens } from './dependency-injection/tokens.js'

@injectable({ token: DiTokens.ActionConfiguration })
export class FeedbackConfiguration implements IFeedbackConfiguration {
	updateFeedbacks(cb: (actions: CompanionFeedbackDefinitions) => void): void {
		cb({})
	}
}

export function UpdateFeedbacks(
	self: ModuleInstance,
	iobObjects: ioBroker.Object[],
	getDeviceClassifier: () => DeviceClassifier,
	getState: () => Map<string, ioBroker.State>,
	entitySubscriptions: EntitySubscriptions,
): void {
	const typeByChannel = getDeviceClassifier().getTypesByChannel()

	const lightIds = Object.entries(typeByChannel).filter(([_, t]) => LightTypes.has(t))
	const lightOptions: DropdownChoice[] = lightIds.map(([id, _]) => ({ id: id, label: id }))

	const checkEntityOnOffState = (feedback: CompanionFeedbackBooleanEvent): boolean => {
		const state = getState()
		const entity = state.get(String(feedback.options.entity_id))
		if (entity) {
			const isOn = entity.val === true
			const targetOn = !!feedback.options.state
			return isOn === targetOn
		}
		return false
	}

	const retrieveCurrentValue = (feedback: CompanionFeedbackValueEvent): JsonValue => {
		const state = getState()
		const entity = state.get(String(feedback.options.entity_id))

		return entity ? entity.val : null
	}

	const retrieveLastChangeTimestamp = (feedback: CompanionFeedbackValueEvent): JsonValue => {
		const state = getState()
		const entity = state.get(String(feedback.options.entity_id))

		return typeof entity?.ts === 'number' ? entity.ts : null
	}

	const retrieveColorValue = (feedback: CompanionFeedbackValueEvent): JsonValue => {
		const deviceId = String(feedback.options.channel_id)

		const state = getState()
		const classifier = getDeviceClassifier()

		const typeOfDevice = classifier.getTypeByDevice(deviceId)
		const statesOfDevice = classifier.getStatesByDevice(deviceId)

		if (!typeOfDevice || statesOfDevice.length === 0) {
			return null
		}

		const stateValues: StateInfo[] = statesOfDevice
			.map((stateDef) => ({ definition: stateDef, value: state.get(stateDef.id) }))
			.filter((tuple) => tuple.value !== undefined)
			.map((tuple) => ({ ...tuple, value: tuple.value! }))

		return getColorDeviceAgnostic(deviceId, typeOfDevice, stateValues)
	}

	self.setFeedbackDefinitions({
		ChannelState: {
			type: 'boolean',
			name: 'Change from switch state',
			description: 'If the switch state matches the rule, change style of the bank',
			options: [EntityPicker(iobObjects, undefined)],
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(0, 0, 0),
			},
			callback: entitySubscriptions.makeFeedbackCallback(checkEntityOnOffState),
		},
		ReadValueLocal: {
			type: 'value',
			name: 'Populate ioBroker state',
			description: 'Sync a state value from ioBroker',
			options: [EntityPicker(iobObjects, undefined)],
			callback: entitySubscriptions.makeFeedbackCallback(retrieveCurrentValue),
		},
		[FeedbackId.ReadLastUpdated]: {
			type: 'value',
			name: 'Populate timestamp of last ioBroker state change',
			description: 'Sync the timestamp of the last state change from ioBroker',
			options: [EntityPicker(iobObjects, undefined)],
			callback: entitySubscriptions.makeFeedbackCallback(retrieveLastChangeTimestamp),
		},
		ReadColorOfLight: {
			type: 'value',
			name: 'Read color of light',
			description: 'Sync the color of a light',
			options: [
				{
					type: 'dropdown',
					id: 'channel_id',
					label: 'Channel',
					default: lightOptions[0].id ?? '',
					choices: lightOptions,
				},
			],
			callback: entitySubscriptions.makeDeviceFeedbackCallback(retrieveColorValue),
		},
	})
}
