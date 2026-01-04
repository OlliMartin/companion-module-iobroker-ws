import {
	combineRgb,
	CompanionFeedbackBooleanEvent,
	CompanionFeedbackInfo,
	CompanionFeedbackValueEvent,
	JsonValue,
} from '@companion-module/base'
import type { ModuleInstance } from './main.js'

import { FeedbackId } from './feedback.js'
import { EntitySubscriptions } from './state.js'
import { EntityPicker } from './choices.js'

export function UpdateFeedbacks(
	self: ModuleInstance,
	iobObjects: ioBroker.Object[],
	getState: () => Map<string, ioBroker.State>,
	entitySubscriptions: EntitySubscriptions,
): void {
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

	const subscribeEntityPicker = (feedback: CompanionFeedbackInfo): void => {
		const entityId = String(feedback.options.entity_id)
		entitySubscriptions.subscribe(entityId, feedback.id, feedback.feedbackId as FeedbackId)
	}
	const unsubscribeEntityPicker = (feedback: CompanionFeedbackInfo): void => {
		const entityId = String(feedback.options.entity_id)
		entitySubscriptions.unsubscribe(entityId, feedback.id)
	}

	self.setFeedbackDefinitions({
		ChannelState: {
			type: 'boolean',
			name: 'Change from switch state',
			description: 'If the switch state matches the rule, change style of the bank',
			options: [EntityPicker(iobObjects, undefined)],
			defaultStyle: {
				color: combineRgb(0, 0, 0),
				bgcolor: combineRgb(0, 255, 0),
			},
			callback: (feedback): boolean => checkEntityOnOffState(feedback),
			subscribe: subscribeEntityPicker,
			unsubscribe: unsubscribeEntityPicker,
		},
		ReadValueLocal: {
			type: 'value',
			name: 'Populate ioBroker state',
			description: 'Sync a state value from ioBroker',
			options: [EntityPicker(iobObjects, undefined)],
			callback: retrieveCurrentValue,
			subscribe: subscribeEntityPicker,
			unsubscribe: unsubscribeEntityPicker,
		},
	})
}
