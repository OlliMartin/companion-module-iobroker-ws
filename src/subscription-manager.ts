import { inject, injectable } from 'tsyringe'
import { IoBrokerWsClient } from './io-broker/io-broker-ws-client.js'
import { DiTokens } from './dependency-injection/tokens.js'
import { ILogger, ISubscriptionManager, ISubscriptionState } from './types.js'
import { CompanionFeedbackInfo } from '@companion-module/base'
import { FeedbackType } from './feedback-type.js'
import { DeviceClassifier } from './device-classifier.js'
import debounceFn, { DebouncedFunction } from 'debounce-fn'

@injectable()
export class SubscriptionManager implements ISubscriptionManager {
	private readonly onSubscriptionChange: DebouncedFunction<[feedbackType?: FeedbackType], Promise<void> | undefined>

	/**
	 * Initializes a new instance of {@link SubscriptionManager}
	 * @param _logger - A logger
	 * @param _wsClient - A ioBroker websocket client to interact with the backend
	 * @param _deviceClassifier - The device classifier providing device mappings
	 * @param _subscriptionState - The subscription state used to track feedbacks
	 */
	constructor(
		@inject(DiTokens.Logger) private readonly _logger: ILogger,
		@inject(IoBrokerWsClient) private readonly _wsClient: IoBrokerWsClient,
		@inject(DeviceClassifier) private readonly _deviceClassifier: DeviceClassifier,
		@inject(DiTokens.SubscriptionState) private readonly _subscriptionState: ISubscriptionState,
	) {
		this.onSubscriptionChange = debounceFn(this.subscribeToIobStates.bind(this), {
			wait: 10,
			maxWait: 50,
			before: false,
			after: true,
		})
	}

	// Refer to https://github.com/bitfocus/companion/issues/3879
	// and: https://github.com/bitfocus/companion-module-base/wiki/Subscribe-unsubscribe-flow
	// Since subscribe is not called by option change by design, we wrap the call to the callback function
	// and check if a unknown entity is requested.
	// If this is the case, we update the iob subscription in main, which will immediately request the current value.
	// This will in turn trigger the checkFeedback function so that the value shows up nearly immediately (minus the round-trips).
	// NOTE: The implementation does not account for cleaning up of subscriptions that are obsolete.
	// That's ok-ish for a first version, but should be revisited!
	/** {@inheritDoc ISubscriptionManager.makeFeedbackCallback} */
	public makeFeedbackCallback<TIn extends CompanionFeedbackInfo, TOut>(
		callbackFn: (feedback: TIn) => TOut,
	): (feedback: TIn) => TOut {
		return SubscriptionManager.wrapCallback(this.ensurePlainSubscribed.bind(this), callbackFn)
	}

	/** {@inheritDoc ISubscriptionManager.makeDeviceFeedbackCallback} */
	public makeDeviceFeedbackCallback<TIn extends CompanionFeedbackInfo, TOut>(
		callbackFn: (feedback: TIn) => TOut,
	): (feedback: TIn) => TOut {
		return SubscriptionManager.wrapCallback(this.ensureDeviceSubscribed.bind(this), callbackFn)
	}

	/** {@inheritDoc ISubscriptionManager.subscribe} */
	public subscribe(entityId: string, feedbackId: string, feedbackType: FeedbackType): void {
		let entries: Map<string, FeedbackType> | undefined = this._subscriptionState.get(entityId)
		if (!entries) {
			entries = new Map<string, FeedbackType>()
			this._subscriptionState.set(entityId, entries)
		}
		entries.set(feedbackId, feedbackType)

		if (feedbackType !== FeedbackType.ReadLastUpdated) {
			this._logger.logTrace(`Subscribing feedback ${feedbackId} to entity ${entityId}.`)
		}

		void this.onSubscriptionChange(feedbackType)
	}

	private isEntitySubscribed(entityId: string): boolean {
		return this._wsClient.getSubscribedIds().includes(entityId)
	}

	private ensurePlainSubscribed<TIn extends CompanionFeedbackInfo>(feedback: TIn): void {
		const entityId = String(feedback.options.entity_id)

		if (entityId === null || entityId === undefined) {
			return
		}

		if (this.isEntitySubscribed(entityId)) {
			return
		}

		this.subscribe(entityId, feedback.id, feedback.feedbackId as FeedbackType)
	}

	private ensureDeviceSubscribed<TIn extends CompanionFeedbackInfo>(feedback: TIn): void {
		const deviceId = String(feedback.options.channel_id)

		if (deviceId === null || deviceId === undefined) {
			return
		}

		// This is the somewhat lazy approach that should work for most devices. Let's see how far this gets us.
		const missingStates = this._deviceClassifier
			.getStatesByDevice(deviceId)
			.filter((s) => !!s.id)
			.filter((s) => !this.isEntitySubscribed(s.id))

		if (missingStates.length === 0) {
			return
		}

		for (const missingState of missingStates) {
			this.subscribe(missingState.id, feedback.id, feedback.feedbackId as FeedbackType)
		}
	}

	private static wrapCallback<TIn extends CompanionFeedbackInfo, TOut>(
		preCallbackFn: (feedback: TIn) => void,
		callbackFn: (feedback: TIn) => TOut,
	): (feedback: TIn) => TOut {
		return (feedback: TIn) => {
			preCallbackFn(feedback)
			return callbackFn(feedback)
		}
	}

	private async subscribeToIobStates(feedbackType?: FeedbackType): Promise<void> {
		const previousSubscribedEntityIds: string[] = this._wsClient.getSubscribedIds()
		const subscribedIds = this._subscriptionState.getEntityIds() ?? []

		const removed = previousSubscribedEntityIds.filter((eId) => !subscribedIds.includes(eId))
		const added = (subscribedIds ?? []).filter((eId) => !previousSubscribedEntityIds.includes(eId))

		if (removed.length === 0 && added.length === 0) {
			if (feedbackType !== FeedbackType.ReadLastUpdated) {
				this._logger.logTrace(
					`No changes to subscribed entities. Subscribed WS-Client: ${previousSubscribedEntityIds.length} | Subscription State: ${subscribedIds.length}`,
				)
			}

			return
		}

		this._wsClient.unsubscribeAll()

		this._logger.logInfo(`Subscribing to ${subscribedIds.length} ioBroker entities.`)
		this._logger.logDebug(`Removed: [${removed.join(', ')}] Added: [${added.join(', ')}]`)

		await this._wsClient.subscribeStates(subscribedIds)
	}
}
