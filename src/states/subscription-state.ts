import { ILogger, ISubscriptionState } from '../types.js'
import { FeedbackId } from '../feedback.js'
import { inject, injectable } from 'tsyringe'
import { DiTokens } from '../dependency-injection/tokens.js'

@injectable()
export class SubscriptionState implements ISubscriptionState {
	private readonly _logger: ILogger

	private readonly data: Map<string, Map<string, FeedbackId>>

	constructor(@inject(DiTokens.Logger) logger: ILogger) {
		this._logger = logger
		this.data = new Map()

		this._logger.logTrace('Initialized subscription state.')
	}

	get(entityId: string): Map<string, FeedbackId> {
		return this.data.get(entityId) ?? new Map<string, FeedbackId>()
	}
	set(entityId: string, entries: Map<string, FeedbackId>): void {
		this.data.set(entityId, entries)
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

	public clear(): void {
		this.data.clear()
	}
}
