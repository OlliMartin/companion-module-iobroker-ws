import {
	CompanionActionDefinitions,
	CompanionFeedbackDefinitions,
	CompanionFeedbackValueEvent,
	DropdownChoice,
	JsonValue,
} from '@companion-module/base'
import { Types } from '@iobroker/type-detector'
import { IDeviceHandler, ILogger, ISubscriptionManager } from '../types.js'
import { inject, injectable } from 'tsyringe'
import { DiTokens } from '../dependency-injection/tokens.js'
import { DeviceClassifier } from '../device-classifier.js'
import { ColorHandler } from '../type-handlers/color-handler.js'
import { FeedbackType } from '../feedback-type.js'

export const LightTypes: Set<Types> = new Set<Types>([Types.hue, Types.cie, Types.rgb])

@injectable()
export class LightHandler implements IDeviceHandler {
	/**
	 * Initializes a new instance of {@link LightHandler}
	 * @param _logger - A logger
	 * @param _subscriptionManager - The subscription manager used to construct feedback callbacks
	 * @param _deviceClassifier - The device classifier providing device mappings
	 * @param _colorHandler - The color handler to map color values to and from the companion format to RGB, HUE, etc.
	 */
	constructor(
		@inject(DiTokens.Logger) private readonly _logger: ILogger,
		@inject(DiTokens.SubscriptionManager) private readonly _subscriptionManager: ISubscriptionManager,
		@inject(DeviceClassifier) private readonly _deviceClassifier: DeviceClassifier,
		@inject(ColorHandler) private readonly _colorHandler: ColorHandler,
	) {}

	/** {@inheritDoc IDeviceHandler.getName} */
	getName(): string {
		return 'LightHandler'
	}

	/** {@inheritDoc IDeviceHandler.getHandledTypes} */
	getHandledTypes(): Types[] {
		return [Types.rgb]
	}

	/** {@inheritDoc IDeviceHandler.getActionDefinitions} */
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
						default: lightOptions[0]?.id ?? '',
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

	/** {@inheritDoc IDeviceHandler.getFeedbackDefinitions} */
	getFeedbackDefinitions(): CompanionFeedbackDefinitions {
		const typeByChannel = this._deviceClassifier.getTypesByChannel()

		const lightIds = Object.entries(typeByChannel).filter(([_, t]) => LightTypes.has(t))
		const lightOptions: DropdownChoice[] = lightIds.map(([id, _]) => ({ id: id, label: id }))

		this._logger.logDebug(`Discovered ${lightIds.length} 'light' devices.`)

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
						default: lightOptions[0]?.id ?? '',
						choices: lightOptions,
					},
				],
				callback: this._subscriptionManager.makeDeviceFeedbackCallback(this.retrieveColorValue.bind(this)),
			},
		}
	}

	private async setColor(deviceId: string, companionColor: number): Promise<void> {
		this._logger.logDebug(`Setting color to ${companionColor} for ${deviceId}.`)
		const { typeOfDevice, stateValues } = this._deviceClassifier.getStateInfoByDevice(deviceId)

		await this._colorHandler.setColorDeviceAgnostic(deviceId, typeOfDevice, stateValues, companionColor)
	}

	private retrieveColorValue = (feedback: CompanionFeedbackValueEvent): JsonValue => {
		const deviceId = String(feedback.options.channel_id)
		const { typeOfDevice, stateValues } = this._deviceClassifier.getStateInfoByDevice(deviceId)

		return this._colorHandler.getColorDeviceAgnostic(deviceId, typeOfDevice, stateValues)
	}
}
