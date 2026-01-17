import { inject, injectable } from 'tsyringe'
import { IoBrokerWsClient } from './io-broker/io-broker-ws-client.js'
import { DiTokens } from './dependency-injection/tokens.js'
import { ILogger, ISubscriptionManager, ISubscriptionState } from './types.js'
import { CompanionFeedbackInfo } from '@companion-module/base'
import { FeedbackId } from './feedback.js'
import { DeviceClassifier } from './device-classifier.js'

@injectable()
export class SubscriptionManager implements ISubscriptionManager {
	private readonly _logger: ILogger
	private readonly _wsClient: IoBrokerWsClient
	private readonly _deviceClassifier: DeviceClassifier
	private readonly _subscriptionState: ISubscriptionState

	constructor(
		@inject(DiTokens.Logger) logger: ILogger,
		@inject(IoBrokerWsClient) wsClient: IoBrokerWsClient,
		@inject(DeviceClassifier) deviceClassifier: DeviceClassifier,
		@inject(DiTokens.SubscriptionState) subscriptionState: ISubscriptionState,
	) {
		this._logger = logger
		this._wsClient = wsClient
		this._deviceClassifier = deviceClassifier
		this._subscriptionState = subscriptionState
	}

	isEntitySubscribed(entityId: string): boolean {
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

		this.subscribe(entityId, feedback.id, feedback.feedbackId as FeedbackId)
	}

	private ensureDeviceSubscribed<TIn extends CompanionFeedbackInfo>(feedback: TIn): void {
		const deviceId = String(feedback.options.channel_id)

		if (deviceId === null || deviceId === undefined) {
			return
		}

		// This is the somewhat lazy approach that should work for most devices. Let's see how far this gets us.
		const missingStates = this._deviceClassifier
			.getStatesByDevice(deviceId)
			// .filter((s) => s.required)
			.filter((s) => !!s.id)
			.filter((s) => !this.isEntitySubscribed(s.id))

		if (missingStates.length === 0) {
			return
		}

		for (const missingState of missingStates) {
			this.subscribe(missingState.id, feedback.id, feedback.feedbackId as FeedbackId)
		}
	}

	// Refer to https://github.com/bitfocus/companion/issues/3879
	// and: https://github.com/bitfocus/companion-module-base/wiki/Subscribe-unsubscribe-flow
	// Since subscribe is not called by option change by design, we wrap the call to the callback function
	// and check if a unknown entity is requested.
	// If this is the case, we update the iob subscription in main, which will immediately request the current value.
	// This will in turn trigger the checkFeedback function so that the value shows up nearly immediately (minus the round-trips).
	// NOTE: The implementation does not account for cleaning up of subscriptions that are obsolete.
	// That's ok-ish for a first version, but should be revisited!
	public makeFeedbackCallback<TIn extends CompanionFeedbackInfo, TOut>(
		callbackFn: (feedback: TIn) => TOut,
	): (feedback: TIn) => TOut {
		return SubscriptionManager.wrapCallback(this.ensurePlainSubscribed.bind(this), callbackFn)
	}

	public makeDeviceFeedbackCallback<TIn extends CompanionFeedbackInfo, TOut>(
		callbackFn: (feedback: TIn) => TOut,
	): (feedback: TIn) => TOut {
		return SubscriptionManager.wrapCallback(this.ensureDeviceSubscribed.bind(this), callbackFn)
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

	public clear(): void {
		this._subscriptionState.clear()

		void this.subscribeToIobStates()
	}

	async subscribeToIobStates(): Promise<void> {
		if (!this._wsClient.isConnected()) {
			this._logger.logWarning('The callback to subscribe to states was called, but no iob-ws client is available.')
			return
		}

		const previousSubscribedEntityIds: string[] = this._wsClient.getSubscribedIds()
		const subscribedIds = this._subscriptionState.getEntityIds() ?? []

		const removed = previousSubscribedEntityIds.filter((eId) => !subscribedIds.includes(eId))
		const added = (subscribedIds ?? []).filter((eId) => !previousSubscribedEntityIds.includes(eId))

		if (removed.length === 0 && added.length === 0) {
			this._logger.logTrace('No changes to subscribed entities.')
			return
		}

		this._wsClient.unsubscribeAll()

		this._logger.logInfo(`Subscribing to ${subscribedIds.length} ioBroker entities.`)
		this._logger.logDebug(`Removed: [${removed.join(', ')}] Added: [${added.join(', ')}]`)

		// await this._wsClient.subscribeStates(this.subscribedEntityIds, this.onStateValueChange.bind(this))
	}

	public subscribe(entityId: string, feedbackId: string, feedbackType: FeedbackId): void {
		let entries = this._subscriptionState.get(entityId)
		if (!entries) {
			entries = new Map()
			this._subscriptionState.set(entityId, entries)
		}
		entries.set(feedbackId, feedbackType)

		void this.subscribeToIobStates()
	}
}
