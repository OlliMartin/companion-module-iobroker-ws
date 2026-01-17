import { IMutableState } from '../types.js'

export class IoBrokerState implements IMutableState {
	private stateById: Map<string, ioBroker.State> = new Map<string, ioBroker.State>()
	private objectDetails: ioBroker.Object[] = []

	public getObjects(): ioBroker.Object[] {
		return this.objectDetails
	}

	public getStates(): Map<string, ioBroker.State> {
		return this.stateById
	}

	public setObjects(objectDetails: ioBroker.Object[]): void {
		this.objectDetails = objectDetails
	}

	public setStates(states: Map<string, ioBroker.State>): void {
		this.stateById = states
	}

	public clear(): void {
		this.objectDetails = []
		this.stateById = new Map<string, ioBroker.State>()
	}
}
