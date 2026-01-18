import { ILogger, IMutableState } from '../types.js'
import { inject, injectable } from 'tsyringe'
import { DiTokens } from '../dependency-injection/tokens.js'

@injectable()
export class IoBrokerState implements IMutableState {
	private stateById: Map<string, ioBroker.State> = new Map<string, ioBroker.State>()
	private objectDetails: ioBroker.Object[] = []

	/**
	 * Initializes a new instance of {@link IoBrokerState}
	 * @param _logger - A logger
	 */
	constructor(@inject(DiTokens.Logger) private readonly _logger: ILogger) {
		this._logger.logTrace('Initialized ioBroker state.')
	}

	/** {@inheritDoc IMutableState.getObjects} */
	public getObjects(): ioBroker.Object[] {
		return this.objectDetails
	}

	/** {@inheritDoc IMutableState.getStates} */
	public getStates(): Map<string, ioBroker.State> {
		return this.stateById
	}

	/** {@inheritDoc IMutableState.setObjects} */
	public setObjects(objectDetails: ioBroker.Object[]): void {
		this.objectDetails = objectDetails
	}

	/** {@inheritDoc IMutableState.setStates} */
	public setStates(states: Map<string, ioBroker.State>): void {
		this.stateById = states
	}

	/** {@inheritDoc IMutableState.clear} */
	public clear(): void {
		this.objectDetails = []
		this.stateById = new Map<string, ioBroker.State>()
	}
}
