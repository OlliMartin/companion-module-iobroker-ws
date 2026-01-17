import { CompanionActionDefinitions, DropdownChoice } from '@companion-module/base'
import { IActionConfiguration, IDeviceHandler, IioBrokerClient, ILogger } from './types.js'
import { inject, injectAll, injectable } from 'tsyringe'
import { DiTokens } from './dependency-injection/tokens.js'
import { ModuleConfig } from './config.js'
import ChannelDetector from '@iobroker/type-detector'
import { ActionType } from './action-type.js'

@injectable({ token: DiTokens.ActionConfiguration })
export class ActionConfiguration implements IActionConfiguration {
	constructor(
		@inject(DiTokens.Logger) private readonly _logger: ILogger,
		@inject(DiTokens.ModuleConfigurationAccessor) private readonly _configAccessor: () => ModuleConfig,
		@injectAll(DiTokens.DeviceHandler) private readonly deviceHandlers: IDeviceHandler[],
		@inject(DiTokens.IoBrokerClient) private readonly _iobClient: IioBrokerClient,
	) {}

	updateActions(cb: (actions: CompanionActionDefinitions) => void): void {
		const startMs = Date.now()
		this._logger.logDebug(
			`Starting to gather definitions from ${this.deviceHandlers.length} device handlers: [${this.deviceHandlers.map((dh) => dh.getName()).join(', ')}]`,
		)

		const handlerResults = this.deviceHandlers.map((dh) => dh.getActionDefinitions())
		const handlerResultCount = handlerResults.reduce((prev, curr) => prev + Object.keys(curr).length, 0)

		const mergedConfiguration = handlerResults.reduce((prev, curr) => ({ ...prev, ...curr }), {})
		const mergedCount = Object.keys(mergedConfiguration).length

		this._logger.logInfo(
			`Discovered ${handlerResultCount} (after merge: ${mergedCount}) definitions across ${this.deviceHandlers.length} handlers in ${Date.now() - startMs}ms`,
		)

		if (handlerResultCount !== mergedCount) {
			this._logger.logWarning(
				`Expectation not met: The number of definition should not change after merging. This indicates definition keys are reused between handlers and is a programming error.`,
			)
		}

		cb({ ...this.getDevModeActionDefinitions(), ...mergedConfiguration })
	}

	getDevModeActionDefinitions(): CompanionActionDefinitions {
		const config = this._configAccessor()
		if (!config.developmentMode) {
			return {}
		}

		// This action targets an instance of ioBroker.test-devices, which was build to enable testing
		// for this companion module, see: https://github.com/OlliMartin/ioBroker.test-devices
		// You need to have an instance of it running for the messages to be processed.
		const stateChangeDeviceChoices: DropdownChoice[] = Object.keys(ChannelDetector.Types).map((t) => ({
			id: t,
			label: t,
		}))

		return {
			[ActionType.DevModeTriggerStateChange]: {
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

					await this._iobClient.sendMessage('test-devices.0', 'SIMULATE_SINGLE_DEVICE_CHANGE', {
						generationType,
						device,
					})
				},
			},
		}
	}
}
