import { FeedbackId } from './feedback.js'
import { CompanionFeedbackInfo } from '@companion-module/base'
import { DeviceClassifier } from './device-classifier.js'

export class EntitySubscriptions {
	private readonly raiseSubscriptionsChanged: () => Promise<void> | undefined
	private readonly getSubscribedIobIds: () => string[]
	private readonly getDeviceClassifier: () => DeviceClassifier

	private readonly data: Map<string, Map<string, FeedbackId>>

	constructor(
		raiseSubscriptionsChanged: () => Promise<void> | undefined,
		getSubscribedIobIds: () => string[],
		getDeviceClassifier: () => DeviceClassifier,
	) {
		this.raiseSubscriptionsChanged = raiseSubscriptionsChanged
		this.getSubscribedIobIds = getSubscribedIobIds.bind(this)
		this.getDeviceClassifier = getDeviceClassifier.bind(this)

		this.data = new Map()
	}

	public getFeedbackInstanceIds(entityId: string): string[] {
		const entries = this.data.get(entityId)
		if (entries) {
			return Array.from(entries.keys())
		} else {
			return []
		}
	}

	public getEntityIds(): string[] {
		return Array.from(this.data.keys())
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

	isEntitySubscribed(entityId: string): boolean {
		return this.getSubscribedIobIds().includes(entityId)
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
		const missingStates = this.getDeviceClassifier()
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
		return EntitySubscriptions.wrapCallback(this.ensurePlainSubscribed.bind(this), callbackFn)
	}

	public makeDeviceFeedbackCallback<TIn extends CompanionFeedbackInfo, TOut>(
		callbackFn: (feedback: TIn) => TOut,
	): (feedback: TIn) => TOut {
		return EntitySubscriptions.wrapCallback(this.ensureDeviceSubscribed.bind(this), callbackFn)
	}

	public subscribe(entityId: string, feedbackId: string, feedbackType: FeedbackId): void {
		let entries = this.data.get(entityId)
		if (!entries) {
			entries = new Map()
			this.data.set(entityId, entries)
		}
		entries.set(feedbackId, feedbackType)

		void this.raiseSubscriptionsChanged()
	}

	public clear(): void {
		this.data.clear()

		void this.raiseSubscriptionsChanged()
	}
}
