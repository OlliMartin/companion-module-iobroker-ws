import { FeedbackId } from './feedback.js'
import { CompanionFeedbackInfo } from '@companion-module/base'

export class EntitySubscriptions {
	private readonly raiseSubscriptionsChanged: () => Promise<void> | undefined
	private readonly getSubscribedIobIds: () => string[]

	private readonly data: Map<string, Map<string, FeedbackId>>

	constructor(raiseSubscriptionsChanged: () => Promise<void> | undefined, getSubscribedIobIds: () => string[]) {
		this.raiseSubscriptionsChanged = raiseSubscriptionsChanged
		this.getSubscribedIobIds = getSubscribedIobIds.bind(this)

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

	private ensureSubscribed<TIn extends CompanionFeedbackInfo>(feedback: TIn): void {
		const entityId = String(feedback.options.entity_id)

		if (entityId === null || entityId === undefined) {
			return
		}

		if (this.isEntitySubscribed(entityId)) {
			return
		}

		this.subscribe(entityId, feedback.id, feedback.feedbackId as FeedbackId)
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
		return EntitySubscriptions.wrapCallback(this.ensureSubscribed.bind(this), callbackFn)
	}

	public subscribe(entityId: string, feedbackId: string, type: FeedbackId): void {
		let entries = this.data.get(entityId)
		if (!entries) {
			entries = new Map()
			this.data.set(entityId, entries)
		}
		entries.set(feedbackId, type)

		void this.raiseSubscriptionsChanged()
	}
	public unsubscribe(entityId: string, feedbackId: string): void {
		const entries = this.data.get(entityId)

		if (entries) {
			entries.delete(feedbackId)

			if (entries.size === 0) {
				this.data.delete(entityId)
			}
		}

		void this.raiseSubscriptionsChanged()
	}

	public clear(): void {
		this.data.clear()

		void this.raiseSubscriptionsChanged()
	}
}
