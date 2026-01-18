import { ILogger, ISubscriptionState } from '../types.js'
import { FeedbackType } from '../feedback-type.js'
import { inject, injectable } from 'tsyringe'
import { DiTokens } from '../dependency-injection/tokens.js'

@injectable()
export class SubscriptionState implements ISubscriptionState {
	private readonly data: Map<string, Map<string, FeedbackType>>

	/**
	 * Initializes a new instance of {@link SubscriptionState}
	 * @param _logger - A logger
	 */
	constructor(@inject(DiTokens.Logger) private readonly _logger: ILogger) {
		this.data = new Map()

		this._logger.logTrace('Initialized subscription state.')
	}

	/** {@inheritDoc ISubscriptionState.get} */
	public get(entityId: string): Map<string, FeedbackType> | undefined {
		return this.data.get(entityId)
	}

	/** {@inheritDoc ISubscriptionState.set} */
	public set(entityId: string, entries: Map<string, FeedbackType>): void {
		this.data.set(entityId, entries)
	}

	/** {@inheritDoc ISubscriptionState.getFeedbackInstanceIds} */
	public getFeedbackInstanceIds(entityId: string): string[] {
		const entries = this.data.get(entityId)
		if (entries) {
			return Array.from(entries.keys())
		} else {
			return []
		}
	}

	/** {@inheritDoc ISubscriptionState.getEntityIds} */
	public getEntityIds(): string[] {
		return Array.from(this.data.keys())
	}
}
