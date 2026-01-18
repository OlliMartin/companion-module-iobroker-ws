import { CompanionFeedbackDefinitions } from '@companion-module/base'

// import { getColorDeviceAgnostic } from './type-handlers/color-handler.js'
import { IDeviceHandler, IFeedbackConfiguration, ILogger } from './types.js'
import { injectable, inject, injectAll } from 'tsyringe'
import { DiTokens } from './dependency-injection/tokens.js'

@injectable({ token: DiTokens.ActionConfiguration })
export class FeedbackConfiguration implements IFeedbackConfiguration {
	/**
	 * Initializes a new instance of {@link FeedbackConfiguration}
	 * @param _logger - A logger
	 * @param _deviceHandlers - A list of registered device handlers. Refer to {@link DeviceHandlerRegistry}
	 */
	constructor(
		@inject(DiTokens.Logger) private readonly _logger: ILogger,
		@injectAll(DiTokens.DeviceHandler) private readonly _deviceHandlers: IDeviceHandler[],
	) {}

	/** {@inheritDoc IFeedbackConfiguration.updateFeedbacks} */
	updateFeedbacks(cb: (feedbacks: CompanionFeedbackDefinitions) => void): void {
		const startMs = Date.now()
		this._logger.logDebug(
			`Starting to gather definitions from ${this._deviceHandlers.length} device handlers: [${this._deviceHandlers.map((dh) => dh.getName()).join(', ')}]`,
		)

		const handlerResults = this._deviceHandlers.map((dh) => dh.getFeedbackDefinitions())
		const handlerResultCount = handlerResults.reduce((prev, curr) => prev + Object.keys(curr).length, 0)

		const mergedConfiguration = handlerResults.reduce((prev, curr) => ({ ...prev, ...curr }), {})
		const mergedCount = Object.keys(mergedConfiguration).length

		this._logger.logInfo(
			`Discovered ${handlerResultCount} (after merge: ${mergedCount}) definitions across ${this._deviceHandlers.length} handlers in ${Date.now() - startMs}ms`,
		)

		if (handlerResultCount !== mergedCount) {
			this._logger.logWarning(
				`Expectation not met: The number of definition should not change after merging. This indicates definition keys are reused between handlers and is a programming error.`,
			)
		}

		cb(mergedConfiguration)
	}
}
