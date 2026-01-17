import {
	CompanionActionDefinitions,
	CompanionFeedbackDefinitions,
	CompanionFeedbackValueEvent,
	DropdownChoice,
	JsonValue,
} from '@companion-module/base'
import { Types } from '@iobroker/type-detector'
import { IDeviceHandler, IEntityState, IioBrokerClient, ILogger, ISubscriptionManager, StateInfo } from '../types.js'
import { inject, injectable } from 'tsyringe'
import { DiTokens } from '../dependency-injection/tokens.js'
import { DeviceClassifier } from '../device-classifier.js'
import { getColorDeviceAgnostic, setColorDeviceAgnostic } from '../type-handlers/color-handler.js'
import { FeedbackType } from '../feedback-type.js'

export const LightTypes: Set<Types> = new Set<Types>([Types.hue, Types.cie, Types.rgb])

@injectable()
export class LightHandler implements IDeviceHandler {
	constructor(
		@inject(DiTokens.Logger) private readonly _logger: ILogger,
		@inject(DiTokens.State) private readonly _entityState: IEntityState,
		@inject(DiTokens.SubscriptionManager) private readonly _subscriptionManager: ISubscriptionManager,
		@inject(DiTokens.IoBrokerClient) private readonly _iobClient: IioBrokerClient,
		@inject(DeviceClassifier) private readonly _deviceClassifier: DeviceClassifier,
	) {}

	getName(): string {
		return 'LightHandler'
	}

	getHandledTypes(): Types[] {
		return [Types.rgb]
	}
	getActionDefinitions(): CompanionActionDefinitions {
		const typeByChannel = this._deviceClassifier.getTypesByChannel()

		const lightIds = Object.entries(typeByChannel).filter(([_, t]) => this.getHandledTypes().includes(t))
		const lightOptions: DropdownChoice[] = lightIds.map(([id, _]) => ({ id: id, label: id }))

		return {
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
					void this.setColor(deviceId, event.options.color)
				},
			},
		}
	}
	getFeedbackDefinitions(): CompanionFeedbackDefinitions {
		const typeByChannel = this._deviceClassifier.getTypesByChannel()

		const lightIds = Object.entries(typeByChannel).filter(([_, t]) => LightTypes.has(t))
		const lightOptions: DropdownChoice[] = lightIds.map(([id, _]) => ({ id: id, label: id }))

		return {
			[FeedbackType.ReadColorOfLight]: {
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
				callback: this._subscriptionManager.makeDeviceFeedbackCallback(this.retrieveColorValue.bind(this)),
			},
		}
	}

	private async setColor(deviceId: string, companionColor: number): Promise<void> {
		this._logger.logDebug(`Setting color to ${companionColor} for ${deviceId}.`)

		const state = this._entityState.getStates()

		const typeOfDevice = this._deviceClassifier.getTypeByDevice(deviceId)
		const statesOfDevice = this._deviceClassifier.getStatesByDevice(deviceId)

		if (!typeOfDevice || statesOfDevice.length === 0) {
			return
		}

		const stateValues: StateInfo[] = statesOfDevice
			.map((stateDef) => ({ definition: stateDef, value: state.get(stateDef.id) }))
			.filter((tuple) => tuple.value !== undefined)
			.map((tuple) => ({ ...tuple, value: tuple.value! }))

		return setColorDeviceAgnostic(this._iobClient, deviceId, typeOfDevice, stateValues, companionColor)
	}

	private retrieveColorValue = (feedback: CompanionFeedbackValueEvent): JsonValue => {
		const deviceId = String(feedback.options.channel_id)

		const state = this._entityState.getStates()

		const typeOfDevice = this._deviceClassifier.getTypeByDevice(deviceId)
		const statesOfDevice = this._deviceClassifier.getStatesByDevice(deviceId)

		if (!typeOfDevice || statesOfDevice.length === 0) {
			return null
		}

		const stateValues: StateInfo[] = statesOfDevice
			.map((stateDef) => ({ definition: stateDef, value: state.get(stateDef.id) }))
			.filter((tuple) => tuple.value !== undefined)
			.map((tuple) => ({ ...tuple, value: tuple.value! }))

		return getColorDeviceAgnostic(deviceId, typeOfDevice, stateValues)
	}
}
