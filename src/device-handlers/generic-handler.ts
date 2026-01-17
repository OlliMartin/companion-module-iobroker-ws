import { IDeviceHandler, IEntityState, IioBrokerClient, ISubscriptionManager } from '../types.js'
import { Types } from '@iobroker/type-detector'
import {
	CompanionActionDefinitions,
	CompanionFeedbackBooleanEvent,
	CompanionFeedbackDefinitions,
	CompanionFeedbackValueEvent,
	JsonValue,
} from '@companion-module/base'
import { inject, injectable } from 'tsyringe'
import { DiTokens } from '../dependency-injection/tokens.js'
import { EntityPicker, ToggleStatePicker } from '../choices.js'
import { FeedbackType } from '../feedback-type.js'
import { combineRgb } from '@companion-module/base'
import { ActionType } from '../action-type.js'

@injectable()
export class GenericHandler implements IDeviceHandler {
	constructor(
		@inject(DiTokens.State) private readonly _entityState: IEntityState,
		@inject(DiTokens.SubscriptionManager) private readonly _subscriptionManager: ISubscriptionManager,
		@inject(DiTokens.IoBrokerClient) private readonly _iobClient: IioBrokerClient,
	) {}

	getName(): string {
		return 'GenericHandler'
	}

	getHandledTypes(): Types[] {
		return [Types.unknown]
	}

	public getActionDefinitions(): CompanionActionDefinitions {
		const iobObjects = this._entityState.getObjects()

		return {
			[ActionType.Toggle]: {
				name: 'Toggle State',
				options: [ToggleStatePicker(iobObjects, undefined)],
				callback: async (event) => {
					void this._iobClient.toggleState(String(event.options.entity_id))
				},
			},
		}
	}

	public getFeedbackDefinitions(): CompanionFeedbackDefinitions {
		const iobObjects = this._entityState.getObjects()

		return {
			[FeedbackType.ChannelState]: {
				type: 'boolean',
				name: 'Change from switch state',
				description: 'If the switch state matches the rule, change style of the bank',
				options: [EntityPicker(iobObjects, undefined)],
				defaultStyle: {
					color: combineRgb(0, 0, 0),
					bgcolor: combineRgb(0, 0, 0),
				},
				callback: this._subscriptionManager.makeFeedbackCallback(this.checkEntityOnOffState.bind(this)),
			},
			[FeedbackType.ReadValueLocal]: {
				type: 'value',
				name: 'Populate ioBroker state',
				description: 'Sync a state value from ioBroker',
				options: [EntityPicker(iobObjects, undefined)],
				callback: this._subscriptionManager.makeFeedbackCallback(this.retrieveCurrentValue.bind(this)),
			},
			[FeedbackType.ReadLastUpdated]: {
				type: 'value',
				name: 'Populate timestamp of last ioBroker state change',
				description: 'Sync the timestamp of the last state change from ioBroker',
				options: [EntityPicker(iobObjects, undefined)],
				callback: this._subscriptionManager.makeFeedbackCallback(this.retrieveLastChangeTimestamp.bind(this)),
			},
		}
	}

	private checkEntityOnOffState(feedback: CompanionFeedbackBooleanEvent): boolean {
		const state = this._entityState.getStates()
		const entity = state.get(String(feedback.options.entity_id))
		if (entity) {
			const isOn = entity.val === true
			const targetOn = !!feedback.options.state
			return isOn === targetOn
		}
		return false
	}

	private retrieveCurrentValue(feedback: CompanionFeedbackValueEvent): JsonValue {
		const state = this._entityState.getStates()
		const entity = state.get(String(feedback.options.entity_id))

		return entity ? entity.val : null
	}

	private retrieveLastChangeTimestamp(feedback: CompanionFeedbackValueEvent): JsonValue {
		const state = this._entityState.getStates()
		const entity = state.get(String(feedback.options.entity_id))

		return typeof entity?.ts === 'number' ? entity.ts : null
	}
}
